import cron from "node-cron";
import AuthCode from "../models/authCode.model.js";
import RefreshToken from "../models/refreshToken.model.js";

export function cleanupExpiredAuthCodes() {
  // every hour
  cron.schedule("15 * * * *", async () => {
    const now = new Date();
    await AuthCode.deleteMany({ expiresAt: { $lte: now } });
    await RefreshToken.deleteMany({ expiresAt: { $lte: now } });
  });
}
