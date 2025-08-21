# 📧 CalMail — AI Email & Calendar Assistant

**CalMail** is an AI-powered assistant that helps you **manage Gmail and Google Calendar hands-free**.
Simply **speak or type natural language commands**, and CalMail will take care of the rest — from sending quick emails to scheduling meetings.

---

## ✨ Features

* **🎙️ Voice & Text Commands**
  Control your Gmail and Calendar using either speech or typed commands.

* **🔐 Secure Authentication**
  User authentication is powered by **Clerk**, ensuring strong security and seamless login.

* **📡 Google Integration**
  Connect your Google account via OAuth2 to access **Gmail, Google Calendar, and Google People APIs**.

* **🧠 AI-Driven Understanding**

  * **Speech-to-Text (STT):** Google Cloud Speech-to-Text for accurate transcriptions.
  * **Natural Language Understanding (NLU):** Powered by **Gemini Pro** to parse intents and extract details from your commands.

* **⚡ Smart Actions**

  * **Send Emails:** e.g. *“Email my boss that I’ll be 5 minutes late.”*
  * **Create Calendar Events:** e.g. *“Schedule a sync meeting for next Friday at 3 PM.”*

---

## 🏗️ Architecture Overview

CalMail follows a **modern client-server architecture**:

1. **Frontend (Expo App)**

   * Provides the voice/text input UI.
   * Handles user authentication with Clerk.
   * Talks to the backend via secure APIs.

2. **Backend (Express.js)**

   * Validates sessions with Clerk.
   * Runs Google OAuth2 flow to obtain tokens with Gmail/Calendar scopes.
   * Orchestrates AI pipeline (STT → NLU → Action).
   * Executes Gmail/Calendar operations via Google APIs.
   * Stores encrypted tokens and logs in **Neon (Postgres) via Drizzle ORM**.

3. **External Services**

   * **Clerk** → Authentication & session management.
   * **Google Cloud** → Speech-to-Text, Gemini Pro, Gmail, Calendar, People APIs.
   * **Neon** → Serverless Postgres for persistence.

---

## 🛠️ Tech Stack

| Layer         | Technologies                                  |
| ------------- | --------------------------------------------- |
| **Frontend**  | Expo (React Native), TypeScript, Tailwind CSS |
| **Backend**   | Node.js, Express.js, TypeScript               |
| **Database**  | Neon (Serverless Postgres), Drizzle ORM       |
| **Auth**      | Clerk                                         |
| **AI / NLU**  | Google Cloud Speech-to-Text, Gemini Pro       |
| **APIs**      | Gmail API, Calendar API, People API           |
| **Uploads**   | Multer (audio files)                          |
| **Dev Tools** | ngrok (tunneling), ESLint, Prettier           |

---

## 🚀 Getting Started

### Prerequisites

* Node.js v18+
* `npm` or `pnpm`
* Expo CLI (`npm install -g expo-cli`)
* [ngrok](https://ngrok.com/) account + CLI

---

### 1. Clone & Setup

```bash
git clone <your-repo-url>
cd <your-repo-folder>
```

---

### 2. Configure Clerk

* Create a new app in [Clerk Dashboard](https://dashboard.clerk.com/).
* Copy **Publishable Key** and **Secret Key**.
* Set up a **Webhook** → copy the **Signing Secret**.

---

### 3. Configure Google Cloud

* Create a project in [Google Cloud Console](https://console.cloud.google.com/).
* Enable: **Gmail API**, **Google Calendar API**, **Google People API**, **Speech-to-Text API**.
* Create **OAuth 2.0 credentials** (Web application) → copy **Client ID** & **Client Secret**.
* Add redirect URIs for both `localhost` and `ngrok` URLs.
* Create a **Service Account**, download JSON key file.

---

### 4. Configure Neon Database

* Create a Neon project at [neon.tech](https://neon.tech/).
* Copy the **connection string**.

---

### 5. Backend Setup

```bash
cd backend
cp .env.example .env
# Fill in Clerk, Google, Neon, and encryption keys
npm install
npm run db:generate
npm run db:push
npm run dev
```

---

### 6. Frontend (Expo App) Setup

```bash
cd frontend   # or expo-app/
cp .env.example .env
# Fill in Clerk publishable key & API base URL
npm install
npx expo start
```

---

## 🔒 Environment Variables

### Backend `.env`

```env
DATABASE_URL="your_neon_connection_string"
BACKEND_PUBLIC_URL="https://your-ngrok-url.ngrok-free.app"

# Clerk
CLERK_PUBLISHABLE_KEY="pk_..."
CLERK_SECRET_KEY="sk_..."
CLERK_WEBHOOK_SECRET="whsec_..."

# Google
GOOGLE_CLIENT_ID="your_google_client_id"
GOOGLE_CLIENT_SECRET="your_google_client_secret"
GOOGLE_APPLICATION_CREDENTIALS="./service-account.json"
GEMINI_API_KEY="your_gemini_api_key"

# Encryption
ENCRYPTION_KEY="32_char_random_secret"
```

### Frontend `.env`

```env
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_..."
EXPO_PUBLIC_API_BASE_URL="https://your-ngrok-url.ngrok-free.app"
```

---

## 🌱 Roadmap / Future Work

* **Entity Resolution:** Map phrases like “my boss” to contacts via People API.
* **Expanded Intents:** Inbox queries, task reminders, and smart follow-ups.
* **Richer UX:** Replace basic alerts with in-app toast/snackbar notifications.
* **Conversation Memory:** Multi-turn context (e.g. “reschedule that meeting”).
* **Offline STT Option:** Integrate on-device transcription for privacy and speed.

---

## 📄 License

MIT — free to use, modify, and distribute.
