import { google } from "googleapis";
import type { RecipientResolutionResult } from "../types";
import { config } from "../config";

export class ContactService {
  async getUserContactNames(
    client: InstanceType<typeof google.auth.OAuth2>
  ): Promise<string[]> {
    const people = google.people({ version: "v1", auth: client });
    const res = await people.people.connections.list({
      resourceName: "people/me",
      personFields: "names,emailAddresses",
      pageSize: config.contacts.pageSize,
    });

    const phrases: string[] = [];

    res.data.connections?.forEach((person) => {
      person.names?.forEach((name) => {
        if (name.displayName) {
          phrases.push(name.displayName);
          if (name.givenName && name.givenName !== name.displayName) {
            phrases.push(name.givenName);
          }
          if (name.familyName && name.familyName !== name.displayName) {
            phrases.push(name.familyName);
          }
        }
      });

      person.emailAddresses?.forEach((email) => {
        if (email.value) {
          phrases.push(email.value);
          const username = email.value.split("@")[0];
          if (username && username !== email.value) {
            phrases.push(username);
          }
        }
      });
    });

    const uniquePhrases = [...new Set(phrases)].filter(
      (phrase) => phrase.length > 1
    );

    console.log(
      `Loaded ${uniquePhrases.length} unique phrases for speech recognition`
    );
    return uniquePhrases;
  }

  async findContactEmailByName(
    client: InstanceType<typeof google.auth.OAuth2>,
    name: string
  ): Promise<string | null> {
    try {
      const people = google.people({ version: "v1", auth: client });
      const res = await people.people.connections.list({
        resourceName: "people/me",
        personFields: "names,emailAddresses",
        pageSize: config.contacts.pageSize,
      });

      const connections = res.data.connections;
      if (!connections) {
        console.log(`No connections found for user`);
        return null;
      }

      const contact = connections.find((person) =>
        person.names?.some(
          (n) =>
            n.displayName?.toLowerCase().includes(name.toLowerCase()) ||
            n.givenName?.toLowerCase().includes(name.toLowerCase()) ||
            n.familyName?.toLowerCase().includes(name.toLowerCase())
        )
      );

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

  async findEmailRecipientByHistory(
    client: InstanceType<typeof google.auth.OAuth2>,
    searchTerm: string
  ): Promise<RecipientResolutionResult | null> {
    try {
      const gmail = google.gmail({ version: "v1", auth: client });

      const query = `(to:${searchTerm} OR from:${searchTerm})`;
      console.log(`Searching Gmail history with query: ${query}`);

      const response = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 10,
      });

      const messages = response.data.messages;
      if (!messages || messages.length === 0) {
        console.log(`No email history found for: ${searchTerm}`);
        return null;
      }

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

      const firstEmail = Array.from(emailAddresses)[0];
      console.log(
        `Using first email from history: ${firstEmail} for search term: ${searchTerm}`
      );
      return {
        email: firstEmail,
        confidence: "medium",
        source: "email_history",
      };
    } catch (error) {
      console.error(`Error searching email history for "${searchTerm}":`, error);
      return null;
    }
  }

  async findRecipientEmail(
    client: InstanceType<typeof google.auth.OAuth2>,
    searchTerm: string
  ): Promise<RecipientResolutionResult | null> {
    console.log(`Searching for recipient: "${searchTerm}"`);

    if (searchTerm.includes("@") && searchTerm.includes(".")) {
      console.log(`Search term "${searchTerm}" is already a valid email address`);
      return {
        email: searchTerm,
        confidence: "high",
        source: "direct_email",
      };
    }

    console.log(`Step 1: Searching Google Contacts for "${searchTerm}"`);
    const contactEmail = await this.findContactEmailByName(client, searchTerm);

    if (contactEmail) {
      console.log(`Found in contacts: ${contactEmail}`);
      return {
        email: contactEmail,
        confidence: "high",
        source: "google_contacts",
      };
    }

    console.log(`Step 2: Searching email history for "${searchTerm}"`);
    const historyEmail = await this.findEmailRecipientByHistory(client, searchTerm);

    if (historyEmail) {
      console.log(`Found in email history: ${historyEmail.email}`);
      return historyEmail;
    }

    console.log(
      `No recipient found for "${searchTerm}" in contacts or email history`
    );
    return null;
  }

  async resolveRecipientEmail(
    client: InstanceType<typeof google.auth.OAuth2>,
    recipientName: string
  ): Promise<string> {
    try {
      let cleanedName = recipientName;

      if (recipientName.includes(" at ")) {
        cleanedName = recipientName.replace(/ at /gi, "@");
        console.log(
          `Cleaned speech recognition artifact: "${recipientName}" -> "${cleanedName}"`
        );
      }

      if (cleanedName.includes(" dot ")) {
        cleanedName = cleanedName.replace(/ dot /gi, ".");
        console.log(
          `Cleaned speech recognition artifact: "${recipientName}" -> "${cleanedName}"`
        );
      }

      if (cleanedName.includes(" @")) {
        cleanedName = cleanedName.replace(/ @/g, "@");
        console.log(
          `Cleaned space before @: "${recipientName}" -> "${cleanedName}"`
        );
      }

      if (cleanedName.includes("@ ")) {
        cleanedName = cleanedName.replace(/@ /g, "@");
        console.log(
          `Cleaned space after @: "${recipientName}" -> "${cleanedName}"`
        );
      }

      if (cleanedName.includes("@") && cleanedName.includes(".")) {
        console.log(
          `Recipient "${recipientName}" was cleaned to valid email: ${cleanedName}`
        );
        return cleanedName;
      }

      let potentialUsername = cleanedName;

      if (cleanedName.includes(" at ") || cleanedName.includes(" gmail.com")) {
        potentialUsername = cleanedName.split(/ at | gmail\.com/i)[0].trim();
        console.log(
          `Extracted username "${potentialUsername}" from speech pattern: "${cleanedName}"`
        );
      }

      if (cleanedName.toLowerCase().includes("gmail")) {
        potentialUsername = cleanedName
          .toLowerCase()
          .replace(/gmail.*/i, "")
          .trim();
        console.log(
          `Extracted username "${potentialUsername}" from speech pattern: "${cleanedName}"`
        );
      }

      const contactEmail = await this.findContactEmailByName(
        client,
        potentialUsername
      );

      if (contactEmail) {
        return contactEmail;
      }

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
      const fallbackUsername = recipientName
        .split(/ at | gmail\.com/i)[0]
        .trim()
        .toLowerCase();
      const defaultEmail = `${fallbackUsername}@gmail.com`;
      console.log(`Using fallback email: ${defaultEmail}`);
      return defaultEmail;
    }
  }
}
