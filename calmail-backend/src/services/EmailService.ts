import { google } from "googleapis";
import * as crypto from "crypto";
import { config } from "../config";
import { RecipientNotFoundError } from "../errors";
import { ContactService } from "./ContactService";
import type {
  EmailSummary,
  SendEmailEntities,
  FetchEmailEntities,
  SendEmailResult,
  FetchEmailResult,
} from "../types";

export class EmailService {
  private contactService: ContactService;

  constructor(contactService: ContactService) {
    this.contactService = contactService;
  }

  async sendEmail(
    client: InstanceType<typeof google.auth.OAuth2>,
    userId: string,
    entities: SendEmailEntities
  ): Promise<SendEmailResult> {
    const gmail = google.gmail({ version: "v1", auth: client });

    const recipientName = entities.recipient;
    console.log(`Resolving recipient: "${recipientName}"`);

    const recipientResult = await this.contactService.findRecipientEmail(
      client,
      recipientName
    );

    if (!recipientResult) {
      throw new RecipientNotFoundError(recipientName);
    }

    const recipientEmail = recipientResult.email;
    console.log(
      `Resolved "${recipientName}" to email: ${recipientEmail} (confidence: ${recipientResult.confidence}, source: ${recipientResult.source})`
    );

    if (recipientResult.confidence === "low") {
      console.log(
        `Low confidence match for "${recipientName}" -> ${recipientEmail}. Consider asking user to confirm.`
      );
    }

    const emailMessage = [
      `To: ${recipientEmail}`,
      `From: me`,
      `Subject: ${entities.subject || "Email from AI Assistant"}`,
      "",
      entities.body,
    ].join("\n");

    const base64EncodedEmail = Buffer.from(emailMessage).toString("base64");
    const requestBody = { raw: base64EncodedEmail };

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

  async fetchEmails(
    client: InstanceType<typeof google.auth.OAuth2>,
    entities: FetchEmailEntities
  ): Promise<FetchEmailResult> {
    const maxResults = this.clampEmailCount(entities?.count);
    const sender = this.normalizeSenderEntity(entities?.sender);
    const quotedSender = sender && sender.includes(" ") ? `"${sender}"` : sender;
    const query = quotedSender ? `from:${quotedSender}` : undefined;

    const loadEmails = async (): Promise<EmailSummary[]> => {
      const gmailClient = google.gmail({ version: "v1", auth: client });
      const listResponse = await gmailClient.users.messages.list({
        userId: "me",
        q: query,
        maxResults,
      });

      const messageEntries = listResponse.data.messages ?? [];
      if (!messageEntries.length) {
        return [];
      }

      const emailSummaries: EmailSummary[] = [];

      for (const message of messageEntries) {
        try {
          const detail = await gmailClient.users.messages.get({
            userId: "me",
            id: message.id!,
            format: "metadata",
            metadataHeaders: ["Subject", "From", "Date"],
          });

          const headers = detail.data.payload?.headers;
          const subject = this.getHeaderValue(headers, "Subject") || "(No subject)";
          const from = this.getHeaderValue(headers, "From") || "Unknown sender";
          const date = this.formatDateToISO({
            internalDate: detail.data.internalDate,
            headerDate: this.getHeaderValue(headers, "Date"),
          });

          emailSummaries.push({
            id: detail.data.id || message.id || crypto.randomUUID(),
            subject,
            from,
            snippet: this.sanitizeSnippet(detail.data.snippet ?? undefined),
            date,
          });
        } catch (detailError) {
          console.warn("Failed to load Gmail message:", detailError);
        }
      }

      return emailSummaries;
    };

    const emails = await loadEmails();
    const speechSummary = this.buildEmailsSpeechSummary(emails, {
      sender,
      count: maxResults,
    });

    const message = emails.length
      ? `Fetched ${emails.length} recent email${emails.length > 1 ? "s" : ""}${
          sender ? ` from ${sender}` : ""
        }.`
      : sender
        ? `No recent emails found from ${sender}.`
        : "No recent emails found.";

    return {
      success: true,
      emails,
      message,
      speechSummary,
      query: {
        sender: sender ?? null,
        count: maxResults,
      },
    };
  }

  private clampEmailCount(value: unknown, fallback = config.email.defaultFetchCount): number {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.min(
        Math.max(Math.trunc(value), config.email.minFetchCount),
        config.email.maxFetchCount
      );
    }
    if (typeof value === "string") {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        return Math.min(
          Math.max(parsed, config.email.minFetchCount),
          config.email.maxFetchCount
        );
      }
    }
    return fallback;
  }

  private normalizeSenderEntity(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed;
  }

  private getHeaderValue(headers: any[] | undefined, name: string): string | undefined {
    if (!headers) return undefined;
    const header = headers.find(
      (item) => item.name?.toLowerCase() === name.toLowerCase()
    );
    return header?.value ?? undefined;
  }

  private sanitizeSnippet(snippet: string | undefined, maxLength = config.email.snippetMaxLength): string {
    if (!snippet) return "";
    const cleaned = snippet.replace(/\s+/g, " ").trim();
    if (cleaned.length <= maxLength) return cleaned;
    return `${cleaned.slice(0, maxLength - 1)}…`;
  }

  private formatDateToISO({
    internalDate,
    headerDate,
  }: {
    internalDate?: string | null;
    headerDate?: string;
  }): string {
    if (internalDate) {
      const millis = Number(internalDate);
      if (!Number.isNaN(millis)) {
        return new Date(millis).toISOString();
      }
    }

    if (headerDate) {
      const parsed = new Date(headerDate);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }

    return new Date().toISOString();
  }

  private buildEmailsSpeechSummary(
    emails: EmailSummary[],
    options: { sender?: string; count: number }
  ): string {
    const { sender, count } = options;
    if (!emails.length) {
      if (sender) {
        return `I could not find any recent emails from ${sender}.`;
      }
      return "I could not find any recent emails.";
    }

    const intro = sender
      ? `Here are the latest ${emails.length} emails from ${sender}.`
      : `Here are your latest ${emails.length} emails.`;

    const details = emails
      .slice(0, Math.min(emails.length, 3))
      .map((email, index) => {
        const receivedDate = new Date(email.date);
        const dateLabel = Number.isNaN(receivedDate.getTime())
          ? "recently"
          : `on ${receivedDate.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}`;
        const snippet = email.snippet ? ` ${email.snippet}` : "";
        return `${index + 1}. From ${email.from} — subject ${email.subject} ${dateLabel}.${snippet}`;
      })
      .join(" ");

    const tail =
      emails.length > count
        ? ` Showing the first ${count} emails requested.`
        : "";

    return `${intro} ${details}${tail}`.trim();
  }
}
