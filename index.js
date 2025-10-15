import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";

import authRoutes from "./routes/auth.routes.js";
import tokenRoutes from "./routes/token.routes.js";
import userRoutes from "./routes/user.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import jwksRoutes from "./routes/jwks.routes.js";
import localAuthRoutes from "./routes/auth.local.routes.js";

import { errorHandler, notFound } from "./middlewares/error.middleware.js";
import { cleanupExpiredAuthCodes } from "./cron/cleanup.cron.js";

dotenv.config();

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// health
app.get("/", (req, res) => res.send("Central Billing & Auth – OK"));
app.get("/api/health", (req, res) =>
  res.json({ status: "healthy", time: new Date().toISOString() })
);

// bind routes
app.use("/oauth", authRoutes);        // /oauth/authorize
app.use("/oauth", tokenRoutes);       // /oauth/token
app.use("/api", userRoutes);          // /api/userinfo, /api/me/entitlements, /api/billing/*
app.use("/webhooks", webhookRoutes);  // /webhooks/stripe
app.use("/.well-known", jwksRoutes);  // /.well-known/jwks.json
app.use("/api/auth", localAuthRoutes); // <-- /api/auth/register
// 404 + error
app.use(notFound);
app.use(errorHandler);

// start
const PORT = process.env.PORT || 8800;

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Mongo connected");
  cleanupExpiredAuthCodes(); // schedule cron
  app.listen(PORT, () =>
    console.log(`🚀 Central Billing listening on :${PORT}`)
  );
})();
