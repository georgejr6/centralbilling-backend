// Ecosystem bundles run through a SEPARATE "Central Billing" Stripe account
// (dedicated to cross-app bundles), distinct from the per-app accounts where
// existing members are billed. This router adds bundle checkout + a webhook for
// that account; bundle entitlements land in the same SubscriptionCache, so
// /api/me/entitlements unions them with any existing app subscription. Purely
// additive — existing billing/checkout/webhook are untouched.
import { Router } from "express";
import Stripe from "stripe";
import User from "../models/user.model.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { upsertSubscriptionCache } from "../utils/stripe.util.js";

const bundlesStripe = process.env.STRIPE_SECRET_KEY_BUNDLES
  ? new Stripe(process.env.STRIPE_SECRET_KEY_BUNDLES)
  : null;

const router = Router();

// A user's customer in the bundles account is separate from their app-account
// customer — look up by email, else create (tagged with their sub for mapping).
async function ensureBundlesCustomer(user) {
  if (user.email) {
    const existing = await bundlesStripe.customers.list({ email: user.email, limit: 1 });
    if (existing.data[0]) return existing.data[0].id;
  }
  const c = await bundlesStripe.customers.create({
    email: user.email || undefined,
    metadata: { sub: user.sub },
  });
  return c.id;
}

// POST /api/billing/bundle-checkout { lookupKey, successUrl?, cancelUrl? }
router.post(
  "/api/billing/bundle-checkout",
  requireAuth({ audience: (process.env.JWT_AUDIENCES || "").split(",") }),
  asyncHandler(async (req, res) => {
    if (!bundlesStripe) return res.status(500).json({ error: "bundles_stripe_not_configured" });
    const { lookupKey, successUrl, cancelUrl } = req.body || {};
    if (!lookupKey) return res.status(400).json({ error: "lookupKey_required" });

    const prices = await bundlesStripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
    const price = prices.data[0];
    if (!price) return res.status(404).json({ error: "price_not_found" });

    const user = await User.findOne({ sub: req.auth.sub });
    if (!user) return res.status(404).json({ error: "user_not_found" });
    const customer = await ensureBundlesCustomer(user);

    const session = await bundlesStripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price: price.id, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: successUrl || "https://myconsent.me/dashboard?bundle=1",
      cancel_url: cancelUrl || "https://myconsent.me/pricing",
      subscription_data: { metadata: { sub: user.sub } },
      metadata: { sub: user.sub },
    });
    res.json({ id: session.id, url: session.url });
  })
);

// POST /webhooks/stripe-bundles — bundles account → shared entitlement cache.
router.post(
  "/webhooks/stripe-bundles",
  asyncHandler(async (req, res) => {
    if (!bundlesStripe) return res.status(500).send("bundles_stripe_not_configured");
    let event;
    try {
      event = bundlesStripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        process.env.STRIPE_WEBHOOK_SECRET_BUNDLES
      );
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    if (event.type.startsWith("customer.subscription.")) {
      const subObj = event.data.object;
      const ownerSub = subObj.metadata?.sub;
      const user = ownerSub ? await User.findOne({ sub: ownerSub }) : null;
      if (user) {
        await upsertSubscriptionCache({ sub: user.sub, stripeSubscription: subObj });
      }
    }
    res.json({ received: true });
  })
);

export default router;
