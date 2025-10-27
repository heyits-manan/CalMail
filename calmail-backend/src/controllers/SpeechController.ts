import { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import * as fs from "fs";
import { AuthService, SpeechService, ContactService, EmailService } from "../services";
import { UnauthorizedError, BadRequestError } from "../errors";
import type { SendEmailEntities, FetchEmailEntities } from "../types";

export class SpeechController {
  constructor(
    private authService: AuthService,
    private speechService: SpeechService,
    private contactService: ContactService,
    private emailService: EmailService
  ) {}

  transcribe = async (req: Request, res: Response) => {
    if (!req.file) {
      throw new BadRequestError("No audio file provided.");
    }

    try {
      const { userId } = getAuth(req);
      if (!userId) throw new UnauthorizedError("User not found");

      const tokens = await this.authService.getUserTokens(userId);
      const oAuth2Client = this.authService.getOAuth2Client(
        tokens.accessToken,
        tokens.refreshToken
      );

      const contactNames = await this.contactService.getUserContactNames(
        oAuth2Client
      );
      console.log("Boosting transcription with contact names:", contactNames);

      const audioBytes = fs.readFileSync(req.file.path).toString("base64");
      const transcript = await this.speechService.transcribeAudio(
        audioBytes,
        contactNames,
        userId
      );

      const nluResult = await this.speechService.processCommand(transcript);
      console.log("NLU Result:", nluResult);

      let executionResult;
      console.log(`Executing command for user ${userId}:`, nluResult);

      switch (nluResult.intent) {
        case "send_email":
          console.log(
            `Sending email to: ${nluResult.entities.recipient} with body: "${nluResult.entities.body}"`
          );
          executionResult = await this.emailService.sendEmail(
            oAuth2Client,
            userId,
            nluResult.entities as SendEmailEntities
          );
          break;
        case "fetch_email":
          console.log("Fetching recent emails with entities:", nluResult.entities);
          executionResult = await this.emailService.fetchEmails(
            oAuth2Client,
            nluResult.entities as FetchEmailEntities
          );
          break;
        case "create_event":
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

      res.json({
        transcript: transcript,
        nlu: nluResult,
        executionResult,
        success: true,
      });
    } finally {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
    }
  };

  processText = async (req: Request, res: Response) => {
    const { command } = req.body;
    if (!command) {
      throw new BadRequestError("Command text is required.");
    }

    const nluResult = await this.speechService.processCommand(command);

    res.json({
      transcript: command,
      nlu: nluResult,
    });
  };
}
