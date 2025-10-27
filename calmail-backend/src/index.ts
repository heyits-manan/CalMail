import express from "express";
import { clerkMiddleware, requireAuth, getAuth } from "@clerk/express";
import { config } from "./config";
import { errorHandler } from "./middleware";
import {
  AuthService,
  ContactService,
  EmailService,
  SpeechService,
} from "./services";
import {
  AuthController,
  EmailController,
  SpeechController,
  WebhookController,
} from "./controllers";
import {
  createAuthRoutes,
  createEmailRoutes,
  createSpeechRoutes,
  createWebhookRoutes,
} from "./routes";

const app = express();
const PORT = config.port;

app.use(express.json());
app.use(clerkMiddleware());

const authService = new AuthService();
const contactService = new ContactService();
const emailService = new EmailService(contactService);
const speechService = new SpeechService();

const authController = new AuthController(authService);
const emailController = new EmailController(
  authService,
  emailService,
  contactService
);
const speechController = new SpeechController(
  authService,
  speechService,
  contactService,
  emailService
);
const webhookController = new WebhookController();

app.get("/", (req, res) => {
  res.send("Hello from the public route!");
});

app.get("/protected", requireAuth(), (req, res) => {
  const { userId } = getAuth(req);
  res.json({
    message: `This is a protected route. Your User ID is: ${userId}`,
  });
});

app.get("/me", requireAuth(), async (req, res, next) => {
  try {
    await authController.getProfile(req, res);
  } catch (error) {
    next(error);
  }
});

app.use("/auth", createAuthRoutes(authController));
app.use("/api/webhooks", createWebhookRoutes(webhookController));
app.use(createSpeechRoutes(speechController));
app.use(createEmailRoutes(emailController));

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Example app listening at http://localhost:${PORT}`);
});
