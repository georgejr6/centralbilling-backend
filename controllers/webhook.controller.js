// controllers/webhook.controller.js
import { stripe } from '../utils/stripe.util.js';
import Subscription from '../models/subscription.model.js';
import User from '../models/user.model.js';

export async function stripeWebhookHandler(req, res, next) {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    const raw = req.rawBody ?? req.body; // body-parser raw middleware sets rawBody
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerEmail = session.customer_details?.email || session.customer_email;
        const planId = session.metadata?.planId || null;
        // Map session -> user (you should set client_reference_id or metadata when creating checkout session)
        let user = null;
        if (session.client_reference_id) user = await User.findById(session.client_reference_id);
        if (!user && customerEmail) user = await User.findOne({ email: customerEmail });
        if (user) {
          await Subscription.create({
            userId: user._id,
            stripeSubscriptionId: session.subscription || null,
            planId,
            status: 'active',
            current_period_start: new Date(),
            current_period_end: new Date(Date.now() + 30 * 24 * 3600 * 1000)
          });
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const stripeSubId = invoice.subscription;
        const sub = await Subscription.findOne({ stripeSubscriptionId: stripeSubId });
        if (sub) {
          sub.status = 'past_due';
          await sub.save();
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object;
        const sub = await Subscription.findOne({ stripeSubscriptionId: stripeSub.id });
        if (sub) {
          sub.status = stripeSub.status;
          sub.current_period_start = new Date(stripeSub.current_period_start * 1000);
          sub.current_period_end = new Date(stripeSub.current_period_end * 1000);
          await sub.save();
        }
        break;
      }
      default:
        console.log('Unhandled stripe event type', event.type);
    }

    // return success
    res.json({ received: true });
  } catch (err) {
    next(err);
  }
}
