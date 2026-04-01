import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    sub: { type: String, unique: true, index: true }, // stable subject
    email: { type: String, unique: true, sparse: true },
    emailVerified: { type: Boolean, default: false },
    passwordHash: { type: String }, // if using email/password
    stripeCustomerId: { type: String, index: true },
    roles: { type: [String], default: ["member"] },
    metadata: { type: mongoose.Schema.Types.Mixed },
    // OAuth provider links
    discordId:       { type: String, sparse: true, index: true },
    discordUsername: { type: String },
    googleId:        { type: String, sparse: true, index: true },
    googleEmail:     { type: String },
    avatarUrl:       { type: String },
  },
  { timestamps: true }
);

export default mongoose.model("User", UserSchema);
