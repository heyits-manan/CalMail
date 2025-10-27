export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  scope?: string;
}

export interface UserAccount {
  id: number;
  clerkUserId: string;
  provider: string;
  accessToken: string;
  refreshToken: string | null;
  scopes: string | null;
}
