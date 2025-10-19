import { Router } from "express";
import User from "../models/user.model.js";
import SubscriptionCache from "../models/subscriptionCache.model.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createCheckoutSession,
  createPortalSession,
  listPublicPlans,
  listCustomerSubscriptions,
  listCustomerInvoices
} from "../utils/stripe.util.js";

const router = Router();

// OIDC userinfo
router.get(
  "/userinfo",
  requireAuth({ audience: (process.env.JWT_AUDIENCES || "").split(",") }),
  asyncHandler(async (req, res) => {
    const u = await User.findOne({ sub: req.auth.sub });
    res.json({
      sub: u.sub,
      email: u.email,
      email_verified: u.emailVerified,
      roles: u.roles,
      stripe_customer_id: u.stripeCustomerId,
    });
  })
);

// entitlements
router.get(
  "/me/entitlements",
  requireAuth({ audience: (process.env.JWT_AUDIENCES || "").split(",") }),
  asyncHandler(async (req, res) => {
    const caches = await SubscriptionCache.find({ sub: req.auth.sub, status: { $in: ["active", "trialing"] } });
    const ent = new Set();
    caches.forEach((c) => c.entitlements.forEach((e) => ent.add(e)));
    res.json({ entitlements: [...ent] });
  })
);

// start checkout
router.post(
  "/billing/checkout",
  requireAuth({ audience: (process.env.JWT_AUDIENCES || "").split(",") }),
  asyncHandler(async (req, res) => {
    const { priceId, successUrl, cancelUrl } = req.body;
    const user = await User.findOne({ sub: req.auth.sub });
    if (!user?.stripeCustomerId) return res.status(400).json({ error: "missing_stripe_customer" });
    const session = await createCheckoutSession({
      customer: user.stripeCustomerId,
      priceId,
      successUrl,
      cancelUrl,
    });
    res.json({ id: session.id, url: session.url });
  })
);

// portal session
router.post(
  "/billing/portal",
  requireAuth({ audience: (process.env.JWT_AUDIENCES || "").split(",") }),
  asyncHandler(async (req, res) => {
    const { returnUrl } = req.body;
    const user = await User.findOne({ sub: req.auth.sub });
    if (!user?.stripeCustomerId) return res.status(400).json({ error: "missing_stripe_customer" });
    const session = await createPortalSession({ customer: user.stripeCustomerId, returnUrl });
    res.json({ url: session.url });
  })
);

// GET /api/billing/plans
router.get(
  "/billing/plans",
  requireAuth({ audience: (process.env.JWT_AUDIENCES || "").split(",") }),
  asyncHandler(async (req, res) => {
    // Optionally filter by "audience" query, e.g. ?audience=api:app1
    const audience = req.query.audience || "";
    const plans = await listPublicPlans({ audience });
    res.json({ plans });
  })
);

// GET /api/billing/my-subscriptions
router.get(
  "/billing/my-subscriptions",
  requireAuth({ audience: (process.env.JWT_AUDIENCES || "").split(",") }),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ sub: req.auth.sub });
    if (!user?.stripeCustomerId) return res.json({ subscriptions: [] });
    const subs = await listCustomerSubscriptions(user.stripeCustomerId);
    res.json({ subscriptions: subs });
  })
);

// POST /api/billing/sync  (optional emergency sync)
router.post(
  "/billing/sync",
  requireAuth({ audience: (process.env.JWT_AUDIENCES || "").split(",") }),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ sub: req.auth.sub });
    if (!user?.stripeCustomerId) return res.status(400).json({ error: "missing_stripe_customer" });

    const stripe = getStripe();
    const subs = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: "all",
      expand: ["data.items.data.price"],
      limit: 100,
    });

    // update cache for all returned subs
    for (const s of subs.data) {
      await upsertSubscriptionCache({ sub: user.sub, stripeSubscription: s });
    }

    res.json({ ok: true, count: subs.data.length });
  })
);

// GET /api/billing/summary
router.get(
  "/billing/summary",
  requireAuth({ audience: (process.env.JWT_AUDIENCES || "").split(",") }),
  asyncHandler(async (req, res) => {
    const me = await User.findOne({ sub: req.auth.sub });
    if (!me?.stripeCustomerId) {
      return res.json({
        activeSubscription: null,
        entitlements: [],
        invoices: [],
      });
    }

    const [subs, invoices] = await Promise.all([
      listCustomerSubscriptions(me.stripeCustomerId),
      listCustomerInvoices(me.stripeCustomerId, 5),
    ]);

    // choose the "current" subscription
    const active = subs.find((s) => ["active", "trialing", "past_due", "incomplete"].includes(s.status))
      || subs.sort((a, b) => b.created - a.created)[0]
      || null;

    // flatten a primary price line to show in UI
    let primary = null;
    if (active?.items?.length) {
      // pick the first item by highest amount or just first
      primary = [...active.items].sort((a, b) => (b.unit_amount || 0) - (a.unit_amount || 0))[0];
    }

    res.json({
      activeSubscription: active
        ? {
            id: active.id,
            status: active.status,
            current_period_end: active.current_period_end,
            price: primary && {
              id: primary.price_id,
              product_name: primary.product_name,
              product_description: primary.product_description,
              unit_amount: primary.unit_amount,
              currency: primary.currency,
              interval: primary.interval,
              interval_count: primary.interval_count,
            },
          }
        : null,
      // If you store entitlements in your cache, you can also include them here;
      // for simplicity we can let the UI call /api/me/entitlements separately if needed.
      entitlements: [], 
      invoices,
    });
  })
);


export default router;
