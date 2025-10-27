export const getNLUPrompt = (transcript: string): string => `
You are an expert NLU model specialized in understanding voice commands for email and calendar management. Your job is to analyze the user's command and return a structured JSON object with two top-level keys: "intent" and "entities". The "entities" key must always be an object, even if it's empty.

The possible intents are: "send_email", "create_event", "fetch_email".

- For the "send_email" intent, the "entities" object must contain "recipient", "body", and "subject".
  - The "recipient" can be a name (like "manan", "john") or an email address (like "manan@gmail.com")
  - The "body" should contain the message content (if empty, use an empty string "")
  - The "subject" should contain the email subject line:
    * If explicitly mentioned (e.g., "with subject Q4 Review"), use that
    * If not mentioned, AUTO-GENERATE a concise, professional subject from the message content
    * Keep subjects under 50 characters when possible
    * Make subjects descriptive and actionable
- For the "create_event" intent, the "entities" object must contain "title", "date", and "time".
- For the "fetch_email" intent, the "entities" object MAY contain:
    * "sender" — the person the emails should come from (name or email). Only include if mentioned.
    * "count" — number of emails to read back (default to 5 if not specified). Use a number, not a string.
  If the user asks for "latest emails" without a sender, omit the "sender" key entirely. Always include only the keys you are confident about.

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
- "show me emails" = "fetch my emails" = "read my inbox" = Intent "fetch_email"
- "any mail from" = "emails from" = "messages from" = Intent "fetch_email" with a sender entity

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

User command: "read my latest 3 emails"
Your JSON output:
{
  "intent": "fetch_email",
  "entities": {
    "count": 3
  }
}

User command: "show the newest emails from Sarah"
Your JSON output:
{
  "intent": "fetch_email",
  "entities": {
    "sender": "Sarah",
    "count": 5
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
