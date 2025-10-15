import mongoose from "mongoose";

const SubscriptionCacheSchema = new mongoose.Schema(
  {
    sub: { type: String, index: true },
    stripeSubscriptionId: { type: String, index: true },
    status: { type: String },
    planIds: { type: [String], default: [] },
    entitlements: { type: [String], default: [] },
    currentPeriodEnd: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("SubscriptionCache", SubscriptionCacheSchema);
