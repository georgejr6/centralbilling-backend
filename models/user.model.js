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
  },
  { timestamps: true }
);

export default mongoose.model("User", UserSchema);
