import { Router } from "express";
import express from "express";
import { WebhookController } from "../controllers";
import { asyncHandler } from "../middleware";

export const createWebhookRoutes = (webhookController: WebhookController): Router => {
  const router = Router();

  router.post(
    "/clerk",
    express.raw({ type: "application/json" }),
    asyncHandler(webhookController.handleClerkWebhook)
  );

  return router;
};
