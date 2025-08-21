import "dotenv/config";
import express from "express";
import { clerkMiddleware, requireAuth, getAuth } from "@clerk/express";
import { WebhookEvent } from "@clerk/express/webhooks";
import { Webhook } from "svix"; // <-- Import Svix
import { buffer } from "micro"; // <-- Import a helper for reading the body
import { SpeechClient } from "@google-cloud/speech";
import { db } from "./db/db";
import { users, accounts } from "./db/schema";
import { encrypt, decrypt } from "./utils/crypto";
import * as fs from "fs";
import { google } from "googleapis";
import { eq } from "drizzle-orm";
import multer from "multer";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as crypto from "crypto";

const stateStore = new Map<string, string>();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const speechClient = new SpeechClient();
const app = express();
const PORT = process.env.PORT || 3000;
const CLERK_WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET!;

// 1. "Greeter" middleware to populate req.auth
app.use(express.json());
app.use(clerkMiddleware());

const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.BACKEND_PUBLIC_URL}/auth/google/callback` // <-- This is the fix
);

const upload = multer({ dest: "uploads/" });

// Public route
app.get("/", (req, res) => {
  res.send("Hello from the public route!");
});

app.get("/protected", requireAuth(), (req, res) => {
  // We can safely access req.auth.userId because requireAuth() guarantees it exists.
  const { userId } = getAuth(req);
  res.json({
    message: `This is a protected route. Your User ID is: ${userId}`,
  });
});

// CHANGED: This route now uses the 'state' token to identify the user.
// CHANGED: This route now generates and stores a 'state' token for security.
app.get("/auth/google/url", requireAuth(), (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ error: "User not authenticated." });
  }

  const state = crypto.randomBytes(16).toString("hex");
  stateStore.set(state, userId);
  setTimeout(() => stateStore.delete(state), 1000 * 60 * 10); // 10 minute expiry

  const scopes = [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/gmail.send", // Use 'send' scope for sending emails
    "https://www.googleapis.com/auth/calendar.events",
  ];

  const url = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    state: state, // Pass the state to Google
  });

  res.json({ authUrl: url });
});

// CHANGED: This route now uses the 'state' token to reliably identify the user.
app.get("/auth/google/callback", async (req, res) => {
  try {
    const code = req.query.code as string;
    const state = req.query.state as string;

    if (!state) {
      throw new Error("State parameter is missing.");
    }

    const userId = stateStore.get(state);
    if (!userId) {
      throw new Error(
        "Invalid state or session has expired. Please try again."
      );
    }

    stateStore.delete(state); // Clean up the state store

    const { tokens } = await oAuth2Client.getToken(code);
    if (!tokens.access_token) {
      throw new Error("Failed to retrieve access token from Google.");
    }

    const valuesToSet: {
      accessToken: string;
      scopes: string | null | undefined;
      refreshToken?: string;
    } = {
      accessToken: encrypt(tokens.access_token),
      scopes: tokens.scope,
    };

    if (tokens.refresh_token) {
      console.log("Received a new refresh token, updating in DB.");
      valuesToSet.refreshToken = encrypt(tokens.refresh_token);
    }

    await db
      .insert(accounts)
      .values({
        clerkUserId: userId,
        provider: "google",
        accessToken: valuesToSet.accessToken,
        refreshToken: valuesToSet.refreshToken,
        scopes: valuesToSet.scopes,
      })
      .onConflictDoUpdate({
        target: accounts.clerkUserId,
        set: valuesToSet,
      });

    console.log("Successfully saved tokens for user:", userId);
    res.send(
      "Successfully connected to Google! You can now close this window."
    );
  } catch (error) {
    console.error("Failed in Google callback:", error);
    res.status(500).send("Authentication with Google failed.");
  }
});

// This new route will fetch the user's Google Profile
app.get("/me", requireAuth(), async (req, res) => {
  try {
    // 1. Get the Clerk user ID
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // 2. Find the corresponding account in your database
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.clerkUserId, userId));

    if (userAccounts.length === 0) {
      return res.status(404).json({ error: "Google account not connected." });
    }

    const account = userAccounts[0];

    // 3. Decrypt the tokens
    const accessToken = decrypt(account.accessToken);
    const refreshToken = account.refreshToken
      ? decrypt(account.refreshToken)
      : undefined;

    // 4. Set the credentials on the OAuth2 client
    oAuth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    // 5. Make an authenticated API call to Google
    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
    const profile = await gmail.users.getProfile({
      userId: "me",
    });

    res.json(profile.data);
  } catch (error) {
    console.error("Failed to fetch Google profile:", error);
    res.status(500).json({ error: "Failed to fetch Google profile" });
  }
});

app.post(
  "/api/webhooks/clerk",
  // Use express.raw({ type: 'application/json' }) to read the body as a buffer
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const wh = new Webhook(CLERK_WEBHOOK_SECRET);
    let evt: WebhookEvent;
    try {
      const payloadString = req.body.toString("utf8");
      const svixHeaders = req.headers;

      // Remove duplicate Webhook instantiation
      evt = wh.verify(payloadString, svixHeaders as any) as WebhookEvent;
      const eventType = evt.type;

      if (eventType === "user.created") {
        console.log(`User ${evt.data.id} was ${eventType}`);

        // Type guard to ensure we have user data
        if (
          "email_addresses" in evt.data &&
          evt.data.email_addresses &&
          evt.data.email_addresses.length > 0
        ) {
          await db.insert(users).values({
            clerkUserId: evt.data.id!,
            email: evt.data.email_addresses[0].email_address,
          });

          console.log(`Inserted new user ${evt.data.id} into the database.`);
        } else {
          console.log(`User ${evt.data.id} created but no email address found`);
        }
      }

      res.status(200).json({ message: "Webhook received" });
    } catch (error) {
      console.error("Error verifying webhook:", error);
      res.status(400).json({ error: "Invalid webhook signature" });
    }
  }
);

app.post(
  "/transcribe",
  requireAuth(),
  upload.single("audio"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided." });
    }

    try {
      // 1. Read the audio file from disk
      const audioBytes = fs.readFileSync(req.file.path).toString("base64");

      const audio = {
        content: audioBytes,
      };
      const config = {
        // Note: .m4a uses a specific encoding. For simplicity, you might
        // configure expo-av to record in a format like LINEAR16 (wav)
        // but this config works for many m4a files.
        encoding: "MP3", // Google's API is robust and can often handle m4a as MP3
        sampleRateHertz: 16000,
        languageCode: "en-US",
      } as const;
      const request = {
        audio: audio,
        config: config,
      };

      // 2. Send the file to the Google Speech-to-Text API
      const [response] = (await speechClient.recognize(request)) as any;
      const transcript = response.results
        ?.map((result: any) => result.alternatives?.[0].transcript)
        .join("\n");

      if (!transcript) {
        return res.status(400).json({ error: "Could not transcribe audio." });
      }

      console.log("Transcription result:", transcript);

      // Step 2: Call processCommand with the transcript
      const nluResult = await processCommand(transcript);
      console.log("NLU Result:", nluResult);

      // Step 3: Send the final NLU result back to your app
      res.json(nluResult);
    } catch (error) {
      console.error("Error in /transcribe route:", error);
      res.status(500).json({ error: "Processing failed." });
    } finally {
      // 4. Clean up by deleting the temporary file
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
    }
  }
);

async function processCommand(transcript: string) {
  // Get the generative model
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
      responseMimeType: "application/json", // <-- Use Gemini's JSON Mode
    },
  });

  const prompt = `
    You are an expert NLU model. Your job is to analyze the user's command and return a structured JSON object with two top-level keys: "intent" and "entities". The "entities" key must always be an object, even if it's empty.

    The possible intents are: "send_email", "create_event".

    - For the "send_email" intent, the "entities" object must contain "recipient" and "body".
    - For the "create_event" intent, the "entities" object must contain "title", "date", and "time".

    Here is a perfect example of the output format:
    User command: "send a mail to example@test.com saying hello there"
    Your JSON output:
    {
      "intent": "send_email",
      "entities": {
        "recipient": "example@test.com",
        "body": "hello there"
      }
    }

    Now, analyze the following user command and provide only the JSON object: "${transcript}"
  `;

  const result = await model.generateContent(prompt);
  const response = result.response;
  const jsonText = response.text();

  if (!jsonText) {
    throw new Error("Failed to get NLU result from Gemini");
  }

  return JSON.parse(jsonText);
}

async function handleSendEmail(
  userId: string,
  entities: { recipient: string; body: string }
) {
  // 1. Retrieve and decrypt the user's Google tokens from the database
  const userAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.clerkUserId, userId));
  if (userAccounts.length === 0)
    throw new Error("Google account not connected.");

  const accessToken = decrypt(userAccounts[0].accessToken);
  const refreshToken = userAccounts[0].refreshToken
    ? decrypt(userAccounts[0].refreshToken)
    : undefined;

  // 2. Authenticate the Google API client
  oAuth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

  // 3. Resolve recipient's email address
  // TODO: In the future, you'll look up "my boss" in the user's contacts.
  // For now, we'll assume the recipient is a direct email address.
  const recipientEmail = entities.recipient;

  // 4. Create the raw email message in Base64 format
  const emailMessage = [
    `To: ${recipientEmail}`,
    `From: me`, // 'me' is a special value for the authenticated user
    `Subject: Sent from my AI Assistant`,
    "",
    entities.body,
  ].join("\n");

  const base64EncodedEmail = Buffer.from(emailMessage).toString("base64");
  const requestBody = { raw: base64EncodedEmail };

  // 5. Send the email using the Gmail API
  await gmail.users.messages.send({
    userId: "me",
    requestBody,
  });

  console.log(`Email sent to ${recipientEmail} for user ${userId}`);
  return {
    success: true,
    message: `Email successfully sent to ${recipientEmail}`,
  };
}

// Create the new command endpoint
app.post("/command", requireAuth(), async (req, res) => {
  const { intent, entities } = req.body;
  const { userId } = getAuth(req);

  // Add this check
  if (!userId) {
    return res.status(401).json({ error: "User not authenticated." });
  }

  // Now, TypeScript knows that 'userId' is a valid string
  try {
    let result;
    switch (intent) {
      case "send_email":
        result = await handleSendEmail(userId, entities);
        break;
      // You can add more cases here for other intents like 'create_event'
      default:
        result = { success: false, message: `Unknown intent: ${intent}` };
    }
    res.json(result);
  } catch (error) {
    console.error(`Error handling command for user ${userId}:`, error);
    res
      .status(500)
      .json({ success: false, message: "Failed to execute command." });
  }
});

app.post("/process-text", requireAuth(), async (req, res) => {
  try {
    const { command } = req.body;
    if (!command) {
      return res.status(400).json({ error: "Command text is required." });
    }

    // Reuse your existing processCommand function!
    const nluResult = await processCommand(command);

    res.json(nluResult);
  } catch (error) {
    console.error("Error processing text command:", error);
    res.status(500).json({ error: "Failed to process command." });
  }
});

app.listen(PORT, () => {
  console.log(`Example app listening at http://localhost:${PORT}`);
});
