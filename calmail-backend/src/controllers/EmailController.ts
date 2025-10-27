import { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { AuthService, EmailService, ContactService } from "../services";
import { UnauthorizedError } from "../errors";
import { isUnauthorizedError } from "../utils/errorHandler";
import type { SendEmailEntities, FetchEmailEntities } from "../types";

export class EmailController {
  constructor(
    private authService: AuthService,
    private emailService: EmailService,
    private contactService: ContactService
  ) {}

  sendEmail = async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    if (!userId) {
      throw new UnauthorizedError("User not authenticated");
    }

    const entities: SendEmailEntities = req.body.entities;
    const tokens = await this.authService.getUserTokens(userId);
    const oAuth2Client = this.authService.getOAuth2Client(
      tokens.accessToken,
      tokens.refreshToken
    );

    try {
      const result = await this.emailService.sendEmail(
        oAuth2Client,
        userId,
        entities
      );
      res.json(result);
    } catch (err) {
      if (isUnauthorizedError(err) && tokens.refreshToken) {
        const refreshedTokens = await this.authService.refreshGoogleTokens(
          userId,
          tokens.refreshToken
        );
        const refreshedClient = this.authService.getOAuth2Client(
          refreshedTokens.accessToken,
          refreshedTokens.refreshToken
        );
        const result = await this.emailService.sendEmail(
          refreshedClient,
          userId,
          entities
        );
        return res.json(result);
      }
      throw err;
    }
  };

  fetchEmails = async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    if (!userId) {
      throw new UnauthorizedError("User not authenticated");
    }

    const entities: FetchEmailEntities = req.body.entities;
    const tokens = await this.authService.getUserTokens(userId);
    const oAuth2Client = this.authService.getOAuth2Client(
      tokens.accessToken,
      tokens.refreshToken
    );

    try {
      const result = await this.emailService.fetchEmails(oAuth2Client, entities);
      res.json(result);
    } catch (err) {
      if (isUnauthorizedError(err) && tokens.refreshToken) {
        const refreshedTokens = await this.authService.refreshGoogleTokens(
          userId,
          tokens.refreshToken
        );
        const refreshedClient = this.authService.getOAuth2Client(
          refreshedTokens.accessToken,
          refreshedTokens.refreshToken
        );
        const result = await this.emailService.fetchEmails(
          refreshedClient,
          entities
        );
        return res.json(result);
      }
      throw err;
    }
  };

  executeCommand = async (req: Request, res: Response) => {
    const { intent, entities } = req.body;
    const { userId } = getAuth(req);

    if (!userId) {
      throw new UnauthorizedError("User not authenticated.");
    }

    let result;
    switch (intent) {
      case "send_email":
        result = await this.sendEmail(req, res);
        break;
      case "fetch_email":
        result = await this.fetchEmails(req, res);
        break;
      case "create_event":
        result = {
          success: false,
          message: "Create event not yet implemented",
        };
        res.json(result);
        break;
      default:
        result = { success: false, message: `Unknown intent: ${intent}` };
        res.json(result);
    }
  };

  resolveContact = async (req: Request, res: Response) => {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Contact name is required." });
    }

    const { userId } = getAuth(req);
    if (!userId) {
      throw new UnauthorizedError("User not authenticated.");
    }

    const tokens = await this.authService.getUserTokens(userId);
    const oAuth2Client = this.authService.getOAuth2Client(
      tokens.accessToken,
      tokens.refreshToken
    );

    const resolvedEmail = await this.contactService.resolveRecipientEmail(
      oAuth2Client,
      name
    );

    res.json({
      success: true,
      originalName: name,
      resolvedEmail: resolvedEmail,
      wasFoundInContacts: resolvedEmail !== `${name.toLowerCase()}@gmail.com`,
    });
  };

  testSmartRecipient = async (req: Request, res: Response) => {
    const { searchTerm } = req.body;
    if (!searchTerm) {
      return res.status(400).json({ error: "Search term is required." });
    }

    const { userId } = getAuth(req);
    if (!userId) {
      throw new UnauthorizedError("User not authenticated.");
    }

    const tokens = await this.authService.getUserTokens(userId);
    const oAuth2Client = this.authService.getOAuth2Client(
      tokens.accessToken,
      tokens.refreshToken
    );

    console.log(`Testing smart recipient finding for: "${searchTerm}"`);

    const recipientResult = await this.contactService.findRecipientEmail(
      oAuth2Client,
      searchTerm
    );

    res.json({
      success: true,
      searchTerm,
      recipientFound: recipientResult !== null,
      recipientResult,
      message: recipientResult
        ? `Found recipient: ${recipientResult.email} (confidence: ${recipientResult.confidence}, source: ${recipientResult.source})`
        : `No recipient found for "${searchTerm}"`,
    });
  };
}
