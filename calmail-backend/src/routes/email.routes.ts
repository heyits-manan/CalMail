import { Router } from "express";
import { requireAuth } from "@clerk/express";
import { EmailController } from "../controllers";
import { asyncHandler } from "../middleware";

export const createEmailRoutes = (emailController: EmailController): Router => {
  const router = Router();

  router.post("/command", requireAuth(), asyncHandler(emailController.executeCommand));
  router.post("/resolve-contact", requireAuth(), asyncHandler(emailController.resolveContact));
  router.post("/test-smart-recipient", requireAuth(), asyncHandler(emailController.testSmartRecipient));

  return router;
};
