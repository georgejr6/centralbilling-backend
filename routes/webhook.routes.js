import express from "express";

import { Router } from "express";
import  { getStripe, upsertSubscriptionCache } from "../utils/stripe.util.js";
import User from "../models/user.model.js";
const router = Router();

// raw body for webhook verification
router.post(
  "/stripe",
  async (req, res) => {
    try {
      // Lazily resolve Stripe here — calling getStripe() at module top-level would
      // throw on import (crashing the whole serverless function) when STRIPE_SECRET_KEY
      // isn't configured, taking down auth/OAuth routes that don't need Stripe at all.
      const stripe = getStripe();
      const sig = req.headers["stripe-signature"];
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const subObj = event.data.object;
          // find user by customer id
          const user = await User.findOne({ stripeCustomerId: subObj.customer });
          if (user) {
            await upsertSubscriptionCache({ sub: user.sub, stripeSubscription: subObj });
          }
          break;
        }
        default:
          // ignore others or add invoice.paid/payment_failed as needed
          break;
      }

      res.json({ received: true });
    } catch (err) {
      console.error("Stripe webhook error:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
);

export default router;
