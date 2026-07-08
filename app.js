import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";

import authRoutes from "./routes/auth.routes.js";
import socialRoutes from "./routes/social.routes.js";
import tokenRoutes from "./routes/token.routes.js";
import userRoutes from "./routes/user.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import jwksRoutes from "./routes/jwks.routes.js";
import localAuthRoutes from "./routes/auth.local.routes.js";

import { errorHandler, notFound } from "./middlewares/error.middleware.js";
import { connectDB } from "./db.js";

const app = express();
app.set("trust proxy", 1);

// security & body
app.use(helmet());
app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);
app.use(cookieParser());
// ✅ put this BEFORE express.json() and BEFORE mounting the webhook router
app.use("/webhooks/stripe", express.raw({ type: "application/json" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// health — does NOT touch the DB so it always reports the function is alive
app.get("/", (req, res) => res.send("Central Billing & Auth – OK"));
app.get("/api/health", (req, res) =>
  res.json({ status: "healthy", time: new Date().toISOString() })
);

// Ensure the DB is connected before any route that needs it (serverless-safe).
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

// bind routes
app.use("/oauth", authRoutes);          // /oauth/authorize
app.use("/oauth/social", socialRoutes); // /oauth/social/discord, /oauth/social/google
app.use("/oauth", tokenRoutes);         // /oauth/token
app.use("/api", userRoutes);            // /api/userinfo, /api/me/entitlements, /api/billing/*
app.use("/webhooks", webhookRoutes);    // /webhooks/stripe
app.use("/.well-known", jwksRoutes);    // /.well-known/jwks.json
app.use("/api/auth", localAuthRoutes);  // /api/auth/register

// 404 + error
app.use(notFound);
app.use(errorHandler);

export default app;
