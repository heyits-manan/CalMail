export type Intent = "send_email" | "fetch_email" | "create_event";

export interface NLUResult {
  intent: Intent;
  entities: Record<string, any>;
}

export interface CreateEventEntities {
  title: string;
  date: string;
  time: string;
}

export interface CommandExecutionResult {
  success: boolean;
  message: string;
  [key: string]: any;
}
