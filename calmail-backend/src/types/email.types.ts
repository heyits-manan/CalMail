export interface EmailSummary {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
}

export interface SendEmailEntities {
  recipient: string;
  body: string;
  subject?: string;
}

export interface FetchEmailEntities {
  sender?: string;
  count?: number | string;
}

export interface SendEmailResult {
  success: boolean;
  message: string;
  resolvedEmail: string;
  originalRecipient: string;
  confidence: "high" | "medium" | "low";
  source: string;
}

export interface FetchEmailResult {
  success: boolean;
  emails: EmailSummary[];
  message: string;
  speechSummary: string;
  query: {
    sender: string | null;
    count: number;
  };
}

export interface RecipientResolutionResult {
  email: string;
  confidence: "high" | "medium" | "low";
  source: "direct_email" | "google_contacts" | "email_history";
}
