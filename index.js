import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import { connectDB } from "./db.js";
import { cleanupExpiredAuthCodes } from "./cron/cleanup.cron.js";

// Traditional long-running server entry (local dev, Railway, DO, etc.).
// On Vercel the app is served via api/index.js instead, and this file is not run.
const PORT = process.env.PORT || 8800;

(async () => {
  await connectDB();
  console.log("✅ Mongo connected");
  cleanupExpiredAuthCodes(); // node-cron only runs in a persistent process
  app.listen(PORT, () =>
    console.log(`🚀 Central Billing listening on :${PORT}`)
  );
})();
