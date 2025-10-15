import mongoose from "mongoose";

const AuthCodeSchema = new mongoose.Schema(
  {
    code: { type: String, unique: true, index: true },
    clientId: { type: String, required: true },
    redirectUri: { type: String, required: true },
    codeChallenge: { type: String, required: true },
    codeChallengeMethod: { type: String, enum: ["S256"], default: "S256" },
    scope: { type: String, default: "openid profile email" },
    audience: { type: [String], default: [] },
    sub: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

export default mongoose.model("AuthCode", AuthCodeSchema);
