import { Router } from "express";
import randomstring from "randomstring";
import AuthCode from "../models/authCode.model.js";
import User from "../models/user.model.js";
import bcrypt from "bcryptjs";

const router = Router();

/**
 * Simple username/password form acceptor to demo the flow.
 * In production, redirect from your UI where the user already logged in at IdB.
 */
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    let user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const ok = user.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });
    res.json({ ok: true, sub: user.sub, email: user.email });
  } catch (e) { next(e); }
});

/**
 * Authorization endpoint: expects standard params + PKCE
 * response_type=code & client_id & redirect_uri & scope & code_challenge & code_challenge_method=S256 & audience
 */
router.get("/authorize", async (req, res, next) => {
  try {
    const {
      response_type,
      client_id,
      redirect_uri,
      scope = "openid email profile",
      code_challenge,
      code_challenge_method = "S256",
      state,
      audience, // comma separated list "api:app1,api:app2"
      sub,      // in real IdP you'd read from session; here allow passing for demo
    } = req.query;

    if (response_type !== "code") throw new Error("unsupported_response_type");
    if (!client_id || !redirect_uri || !code_challenge) throw new Error("invalid_request");
    if (!sub) throw new Error("not_authenticated"); // replace with real session lookup

    const code = randomstring.generate(40);
    const audArray = String(audience || "").split(",").filter(Boolean);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await AuthCode.create({
      code,
      clientId: client_id,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method,
      scope,
      audience: audArray,
      sub,
      expiresAt,
    });

    const url = new URL(redirect_uri);
    url.searchParams.set("code", code);
    if (state) url.searchParams.set("state", state);
    res.redirect(url.toString());
  } catch (e) {
    next(Object.assign(e, { status: 400 }));
  }
});

export default router;
