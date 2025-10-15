import { Router } from "express";
import crypto from "crypto";
import AuthCode from "../models/authCode.model.js";
import RefreshToken from "../models/refreshToken.model.js";
import User from "../models/user.model.js";
import { SignJWT } from "jose";
import { signAccessToken, signIdToken } from "../utils/jwt.util.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

router.post(
  "/token",
  asyncHandler(async (req, res) => {
    const { grant_type } = req.body;

    if (grant_type === "authorization_code") {
      const { code, code_verifier, redirect_uri, client_id } = req.body;
      const auth = await AuthCode.findOne({ code });
      if (
        !auth ||
        auth.clientId !== client_id ||
        auth.redirectUri !== redirect_uri ||
        auth.expiresAt < new Date()
      ) {
        return res.status(400).json({ error: "invalid_grant" });
      }

      // verify PKCE
      const expected = base64url(crypto.createHash("sha256").update(code_verifier).digest());
      if (expected !== auth.codeChallenge) {
        return res.status(400).json({ error: "invalid_grant" });
      }

      const user = await User.findOne({ sub: auth.sub });
      if (!user) return res.status(400).json({ error: "invalid_user" });

      const access_token = await signAccessToken({
        sub: user.sub,
        aud: auth.audience.length ? auth.audience : (process.env.JWT_AUDIENCES || "").split(","),
        scope: auth.scope,
        claims: {
          email: user.email,
          email_verified: user.emailVerified,
          roles: user.roles,
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

      // refresh token
      const refresh = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 1000 * (parseInt(process.env.REFRESH_TOKEN_TTL || "2592000")));
      await RefreshToken.create({
        token: refresh,
        clientId: client_id,
        sub: user.sub,
        scope: auth.scope,
        audience: auth.audience,
        expiresAt,
      });

      await auth.deleteOne();
      return res.json({
        token_type: "Bearer",
        access_token,
        id_token,
        refresh_token: refresh,
        expires_in: parseInt(process.env.ACCESS_TOKEN_TTL || "3600", 10),
        scope: auth.scope,
      });
    }

    if (grant_type === "refresh_token") {
      const { refresh_token, client_id } = req.body;
      const rt = await RefreshToken.findOne({ token: refresh_token, revoked: { $ne: true } });
      if (!rt || rt.clientId !== client_id || rt.expiresAt < new Date()) {
        return res.status(400).json({ error: "invalid_grant" });
      }
      const user = await User.findOne({ sub: rt.sub });
      if (!user) return res.status(400).json({ error: "invalid_user" });

      const access_token = await signAccessToken({
        sub: user.sub,
        aud: rt.audience,
        scope: rt.scope,
        claims: {
          email: user.email,
          email_verified: user.emailVerified,
          roles: user.roles,
          stripe_customer_id: user.stripeCustomerId,
        },
      });

      return res.json({
        token_type: "Bearer",
        access_token,
        expires_in: parseInt(process.env.ACCESS_TOKEN_TTL || "3600", 10),
        scope: rt.scope,
      });
    }

    if (grant_type === "client_credentials") {
      // backend-2-backend
      const { client_id, client_secret, audience = "" } = req.body;
      // TODO: replace with real client store; for now accept any non-empty (dev only)
      if (!client_id || !client_secret) return res.status(400).json({ error: "invalid_client" });

      // machine subject = client_id
      const access_token = await signAccessToken({
        sub: `client:${client_id}`,
        aud: audience ? audience.split(",") : (process.env.JWT_AUDIENCES || "").split(","),
        scope: "machine",
      });
      return res.json({
        token_type: "Bearer",
        access_token,
        expires_in: parseInt(process.env.ACCESS_TOKEN_TTL || "3600", 10),
        scope: "machine",
      });
    }

    return res.status(400).json({ error: "unsupported_grant_type" });
  })
);

export default router;
