import { Router } from "express";
import { verifyJWT } from "../utils/jwt.util.js";
import { getStripe } from "../utils/stripe.util.js";
import User from "../models/user.model.js";

// The one piece Studio's pricing page was calling that never existed: a hosted
// GET /checkout the browser can be redirected to (see novam-scheduler's
// src/lib/studioAuth.js -> startCheckout()). It resolves plan/topup -> a real
// Stripe Price and sends the browser to Stripe's own hosted checkout page —
// no custom payment form to build or secure.

const STUDIO_LOGIN_URL = process.env.STUDIO_LOGIN_URL || "https://studio.thehomies.app/login";
const DEFAULT_SUCCESS_URL = process.env.STUDIO_CHECKOUT_SUCCESS_URL || "https://studio.thehomies.app/redeem?checkout=success";
const DEFAULT_CANCEL_URL = process.env.STUDIO_CHECKOUT_CANCEL_URL || "https://studio.thehomies.app/pricing";

// plan/topup id -> Stripe Price ID. Configure via STUDIO_PLAN_PRICES (JSON string env var), e.g.
// {"starter":"price_...","creator":"price_...","pro":"price_...","weekly":"price_...",
//  "creator_yr":"price_...","pro_yr":"price_...","topup_500":"price_...","topup_1500":"price_..."}
function loadPlanPrices() {
  try {
    return JSON.parse(process.env.STUDIO_PLAN_PRICES || "{}");
  } catch {
    return {};
  }
}

function bounceToLogin(res) {
  const url = new URL(STUDIO_LOGIN_URL);
  url.searchParams.set("next", "/pricing");
  return res.redirect(url.toString());
}

const router = Router();

// GET /checkout?client_id=&plan=&topup=&code=&return_url=&cancel_url=&cbt=
router.get("/checkout", async (req, res) => {
  const { plan, topup, return_url, cancel_url, cbt } = req.query;
  const successUrl = return_url || DEFAULT_SUCCESS_URL;
  const cancelUrl = cancel_url || DEFAULT_CANCEL_URL;

  // Not signed in yet (no cb_token in localStorage when Subscribe was clicked)
  // -> bounce into the Studio's own working login, which comes right back here.
  if (!cbt) return bounceToLogin(res);

  let payload;
  try {
    payload = await verifyJWT(cbt);
  } catch {
    return bounceToLogin(res);
  }

  const planId = plan || topup;
  if (!planId) return res.status(400).send("Missing plan or topup.");

  const prices = loadPlanPrices();
  const priceId = prices[planId];
  if (!priceId) {
    // Fails loud and specific instead of a dead redirect, so this is fixable
    // in one look rather than a silent no-op.
    return res.status(500).send(
      `No Stripe price configured for "${planId}". Set STUDIO_PLAN_PRICES to include it.`
    );
  }

  const user = await User.findOne({ sub: payload.sub });
  if (!user) return res.status(404).send("Account not found.");

  const stripe = getStripe();
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    // Older/edge-case accounts that predate customer-on-register. Create one
    // now rather than blocking the purchase.
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { sub: user.sub },
    });
    customerId = customer.id;
    user.stripeCustomerId = customerId;
    await user.save();
  }

  // NOTE: topups (one-time credit purchases) create a real Stripe payment, but
  // there is no fulfillment wired yet to grant the credits afterward — that
  // needs a call into novam-scheduler's credit ledger from the webhook. Left
  // out of this fix on purpose (subscriptions are what actually pay rent);
  // don't advertise topups as working until that's built.
  const session = await stripe.checkout.sessions.create({
    mode: topup ? "payment" : "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: successUrl,
    cancel_url: cancelUrl,
    ...(topup ? {} : { subscription_data: { metadata: { sub: user.sub, plan: planId } } }),
    metadata: { sub: user.sub, plan: planId },
  });

  return res.redirect(303, session.url);
});

export default router;
