import { Request, Response } from "express";
import { Webhook } from "svix";
import { WebhookEvent } from "@clerk/express/webhooks";
import { db } from "../db/db";
import { users } from "../db/schema";
import { config } from "../config";

export class WebhookController {
  handleClerkWebhook = async (req: Request, res: Response) => {
    const wh = new Webhook(config.clerk.webhookSecret);
    let evt: WebhookEvent;

    try {
      const payloadString = req.body.toString("utf8");
      const svixHeaders = req.headers;

      evt = wh.verify(payloadString, svixHeaders as any) as WebhookEvent;
      const eventType = evt.type;

      if (eventType === "user.created") {
        console.log(`User ${evt.data.id} was ${eventType}`);

        if (
          "email_addresses" in evt.data &&
          evt.data.email_addresses &&
          evt.data.email_addresses.length > 0
        ) {
          await db.insert(users).values({
            clerkUserId: evt.data.id!,
            email: evt.data.email_addresses[0].email_address,
          });

          console.log(`Inserted new user ${evt.data.id} into the database.`);
        } else {
          console.log(`User ${evt.data.id} created but no email address found`);
        }
      }

      res.status(200).json({ message: "Webhook received" });
    } catch (error) {
      console.error("Error verifying webhook:", error);
      res.status(400).json({ error: "Invalid webhook signature" });
    }
  };
}
