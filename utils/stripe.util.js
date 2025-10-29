// utils/stripe.util.js
import dotenv from "dotenv";
dotenv.config(); // ensure .env is loaded even if this is imported early

import Stripe from "stripe";
import SubscriptionCache from "../models/subscriptionCache.model.js";

let stripeInstance = null;
export function getStripe() {
  if (stripeInstance) return stripeInstance;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY not set in environment (.env).");
  }
  stripeInstance = new Stripe(key);
  return stripeInstance;
}

export const priceToEntitlements = () => {
  try {
    return JSON.parse(process.env.STRIPE_PRICE_TO_ENTITLEMENTS || "{}");
  } catch {
    return {};
  }
};

export async function createCheckoutSession({ customer, priceId, successUrl, cancelUrl }) {
  const stripe = getStripe();
  return await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer,
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
}

export async function createPortalSession({ customer, returnUrl }) {
  const stripe = getStripe();
  return await stripe.billingPortal.sessions.create({
    customer,
    return_url: returnUrl,
  });
}

export function mapPlansToEntitlements(prices) {
  const map = priceToEntitlements();
  const ent = new Set();
  prices.forEach((p) => (map[p] || []).forEach((e) => ent.add(e)));
  return [...ent];
}

export async function upsertSubscriptionCache({ sub, stripeSubscription }) {
  const prices = stripeSubscription.items.data.map((i) => i.price.id);
  const entitlements = mapPlansToEntitlements(prices);
  await SubscriptionCache.findOneAndUpdate(
    { sub, stripeSubscriptionId: stripeSubscription.id },
    {
      status: stripeSubscription.status,
      planIds: prices,
      entitlements,
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
    },
    { upsert: true, new: true }
  );
}

/** NEW: list public plans (Stripe Prices) to display in app */
export async function listPublicPlans({ audience } = {}) {
  const stripe = getStripe();

  // Pull active recurring prices and expand product in one shot
  const prices = await stripe.prices.list({
    active: true,
    type: "recurring",
    expand: ["data.product"],
    limit: 100,
  });

  const allowedLookupKeys = ("ms-homies-15,ys-the-homies,ms-digital-nomad" || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const onlyAllowed = new Set(allowedLookupKeys);

  const out = prices.data
    .filter((price) => {
      const product = price.product;
      if (!product || !product.active) return false;

      // Strategy 1 (recommended): use Product metadata flag
      const showFlag =
        product.metadata?.show_in_dashboard === "true" ||
        price.metadata?.show_in_dashboard === "true";

      // Strategy 2 (optional): allowlist by lookup_key env
      const onAllowlist =
        allowedLookupKeys.length === 0 ||
        (price.lookup_key && onlyAllowed.has(price.lookup_key));

      // Optional audience match (if you tag products/prices)
      const audienceTag =
        product.metadata?.audience || price.metadata?.audience || "";
      const matchesAudience =
        !audience || !audienceTag || audienceTag.split(",").includes(audience);

      return showFlag && onAllowlist && matchesAudience;
    })
    .map((price) => {
      const p = price.product;
      return {
        id: price.id,
        lookup_key: price.lookup_key || null,
        currency: price.currency,
        unit_amount: price.unit_amount,
        interval: price.recurring?.interval,
        interval_count: price.recurring?.interval_count,
        trial_period_days: price.recurring?.trial_period_days || null,
        product: {
          id: p.id,
          name: p.name,
          description: p.description || "",
        },
        metadata: {
          ...p.metadata,
          ...price.metadata,
        },
      };
    })
    // Optional: sort by product/price metadata
    .sort((a, b) => {
      const sa = Number(a.metadata.sort_order || 0);
      const sb = Number(b.metadata.sort_order || 0);
      return sa - sb;
    });

  return out;
}

export async function listCustomerSubscriptions(customerId) {
  if (!customerId) return [];
  const stripe = getStripe();

  // 1) List subs and expand price (not product) to respect expansion depth
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    expand: ["data.items.data.price"],
    limit: 100,
  });

  // 2) Collect unique product IDs from the prices
  const productIds = new Set();
  for (const s of subs.data) {
    for (const it of s.items.data) {
      const p = it.price;
      if (p && typeof p.product === "string") {
        productIds.add(p.product);
      }
    }
  }

  // 3) Retrieve product records (Stripe doesn't support filtering list by ids, so retrieve individually)
  const productMap = {};
  await Promise.all(
    [...productIds].map(async (pid) => {
      try {
        const prod = await stripe.products.retrieve(pid);
        productMap[pid] = prod;
      } catch {
        // ignore missing or deleted products
        productMap[pid] = null;
      }
    })
  );

  // 4) Build response using Product name/description (fallbacks to nickname / lookup_key)
  return subs.data.map((s) => ({
    id: s.id,
    status: s.status,
    current_period_end: s.current_period_end,
    created: s.created,
    items: s.items.data.map((it) => {
      const price = it.price;
      const prodId = typeof price.product === "string" ? price.product : null;
      const prod = prodId ? productMap[prodId] : null;
      return {
        price_id: price.id,
        lookup_key: price.lookup_key || null,
        product_name: (prod?.name) || price.nickname || price.lookup_key || "",
        product_description: (prod?.description) || "",
        interval: price.recurring?.interval,
        interval_count: price.recurring?.interval_count,
        unit_amount: price.unit_amount,
        currency: price.currency,
      };
    }),
  }));
}

// List recent invoices for a customer
export async function listCustomerInvoices(customerId, limit = 5) {
  if (!customerId) return [];
  const stripe = getStripe();
  const invoices = await stripe.invoices.list({
    customer: customerId,
    limit,
    expand: ["data.charge", "data.subscription"],
  });
  return invoices.data.map((inv) => ({
    id: inv.id,
    number: inv.number,
    status: inv.status,
    currency: inv.currency,
    amount_due: inv.amount_due,
    amount_paid: inv.amount_paid,
    hosted_invoice_url: inv.hosted_invoice_url,
    invoice_pdf: inv.invoice_pdf,
    created: inv.created,
    period_end: inv.lines?.data?.[0]?.period?.end || inv.period_end || null,
  }));
}
