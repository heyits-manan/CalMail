import { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { AuthService } from "../services";
import { google } from "googleapis";
import { UnauthorizedError, GoogleAccountNotConnectedError } from "../errors";
import { isUnauthorizedError } from "../utils/errorHandler";

export class AuthController {
  constructor(private authService: AuthService) {}

  generateAuthUrl = async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    if (!userId) {
      throw new UnauthorizedError("User not authenticated.");
    }

    const authUrl = this.authService.generateAuthUrl(userId);
    res.json({ authUrl });
  };

  handleCallback = async (req: Request, res: Response) => {
    const code = req.query.code as string;
    const state = req.query.state as string;

    if (!state) {
      throw new Error("State parameter is missing.");
    }

    const userId = this.authService.getUserIdFromState(state);
    if (!userId) {
      throw new Error("Invalid state or session has expired. Please try again.");
    }

    this.authService.clearState(state);

    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.BACKEND_PUBLIC_URL}/auth/google/callback`
    );

    const { tokens } = await oAuth2Client.getToken(code);
    if (!tokens.access_token) {
      throw new Error("Failed to retrieve access token from Google.");
    }

    await this.authService.saveTokens(
      userId,
      tokens.access_token,
      tokens.refresh_token || undefined,
      tokens.scope || undefined
    );

    res.send("Successfully connected to Google! You can now close this window.");
  };

  getProfile = async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    if (!userId) {
      throw new UnauthorizedError("User not authenticated");
    }

    const tokens = await this.authService.getUserTokens(userId);
    const oAuth2Client = this.authService.getOAuth2Client(
      tokens.accessToken,
      tokens.refreshToken
    );

    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

    try {
      const profile = await gmail.users.getProfile({
        userId: "me",
      });
      res.json(profile.data);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        if (!tokens.refreshToken) {
          throw new UnauthorizedError(
            "Google access expired and no refresh token is available. Please reconnect your Google account."
          );
        }

        const refreshedTokens = await this.authService.refreshGoogleTokens(
          userId,
          tokens.refreshToken
        );

        const refreshedGmail = google.gmail({
          version: "v1",
          auth: this.authService.getOAuth2Client(
            refreshedTokens.accessToken,
            refreshedTokens.refreshToken
          ),
        });

        const profile = await refreshedGmail.users.getProfile({
          userId: "me",
        });

        return res.json(profile.data);
      }
      throw err;
    }
  };

  disconnect = async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    if (!userId) {
      throw new UnauthorizedError("User not authenticated.");
    }

    await this.authService.disconnectGoogleAccount(userId);

    res.json({
      success: true,
      message: "Google account disconnected successfully",
      details: {
        userId: userId,
        tokensRevoked: true,
        databaseCleaned: true,
      },
    });
  };
}
