import { Router } from "express";
import { requireAuth } from "@clerk/express";
import { AuthController } from "../controllers";
import { asyncHandler } from "../middleware";

export const createAuthRoutes = (authController: AuthController): Router => {
  const router = Router();

  router.get("/google/url", requireAuth(), asyncHandler(authController.generateAuthUrl));
  router.get("/google/callback", asyncHandler(authController.handleCallback));
  router.delete("/google/disconnect", requireAuth(), asyncHandler(authController.disconnect));

  return router;
};
