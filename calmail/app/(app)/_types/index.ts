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
}
