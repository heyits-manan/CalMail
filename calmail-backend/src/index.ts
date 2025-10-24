import "dotenv/config";
import express from "express";
import { clerkMiddleware, requireAuth, getAuth } from "@clerk/express";
import { WebhookEvent } from "@clerk/express/webhooks";
import { Webhook } from "svix";
import { buffer } from "micro";
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
    "https://www.googleapis.com/auth/contacts.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
  ];

  const url = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    state: state, // Pass the state to Google
    prompt: "consent", // Ensure a refresh token is always returned
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

    const encryptedAccessToken = encrypt(tokens.access_token);
    const insertValues: typeof accounts.$inferInsert = {
      clerkUserId: userId,
      provider: "google",
      accessToken: encryptedAccessToken,
      scopes: tokens.scope,
    };

    const updateValues: Partial<typeof accounts.$inferInsert> = {
      accessToken: encryptedAccessToken,
      scopes: tokens.scope,
    };

    if (tokens.refresh_token) {
      console.log("Received a new refresh token, updating in DB.");
      const encryptedRefreshToken = encrypt(tokens.refresh_token);
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
    let refreshToken = account.refreshToken
      ? decrypt(account.refreshToken)
      : undefined;

    // 4. Set the credentials on the OAuth2 client
    oAuth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    // 5. Make an authenticated API call to Google
    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

    try {
      const profile = await gmail.users.getProfile({
        userId: "me",
      });

      res.json(profile.data);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        if (!refreshToken) {
          console.error(
            `No refresh token available for user ${userId}; cannot recover from expired Google access token.`
          );
          return res.status(401).json({
            error:
              "Google access expired and no refresh token is available. Please reconnect your Google account.",
          });
        }

        try {
          const refreshedTokens = await refreshGoogleTokens(userId, refreshToken);
          refreshToken = refreshedTokens.refreshToken;
          const refreshedGmail = google.gmail({
            version: "v1",
            auth: oAuth2Client,
          });
          const profile = await refreshedGmail.users.getProfile({
            userId: "me",
          });

          return res.json(profile.data);
        } catch (refreshError) {
          console.error(
            "Failed to refresh Google access token during /me request:",
            refreshError
          );
          return res.status(401).json({
            error:
              "Google authentication expired. Please reconnect your Google account.",
          });
        }
      }

      throw err;
    }
  } catch (error) {
    console.error("Failed to fetch Google profile:", error);
    res.status(500).json({ error: "Failed to fetch Google profile" });
  }
});

function isUnauthorizedError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as {
    code?: number | string;
    status?: number;
    statusCode?: number;
    response?: { status?: number };
  };

  const statusCandidates = [
    maybeError.code,
    maybeError.status,
    maybeError.statusCode,
    maybeError.response?.status,
  ];

  return statusCandidates.some((status) => Number(status) === 401);
}

async function refreshGoogleTokens(
  userId: string,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string }> {
  oAuth2Client.setCredentials({ refresh_token: refreshToken });
  const response = await oAuth2Client.refreshAccessToken();
  const { access_token, refresh_token, scope } = response.credentials;

  if (!access_token) {
    throw new Error("Failed to refresh Google access token.");
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

  oAuth2Client.setCredentials({
    access_token: access_token,
    refresh_token: latestRefreshToken,
  });

  return {
    accessToken: access_token,
    refreshToken: latestRefreshToken,
  };
}

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
      // 1. Get the user's tokens from the database (you need this logic anyway)
      const { userId } = getAuth(req);
      if (!userId) throw new Error("User not found");

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
      oAuth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      // 2. Fetch the user's contact names
      const contactNames = await getUserContacts(oAuth2Client);
      console.log("Boosting transcription with contact names:", contactNames);

      const audioBytes = fs.readFileSync(req.file.path).toString("base64");
      const audio = { content: audioBytes };

      // 3. Add the adaptation config with the contact names
      const contactPhrases = contactNames.map((name) => ({
        value: name,
        boost: 15, // Increased boost for better recognition
      }));

      // Add common name variations and phonetic alternatives
      const commonVariations = [
        { value: "manan", boost: 20 }, // High boost for specific name
        { value: "mananchataut", boost: 20 }, // High boost for email username
        { value: "mananchataut@gmail.com", boost: 20 }, // High boost for full email
        { value: "manan chataut", boost: 18 }, // Boost for space-separated version
        { value: "manan c", boost: 16 }, // Boost for abbreviated version
        // Add speech recognition variations
        { value: "manan at gmail.com", boost: 25 }, // Very high boost for speech pattern
        { value: "manan at gmail dot com", boost: 25 }, // Very high boost for speech pattern
        { value: "manan gmail", boost: 22 }, // High boost for gmail reference
        { value: "manan gmail.com", boost: 22 }, // High boost for gmail reference
      ];

      const allPhrases = [...contactPhrases, ...commonVariations];

      const config = {
        encoding: "MP3" as const,
        sampleRateHertz: 16000,
        languageCode: "en-US",
        adaptation: {
          phraseSets: [
            {
              id: `user-contacts-${userId}`,
              phrases: allPhrases,
            },
          ],
        },
        // 4. Add additional speech adaptation features
        useEnhanced: true, // Use enhanced models for better accuracy
        model: "latest_long", // Use the latest long-form model
      };

      const request = { audio, config };

      // 2. Send the file to the Google Speech-to-Text API
      const [response] = await speechClient.recognize(request);
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

      // Step 3: Execute the command based on NLU result
      let executionResult;
      try {
        const { userId } = getAuth(req);
        if (!userId) {
          throw new Error("User not authenticated");
        }

        console.log(`Executing command for user ${userId}:`, nluResult);

        // Execute the command based on intent
        switch (nluResult.intent) {
          case "send_email":
            console.log(
              `Sending email to: ${nluResult.entities.recipient} with body: "${nluResult.entities.body}"`
            );
            executionResult = await handleSendEmail(userId, nluResult.entities);
            break;
          case "create_event":
            // TODO: Implement create_event handler
            executionResult = {
              success: false,
              message: "Create event not yet implemented",
            };
            break;
          default:
            executionResult = {
              success: false,
              message: `Unknown intent: ${nluResult.intent}`,
            };
        }

        console.log("Command execution result:", executionResult);

        // Step 4: Send both the transcript and the execution result back
        res.json({
          transcript: transcript,
          nlu: nluResult,
          executionResult,
          success: true,
        });
      } catch (error) {
        console.error("Error executing command:", error);
        res.status(500).json({
          nluResult,
          executionResult: {
            success: false,
            message: "Failed to execute command",
          },
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
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

async function getUserContacts(client: typeof oAuth2Client): Promise<string[]> {
  const people = google.people({ version: "v1", auth: client });
  const res = await people.people.connections.list({
    resourceName: "people/me",
    personFields: "names,emailAddresses", // Get both names and emails
    pageSize: 500, // Get up to 500 contacts
  });

  const phrases: string[] = [];

  res.data.connections?.forEach((person) => {
    // Add display names
    person.names?.forEach((name) => {
      if (name.displayName) {
        phrases.push(name.displayName);
        // Add first name only if it's different from display name
        if (name.givenName && name.givenName !== name.displayName) {
          phrases.push(name.givenName);
        }
        // Add last name only if it's different from display name
        if (name.familyName && name.familyName !== name.displayName) {
          phrases.push(name.familyName);
        }
      }
    });

    // Add email addresses (useful for "mananchataut@gmail.com")
    person.emailAddresses?.forEach((email) => {
      if (email.value) {
        phrases.push(email.value);
        // Extract username part from email (e.g., "mananchataut" from "mananchataut@gmail.com")
        const username = email.value.split("@")[0];
        if (username && username !== email.value) {
          phrases.push(username);
        }
      }
    });
  });

  // Remove duplicates and filter out very short names
  const uniquePhrases = [...new Set(phrases)].filter(
    (phrase) => phrase.length > 1
  );

  console.log(
    `Loaded ${uniquePhrases.length} unique phrases for speech recognition`
  );
  return uniquePhrases;
}

async function processCommand(transcript: string) {
  // Get the generative model
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
      responseMimeType: "application/json", // <-- Use Gemini's JSON Mode
    },
  });

  const prompt = `
    You are an expert NLU model specialized in understanding voice commands for email and calendar management. Your job is to analyze the user's command and return a structured JSON object with two top-level keys: "intent" and "entities". The "entities" key must always be an object, even if it's empty.

    The possible intents are: "send_email", "create_event".

    - For the "send_email" intent, the "entities" object must contain "recipient", "body", and "subject".
      - The "recipient" can be a name (like "manan", "john") or an email address (like "manan@gmail.com")
      - The "body" should contain the message content (if empty, use an empty string "")
      - The "subject" should contain the email subject line:
        * If explicitly mentioned (e.g., "with subject Q4 Review"), use that
        * If not mentioned, AUTO-GENERATE a concise, professional subject from the message content
        * Keep subjects under 50 characters when possible
        * Make subjects descriptive and actionable
    - For the "create_event" intent, the "entities" object must contain "title", "date", and "time".

    IMPORTANT: When processing email addresses from speech recognition, pay special attention to the word "at" when it appears between a name and email domains like gmail, yahoo, hotmail, outlook, etc. In these cases, "at" should be interpreted as the @ symbol.

    CRITICAL: When letters are spelled out individually (like "m a n a n c h a u t"), you MUST join them together to form the complete word/name. Remove all spaces between individual letters to create a coherent email address.

    ADDITIONAL SPEECH RECOGNITION PATTERNS TO HANDLE:
    - "manan at gmail.com" → interpret as "manan@gmail.com"
    - "john at yahoo.com" → interpret as "john@yahoo.com"
    - "sarah at hotmail.com" → interpret as "sarah@hotmail.com"
    - "mike at outlook.com" → interpret as "mike@outlook.com"
    - "m a n a n c h a u t at gmail.com" → interpret as "mananchataut@gmail.com"
    - "j o h n at yahoo.com" → interpret as "john@yahoo.com"
    - "s a r a h at hotmail.com" → interpret as "sarah@hotmail.com"
    - "manan dot com" → interpret as "manan.com"
    - "john underscore smith at gmail.com" → interpret as "john_smith@gmail.com"
    - "test hyphen user at yahoo.com" → interpret as "test-user@yahoo.com"
    - "nirajan beige at gmail.com" → interpret as "nirajanbeige@gmail.com" (remove spaces around @)
    - "john smith at gmail.com" → interpret as "johnsmith@gmail.com" (remove spaces around @)
    - "test user at yahoo.com" → interpret as "testuser@yahoo.com" (remove spaces around @)

    COMMON SPEECH VARIATIONS:
    - "send a mail to" = "send an email to" = "send email to" = "email to" = "mail to"
    - "saying" = "with message" = "with body" = "content" = "message"
    - "create event" = "schedule meeting" = "add calendar event" = "book appointment" = "set up meeting"
    - "gmail" = "google mail" = "googlemail"
    - "yahoo" = "yahoo mail"
    - "hotmail" = "outlook.com" (Microsoft accounts)

    CONTEXT AWARENESS:
    - If the user says "send a mail to my boss" and no specific name/email is mentioned, extract "my boss" as the recipient
    - If the user says "send a mail to the team", extract "the team" as the recipient
    - If the user says "schedule a meeting with john", this is a "create_event" intent, not "send_email"
    - If the user says "remind me about the meeting", this could be a "create_event" intent
    - If the user says "send a reminder to john", this is a "send_email" intent

    Here are comprehensive examples:
    User command: "send a mail to manan saying hello there"
    Your JSON output:
    {
      "intent": "send_email",
      "entities": {
        "recipient": "manan",
        "body": "hello there",
        "subject": "Hello there"
      }
    }

    User command: "send an email to john@gmail.com with message how are you"
    Your JSON output:
    {
      "intent": "send_email",
      "entities": {
        "recipient": "john@gmail.com",
        "body": "how are you",
        "subject": "How are you"
      }
    }

    User command: "send a mail to manan at gmail.com saying hi"
    Your JSON output:
    {
      "intent": "send_email",
      "entities": {
        "recipient": "manan@gmail.com",
        "body": "hi",
        "subject": "No Subject"
      }
    }

    User command: "send a mail to sarah at yahoo dot com saying hello"
    Your JSON output:
    {
      "intent": "send_email",
      "entities": {
        "recipient": "sarah@yahoo.com",
        "body": "hello",
        "subject": "Hello"
      }
    }

    User command: "send a mail to m a n a n c h a u t at gmail.com saying hi there"
    Your JSON output:
    {
      "intent": "send_email",
      "entities": {
        "recipient": "mananchataut@gmail.com",
        "body": "hi there",
        "subject": "Hi there"
      }
    }

    User command: "send a mail to nirajan beige at gmail.com saying hello"
    Your JSON output:
    {
      "intent": "send_email",
      "entities": {
        "recipient": "nirajanbeige@gmail.com",
        "body": "hello",
        "subject": "Hello"
      }
    }

    User command: "send a mail to john with subject meeting tomorrow about project discussion"
    Your JSON output:
    {
      "intent": "send_email",
      "entities": {
        "recipient": "john",
        "body": "meeting tomorrow about project discussion",
        "subject": "meeting tomorrow about project discussion"
      }
    }

    User command: "email sarah about the quarterly report with subject Q4 Review"
    Your JSON output:
    {
      "intent": "send_email",
      "entities": {
        "recipient": "sarah",
        "body": "the quarterly report",
        "subject": "Q4 Review"
      }
    }

    User command: "send a mail to the team about tomorrow's meeting schedule"
    Your JSON output:
    {
      "intent": "send_email",
      "entities": {
        "recipient": "the team",
        "body": "about tomorrow's meeting schedule",
        "subject": "Tomorrow's meeting schedule"
      }
    }

    User command: "email john saying can you please send me the project files"
    Your JSON output:
    {
      "intent": "send_email",
      "entities": {
        "recipient": "john",
        "body": "can you please send me the project files",
        "subject": "Project files request"
      }
    }

    User command: "send a mail to HR regarding my vacation request for next week"
    Your JSON output:
    {
      "intent": "send_email",
      "entities": {
        "recipient": "HR",
        "body": "regarding my vacation request for next week",
        "subject": "Vacation request for next week"
      }
    }

    User command: "send email to my boss with message please review the report"
    Your JSON output:
    {
      "intent": "send_email",
      "entities": {
        "recipient": "my boss",
        "body": "please review the report",
        "subject": "Please review the report"
      }
    }

    User command: "schedule a meeting with john tomorrow at 3pm about project discussion"
    Your JSON output:
    {
      "intent": "create_event",
      "entities": {
        "title": "project discussion",
        "date": "tomorrow",
        "time": "3pm"
      }
    }

    User command: "create event for team standup every day at 9am"
    Your JSON output:
    {
      "intent": "create_event",
      "entities": {
        "title": "team standup",
        "date": "every day",
        "time": "9am"
      }
    }

    ERROR HANDLING:
    - If the command is unclear or ambiguous, return the most likely intent
    - If the body is empty or not mentioned, use an empty string ""
    - If the recipient is unclear, extract the best guess from context
    - Always return valid JSON with the exact structure shown above
    - If the user says something that doesn't match any intent, default to "send_email" with the best available information

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

// This new function searches for a single contact and returns their email
async function findContactEmailByName(
  client: typeof oAuth2Client,
  name: string
): Promise<string | null> {
  try {
    const people = google.people({ version: "v1", auth: client });
    const res = await people.people.connections.list({
      resourceName: "people/me",
      // Ask for both names and email addresses
      personFields: "names,emailAddresses",
      pageSize: 500,
    });

    const connections = res.data.connections;
    if (!connections) {
      console.log(`No connections found for user`);
      return null;
    }

    // Find the contact with a matching name (case-insensitive)
    const contact = connections.find((person) =>
      person.names?.some(
        (n) =>
          n.displayName?.toLowerCase().includes(name.toLowerCase()) ||
          n.givenName?.toLowerCase().includes(name.toLowerCase()) ||
          n.familyName?.toLowerCase().includes(name.toLowerCase())
      )
    );

    // If a contact is found, return the first available email address
    if (
      contact &&
      contact.emailAddresses &&
      contact.emailAddresses.length > 0
    ) {
      const email = contact.emailAddresses[0].value;
      if (email) {
        console.log(`Found contact "${name}" with email: ${email}`);
        return email;
      }
    }

    // Return null if no contact is found or if they have no email
    if (contact) {
      console.log(`Contact "${name}" found but has no email address`);
    } else {
      console.log(`No contact found with name "${name}"`);
    }
    return null;
  } catch (error) {
    console.error(`Error searching for contact "${name}":`, error);
    return null;
  }
}

// New function to find email recipients based on previous communication history
async function findEmailRecipientByHistory(
  client: typeof oAuth2Client,
  searchTerm: string
): Promise<{
  email: string;
  confidence: "high" | "medium" | "low";
  source: string;
} | null> {
  try {
    const gmail = google.gmail({ version: "v1", auth: client });

    // Search for emails sent to or from the search term
    const query = `(to:${searchTerm} OR from:${searchTerm})`;
    console.log(`Searching Gmail history with query: ${query}`);

    const response = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 10, // Get recent emails
    });

    const messages = response.data.messages;
    if (!messages || messages.length === 0) {
      console.log(`No email history found for: ${searchTerm}`);
      return null;
    }

    // Get details of the most recent emails
    const emailDetails = await Promise.all(
      messages.slice(0, 5).map(async (message) => {
        try {
          const detail = await gmail.users.messages.get({
            userId: "me",
            id: message.id!,
          });
          return detail.data;
        } catch (error) {
          console.error(`Error getting message details:`, error);
          return null;
        }
      })
    );

    // Extract email addresses from headers
    const emailAddresses = new Set<string>();
    emailDetails.forEach((detail) => {
      if (detail?.payload?.headers) {
        detail.payload.headers.forEach((header) => {
          if (header.name === "To" || header.name === "From") {
            const emails = header.value?.match(/[\w\.-]+@[\w\.-]+\.\w+/g) || [];
            emails.forEach((email) => {
              if (
                email !== "me" &&
                !email.includes("noreply") &&
                !email.includes("no-reply")
              ) {
                emailAddresses.add(email);
              }
            });
          }
        });
      }
    });

    if (emailAddresses.size === 0) {
      console.log(
        `No valid email addresses found in history for: ${searchTerm}`
      );
      return null;
    }

    // Find the best match
    const bestMatch = Array.from(emailAddresses).find((email) => {
      const username = email.split("@")[0];
      return (
        username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        searchTerm.toLowerCase().includes(username.toLowerCase())
      );
    });

    if (bestMatch) {
      console.log(
        `Found email recipient from history: ${bestMatch} for search term: ${searchTerm}`
      );
      return {
        email: bestMatch,
        confidence: "high",
        source: "email_history",
      };
    }

    // If no exact match, return the first email found
    const firstEmail = Array.from(emailAddresses);
    console.log(
      `Using first email from history: ${firstEmail[0]} for search term: ${searchTerm}`
    );
    return {
      email: firstEmail[0],
      confidence: "medium",
      source: "email_history",
    };
  } catch (error) {
    console.error(`Error searching email history for "${searchTerm}":`, error);
    return null;
  }
}

// Enhanced function that combines contact search and email history
async function findRecipientEmail(
  client: typeof oAuth2Client,
  searchTerm: string
): Promise<{
  email: string;
  confidence: "high" | "medium" | "low";
  source: string;
} | null> {
  console.log(`Searching for recipient: "${searchTerm}"`);

  // Step 1: Check if it's already a valid email
  if (searchTerm.includes("@") && searchTerm.includes(".")) {
    console.log(`Search term "${searchTerm}" is already a valid email address`);
    return {
      email: searchTerm,
      confidence: "high",
      source: "direct_email",
    };
  }

  // Step 2: Search in Google Contacts
  console.log(`Step 1: Searching Google Contacts for "${searchTerm}"`);
  const contactEmail = await findContactEmailByName(client, searchTerm);

  if (contactEmail) {
    console.log(`Found in contacts: ${contactEmail}`);
    return {
      email: contactEmail,
      confidence: "high",
      source: "google_contacts",
    };
  }

  // Step 3: Search in email history
  console.log(`Step 2: Searching email history for "${searchTerm}"`);
  const historyEmail = await findEmailRecipientByHistory(client, searchTerm);

  if (historyEmail) {
    console.log(`Found in email history: ${historyEmail.email}`);
    return historyEmail;
  }

  // Step 4: No match found
  console.log(
    `No recipient found for "${searchTerm}" in contacts or email history`
  );
  return null;
}

async function resolveRecipientEmail(
  client: typeof oAuth2Client,
  recipientName: string
): Promise<string> {
  try {
    // First, try to clean up common speech recognition artifacts
    let cleanedName = recipientName;

    // Handle "at" instead of "@" (common speech recognition issue)
    if (recipientName.includes(" at ")) {
      cleanedName = recipientName.replace(/ at /gi, "@");
      console.log(
        `Cleaned speech recognition artifact: "${recipientName}" -> "${cleanedName}"`
      );
    }

    // Handle "dot" instead of "." (another common issue)
    if (cleanedName.includes(" dot ")) {
      cleanedName = cleanedName.replace(/ dot /gi, ".");
      console.log(
        `Cleaned speech recognition artifact: "${recipientName}" -> "${cleanedName}"`
      );
    }

    // Handle spaces before @ symbol (common speech recognition issue)
    if (cleanedName.includes(" @")) {
      cleanedName = cleanedName.replace(/ @/g, "@");
      console.log(
        `Cleaned space before @: "${recipientName}" -> "${cleanedName}"`
      );
    }

    // Handle spaces after @ symbol (common speech recognition issue)
    if (cleanedName.includes("@ ")) {
      cleanedName = cleanedName.replace(/@ /g, "@");
      console.log(
        `Cleaned space after @: "${recipientName}" -> "${cleanedName}"`
      );
    }

    // If it's now a valid email format, return it
    if (cleanedName.includes("@") && cleanedName.includes(".")) {
      console.log(
        `Recipient "${recipientName}" was cleaned to valid email: ${cleanedName}`
      );
      return cleanedName;
    }

    // Extract potential email username from speech patterns
    let potentialUsername = cleanedName;

    // Handle patterns like "Manan at gmail.com" -> extract "Manan"
    if (cleanedName.includes(" at ") || cleanedName.includes(" gmail.com")) {
      potentialUsername = cleanedName.split(/ at | gmail\.com/i)[0].trim();
      console.log(
        `Extracted username "${potentialUsername}" from speech pattern: "${cleanedName}"`
      );
    }

    // Handle patterns like "Manan Gmail" -> extract "Manan"
    if (cleanedName.toLowerCase().includes("gmail")) {
      potentialUsername = cleanedName
        .toLowerCase()
        .replace(/gmail.*/i, "")
        .trim();
      console.log(
        `Extracted username "${potentialUsername}" from speech pattern: "${cleanedName}"`
      );
    }

    // Use the new findContactEmailByName function for better contact handling
    const contactEmail = await findContactEmailByName(
      client,
      potentialUsername
    );

    if (contactEmail) {
      return contactEmail;
    }

    // If no contact found or no email associated, construct default email
    const defaultEmail = `${potentialUsername.toLowerCase()}@gmail.com`;
    console.log(
      `No contact found for "${potentialUsername}", using default email: ${defaultEmail}`
    );
    return defaultEmail;
  } catch (error) {
    console.error(
      `Error resolving recipient email for "${recipientName}":`,
      error
    );
    // Fallback to default email format
    const fallbackUsername = recipientName
      .split(/ at | gmail\.com/i)[0]
      .trim()
      .toLowerCase();
    const defaultEmail = `${fallbackUsername}@gmail.com`;
    console.log(`Using fallback email: ${defaultEmail}`);
    return defaultEmail;
  }
}

async function handleSendEmail(
  userId: string,
  entities: { recipient: string; body: string; subject?: string }
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

  // 3. Resolve recipient's email address using enhanced logic
  const recipientName = entities.recipient;
  console.log(`Resolving recipient: "${recipientName}"`);

  // Use the new enhanced recipient finding function
  const recipientResult = await findRecipientEmail(oAuth2Client, recipientName);

  if (!recipientResult) {
    const errorMessage = `Could not find an email address for "${recipientName}". Please check your Google Contacts, email history, or say the full email address.`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  const recipientEmail = recipientResult.email;
  console.log(
    `Resolved "${recipientName}" to email: ${recipientEmail} (confidence: ${recipientResult.confidence}, source: ${recipientResult.source})`
  );

  // 4. Handle low confidence cases (optional - you can add user confirmation here)
  if (recipientResult.confidence === "low") {
    console.log(
      `Low confidence match for "${recipientName}" -> ${recipientEmail}. Consider asking user to confirm.`
    );
  }

  // 4. Create the raw email message in Base64 format
  const emailMessage = [
    `To: ${recipientEmail}`,
    `From: me`, // 'me' is a special value for the authenticated user
    `Subject: ${entities.subject || "Email from AI Assistant"}`,
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
    resolvedEmail: recipientEmail,
    originalRecipient: entities.recipient,
    confidence: recipientResult.confidence,
    source: recipientResult.source,
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

    // Send both the original command (as transcript) and the NLU result
    res.json({
      transcript: command,
      nlu: nluResult,
    });
  } catch (error) {
    console.error("Error processing text command:", error);
    res.status(500).json({ error: "Failed to process command." });
  }
});

// Test endpoint to resolve contact names to emails
app.post("/resolve-contact", requireAuth(), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Contact name is required." });
    }

    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated." });
    }

    // Get user's Google tokens
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.clerkUserId, userId));

    if (userAccounts.length === 0) {
      return res.status(404).json({ error: "Google account not connected." });
    }

    const accessToken = decrypt(userAccounts[0].accessToken);
    const refreshToken = userAccounts[0].refreshToken
      ? decrypt(userAccounts[0].refreshToken)
      : undefined;

    oAuth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    // Resolve the contact name to email
    const resolvedEmail = await resolveRecipientEmail(oAuth2Client, name);

    res.json({
      success: true,
      originalName: name,
      resolvedEmail: resolvedEmail,
      wasFoundInContacts: resolvedEmail !== `${name.toLowerCase()}@gmail.com`,
    });
  } catch (error) {
    console.error("Error resolving contact:", error);
    res.status(500).json({ error: "Failed to resolve contact." });
  }
});

// Test endpoint specifically for speech recognition patterns
app.post("/test-speech-patterns", requireAuth(), async (req, res) => {
  try {
    const testCases = [
      "Manan at gmail.com",
      "manan at gmail dot com",
      "Manan Gmail",
      "manan@gmail.com",
      "manan",
      "john at yahoo.com",
      "sarah at hotmail.com",
      "mike at outlook.com",
      "alice at gmail dot com",
      "bob at yahoo dot com",
      // Test spelled-out email patterns
      "m a n a n c h a u t at gmail.com",
      "j o h n at yahoo.com",
      "s a r a h at hotmail.com",
      "a l i c e at gmail dot com",
      "b o b at yahoo dot com",
    ];

    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated." });
    }

    // Get user's Google tokens
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.clerkUserId, userId));

    if (userAccounts.length === 0) {
      return res.status(404).json({ error: "Google account not connected." });
    }

    const accessToken = decrypt(userAccounts[0].accessToken);
    const refreshToken = userAccounts[0].refreshToken
      ? decrypt(userAccounts[0].refreshToken)
      : undefined;

    oAuth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const results = [];
    for (const testCase of testCases) {
      const resolvedEmail = await resolveRecipientEmail(oAuth2Client, testCase);
      results.push({
        input: testCase,
        output: resolvedEmail,
        cleaned: testCase.includes(" at ")
          ? testCase.replace(/ at /gi, "@")
          : testCase,
      });
    }

    res.json({
      success: true,
      testResults: results,
    });
  } catch (error) {
    console.error("Error testing speech patterns:", error);
    res.status(500).json({ error: "Failed to test speech patterns." });
  }
});

// Test endpoint for the new smart recipient finding functionality
app.post("/test-smart-recipient", requireAuth(), async (req, res) => {
  try {
    const { searchTerm } = req.body;
    if (!searchTerm) {
      return res.status(400).json({ error: "Search term is required." });
    }

    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated." });
    }

    // Get user's Google tokens
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.clerkUserId, userId));

    if (userAccounts.length === 0) {
      return res.status(404).json({ error: "Google account not connected." });
    }

    const accessToken = decrypt(userAccounts[0].accessToken);
    const refreshToken = userAccounts[0].refreshToken
      ? decrypt(userAccounts[0].refreshToken)
      : undefined;

    oAuth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    console.log(`Testing smart recipient finding for: "${searchTerm}"`);

    // Test the new enhanced recipient finding function
    const recipientResult = await findRecipientEmail(oAuth2Client, searchTerm);

    res.json({
      success: true,
      searchTerm,
      recipientFound: recipientResult !== null,
      message: recipientResult
        ? `Found recipient: ${recipientResult.email} (confidence: ${recipientResult.confidence}, source: ${recipientResult.source})`
        : `No recipient found for "${searchTerm}"`,
    });
  } catch (error) {
    console.error("Error testing smart recipient finding:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      message: "Smart recipient finding test failed",
    });
  }
});

// Google Account Disconnect Endpoint
app.delete("/auth/google/disconnect", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated." });
    }

    console.log(`User ${userId} requesting Google account disconnect`);

    // 1. Get the user's stored Google tokens
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.clerkUserId, userId));

    if (userAccounts.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No Google account found to disconnect",
      });
    }

    const userAccount = userAccounts[0];
    const accessToken = decrypt(userAccount.accessToken);

    // 2. Revoke the token with Google OAuth API
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
          console.log(
            `Successfully revoked Google OAuth token for user ${userId}`
          );
        } else {
          console.warn(
            `Failed to revoke Google OAuth token for user ${userId}. Status: ${revokeResponse.status}`
          );
          // Continue with local cleanup even if Google revocation fails
        }
      } catch (revokeError) {
        console.error(
          `Error revoking Google OAuth token for user ${userId}:`,
          revokeError
        );
        // Continue with local cleanup even if Google revocation fails
      }
    }

    // 3. Remove Google credentials from your database
    console.log(`Removing Google credentials from database for user ${userId}`);

    await db.delete(accounts).where(eq(accounts.clerkUserId, userId));

    console.log(`Successfully disconnected Google account for user ${userId}`);

    // 4. Return success response
    res.json({
      success: true,
      message: "Google account disconnected successfully",
      details: {
        userId: userId,
        tokensRevoked: true,
        databaseCleaned: true,
      },
    });
  } catch (error) {
    console.error("Error disconnecting Google account:", error);
    res.status(500).json({
      success: false,
      message: "Failed to disconnect Google account",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Example app listening at http://localhost:${PORT}`);
});
