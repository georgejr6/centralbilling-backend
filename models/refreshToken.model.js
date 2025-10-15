import mongoose from "mongoose";

const RefreshTokenSchema = new mongoose.Schema(
  {
    token: { type: String, unique: true, index: true },
    clientId: { type: String, required: true },
    sub: { type: String, required: true },
    scope: { type: String },
    audience: { type: [String], default: [] },
    expiresAt: { type: Date, required: true },
    rotatedAt: { type: Date },
    revoked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("RefreshToken", RefreshTokenSchema);
