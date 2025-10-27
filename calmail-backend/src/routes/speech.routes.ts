import { Router } from "express";
import { requireAuth } from "@clerk/express";
import multer from "multer";
import { SpeechController } from "../controllers";
import { asyncHandler } from "../middleware";

const upload = multer({ dest: "uploads/" });

export const createSpeechRoutes = (speechController: SpeechController): Router => {
  const router = Router();

  router.post(
    "/transcribe",
    requireAuth(),
    upload.single("audio"),
    asyncHandler(speechController.transcribe)
  );
  router.post("/process-text", requireAuth(), asyncHandler(speechController.processText));

  return router;
};
