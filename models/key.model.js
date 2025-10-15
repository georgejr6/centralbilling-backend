import mongoose from "mongoose";

const KeySchema = new mongoose.Schema(
  {
    kid: { type: String, unique: true, index: true },
    publicJwk: { type: Object, required: true },
    privateJwk: { type: Object, required: true }, // store encrypted at-rest if needed
    alg: { type: String, default: "RS256" },
    status: { type: String, enum: ["active", "retired"], default: "active" },
  },
  { timestamps: true }
);

export default mongoose.model("Key", KeySchema);
