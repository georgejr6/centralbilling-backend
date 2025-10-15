import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import User from "../models/user.model.js";
import { getStripe } from "../utils/stripe.util.js";
import RefreshToken from "../models/refreshToken.model.js";
import { signAccessToken, signIdToken } from "../utils/jwt.util.js";

const router = Router();

router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "invalid_request", message: "Email and password are required." });
    }
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: "conflict", message: "Email already in use." });
    }

    const stripe = getStripe();
    const customer = await stripe.customers.create({
      email,
      name: name || undefined,
      metadata: { source: "central-billing-register" },
    });

    const sub = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);

    await User.create({
      sub,
      email: email.toLowerCase(),
      emailVerified: false,
      passwordHash,
      stripeCustomerId: customer.id,
      roles: ["member"],
      metadata: { name: name || "" },
    });

    return res.status(201).json({ ok: true, sub, email });
  } catch (err) {
    next(err);
  }
});

/** LOGIN */
router.post("/login", async (req, res, next) => {
  try {
    const { email, password, client_id = "dashboard-spa" } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "invalid_request", message: "Email and password are required." });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "invalid_credentials", message: "Invalid email or password." });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "invalid_credentials", message: "Invalid email or password." });
    }

    // tokens
    const aud = (process.env.JWT_AUDIENCES || "").split(",").filter(Boolean);
    const scope = "openid profile email dashboard";

const roles = Array.isArray(user.roles) ? user.roles.map(String) : [];

const access_token = await signAccessToken({
  sub: user.sub,
  aud,                 // ok as array or string
  scope,               // string
  claims: {
    email: user.email,
    email_verified: user.emailVerified,
    roles,             // 👈 plain array, not a Mongoose array
    stripe_customer_id: user.stripeCustomerId,
  },
});

    const id_token = await signIdToken({
      sub: user.sub,
      claims: {
        email: user.email,
        email_verified: user.emailVerified,
      },
    });

    const refresh = crypto.randomUUID();
    const expiresAt = new Date(
      Date.now() + 1000 * (parseInt(process.env.REFRESH_TOKEN_TTL || "2592000"))
    );
    await RefreshToken.create({
      token: refresh,
      clientId: client_id,
      sub: user.sub,
      scope,
      audience: aud,
      expiresAt,
    });

    return res.json({
      ok: true,
      user: {
        sub: user.sub,
        email: user.email,
        roles: user.roles,
        stripeCustomerId: user.stripeCustomerId,
      },
      tokens: {
        token_type: "Bearer",
        access_token,
        id_token,
        refresh_token: refresh,
        expires_in: parseInt(process.env.ACCESS_TOKEN_TTL || "3600", 10),
        scope,
      },
    });
  } catch (err) {
    next(err);
  }
});



export default router;
