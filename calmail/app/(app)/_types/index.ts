export type VoiceState =
  | "idle"
  | "listening"
  | "thinking"
  | "acting"
  | "done"
  | "error";

export type CommandHistoryStatus =
  | "pending"
  | "needs_confirm"
  | "acting"
  | "sent"
  | "cancelled"
  | "error";

export interface EmailSummary {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
}

export interface CommandHistoryItem {
  id: string;
  transcript: string;
  intent?: string;
  status: CommandHistoryStatus;
  timestamp: number;
  message?: string;
  source?: "voice" | "text";
  confidence?: number;
  entities?: Record<string, unknown>;
  emails?: EmailSummary[];
  speechSummary?: string;
}
