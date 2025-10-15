// models/subscription.model.js
import mongoose from 'mongoose';

const { Schema } = mongoose;
const SubscriptionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  stripeSubscriptionId: { type: String },
  planId: String,
  status: String, // active, past_due, canceled, unpaid
  current_period_start: Date,
  current_period_end: Date,
  metadata: Schema.Types.Mixed
}, { timestamps: true });

export default mongoose.model('Subscription', SubscriptionSchema);
