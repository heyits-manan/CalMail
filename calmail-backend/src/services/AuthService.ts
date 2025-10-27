import { google } from "googleapis";
import * as crypto from "crypto";
import { db } from "../db/db";
import { accounts } from "../db/schema";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "../utils/crypto";
import { config } from "../config";
import { GoogleAccountNotConnectedError, TokenRefreshError } from "../errors";
import type { TokenPair, UserAccount } from "../types";

export class AuthService {
  private stateStore: Map<string, string>;
  private oAuth2Client: InstanceType<typeof google.auth.OAuth2>;

  constructor() {
    this.stateStore = new Map<string, string>();
    this.oAuth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );
  }

  generateAuthUrl(userId: string): string {
    const state = crypto.randomBytes(16).toString("hex");
    this.stateStore.set(state, userId);

    setTimeout(() => {
      this.stateStore.delete(state);
    }, config.oauth.stateTokenExpiryMs);

    const url = this.oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: config.google.scopes,
      state,
      prompt: "consent",
    });

    return url;
  }

  getUserIdFromState(state: string): string | undefined {
    return this.stateStore.get(state);
  }

  clearState(state: string): void {
    this.stateStore.delete(state);
  }

  async handleOAuthCallback(code: string): Promise<void> {
    const { tokens } = await this.oAuth2Client.getToken(code);

    if (!tokens.access_token) {
      throw new Error("Failed to retrieve access token from Google.");
    }

    return;
  }

  async saveTokens(
    userId: string,
    accessToken: string,
    refreshToken?: string,
    scopes?: string
  ): Promise<void> {
    const encryptedAccessToken = encrypt(accessToken);

    const insertValues: typeof accounts.$inferInsert = {
      clerkUserId: userId,
      provider: "google",
      accessToken: encryptedAccessToken,
      scopes: scopes || null,
    };

    const updateValues: Partial<typeof accounts.$inferInsert> = {
      accessToken: encryptedAccessToken,
      scopes: scopes || null,
    };

    if (refreshToken) {
      console.log("Received a new refresh token, updating in DB.");
      const encryptedRefreshToken = encrypt(refreshToken);
      insertValues.refreshToken = encryptedRefreshToken;
      updateValues.refreshToken = encryptedRefreshToken;
    }

    await db
      .insert(accounts)
      .values(insertValues)
      .onConflictDoUpdate({
        target: accounts.clerkUserId,
        set: updateValues,
      });

    console.log("Successfully saved tokens for user:", userId);
  }

  async getUserTokens(userId: string): Promise<TokenPair> {
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.clerkUserId, userId));

    if (userAccounts.length === 0) {
      throw new GoogleAccountNotConnectedError();
    }

    const account = userAccounts[0];
    const accessToken = decrypt(account.accessToken);
    const refreshToken = account.refreshToken
      ? decrypt(account.refreshToken)
      : "";

    return { accessToken, refreshToken };
  }

  async refreshGoogleTokens(userId: string, refreshToken: string): Promise<TokenPair> {
    this.oAuth2Client.setCredentials({ refresh_token: refreshToken });
    const response = await this.oAuth2Client.refreshAccessToken();
    const { access_token, refresh_token, scope } = response.credentials;

    if (!access_token) {
      throw new TokenRefreshError();
    }

    const updatePayload: Partial<typeof accounts.$inferInsert> = {
      accessToken: encrypt(access_token),
      scopes: scope,
    };

    const latestRefreshToken = refresh_token ?? refreshToken;
    if (refresh_token) {
      updatePayload.refreshToken = encrypt(refresh_token);
    }

    await db
      .update(accounts)
      .set(updatePayload)
      .where(eq(accounts.clerkUserId, userId));

    this.oAuth2Client.setCredentials({
      access_token: access_token,
      refresh_token: latestRefreshToken,
    });

    return {
      accessToken: access_token,
      refreshToken: latestRefreshToken,
    };
  }

  getOAuth2Client(accessToken: string, refreshToken?: string): InstanceType<typeof google.auth.OAuth2> {
    const client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );

    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    return client;
  }

  async disconnectGoogleAccount(userId: string): Promise<void> {
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.clerkUserId, userId));

    if (userAccounts.length === 0) {
      throw new GoogleAccountNotConnectedError();
    }

    const userAccount = userAccounts[0];
    const accessToken = decrypt(userAccount.accessToken);

    if (accessToken) {
      try {
        console.log(`Revoking Google OAuth token for user ${userId}`);

        const revokeResponse = await fetch(
          "https://oauth2.googleapis.com/revoke",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: `token=${accessToken}`,
          }
        );

        if (revokeResponse.ok) {
          console.log(`Successfully revoked Google OAuth token for user ${userId}`);
        } else {
          console.warn(
            `Failed to revoke Google OAuth token for user ${userId}. Status: ${revokeResponse.status}`
          );
        }
      } catch (revokeError) {
        console.error(
          `Error revoking Google OAuth token for user ${userId}:`,
          revokeError
        );
      }
    }

    console.log(`Removing Google credentials from database for user ${userId}`);
    await db.delete(accounts).where(eq(accounts.clerkUserId, userId));
    console.log(`Successfully disconnected Google account for user ${userId}`);
  }
}
