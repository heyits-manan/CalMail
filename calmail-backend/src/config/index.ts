import "dotenv/config";

export const config = {
  port: process.env.PORT || 3000,

  // Clerk Configuration
  clerk: {
    webhookSecret: process.env.CLERK_WEBHOOK_SECRET!,
  },

  // Google Configuration
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri: `${process.env.BACKEND_PUBLIC_URL}/auth/google/callback`,
    scopes: [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/contacts.readonly",
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
  },

  // AI Configuration
  ai: {
    geminiApiKey: process.env.GEMINI_API_KEY!,
  },

  // Database Configuration
  database: {
    url: process.env.DATABASE_URL!,
  },

  // Encryption Configuration
  encryption: {
    key: process.env.ENCRYPTION_KEY!,
  },

  // OAuth Configuration
  oauth: {
    stateTokenExpiryMs: 10 * 60 * 1000, // 10 minutes
  },

  // Email Configuration
  email: {
    maxFetchCount: 10,
    defaultFetchCount: 5,
    minFetchCount: 1,
    snippetMaxLength: 160,
  },

  // Speech Recognition Configuration
  speech: {
    encoding: "MP3" as const,
    sampleRateHertz: 16000,
    languageCode: "en-US",
    useEnhanced: true,
    model: "latest_long" as const,
    contactBoost: 15,
    highBoost: 20,
  },

  // Contact Configuration
  contacts: {
    pageSize: 500,
  },
};
