/**
 * Social OAuth routes for Central Billing.
 * Handles Discord and Google login on behalf of any registered app.
 *
 * Flow:
 *   App redirects user to:
 *     GET /oauth/social/discord?client_id=<app>&redirect_uri=<app_callback>
 *   CB stores state, redirects to Discord/Google.
 *   Provider redirects back to CB callback.
 *   CB finds/creates user, issues CB RS256 token.
 *   CB redirects to <redirect_uri>?token=<access_token>
 */

import { Router } from 'express';
import crypto from 'crypto';
import OAuthClient from '../models/oauthClient.model.js';
import SocialAuthState from '../models/socialAuthState.model.js';
import User from '../models/user.model.js';
import { signAccessToken } from '../utils/jwt.util.js';

const router = Router();

const DISCORD_CLIENT_ID     = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const GOOGLE_CLIENT_ID      = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET  = process.env.GOOGLE_CLIENT_SECRET;
const CB_BASE_URL           = process.env.CB_BASE_URL || 'https://centralbilling-backend.vercel.app';

// ── helpers ───────────────────────────────────────────────────────────────────

async function validateClient(clientId, redirectUri) {
  const client = await OAuthClient.findOne({ clientId });
  if (!client) throw Object.assign(new Error('invalid_client'), { status: 400 });
  if (!client.redirectUris.includes(redirectUri)) {
    throw Object.assign(new Error('invalid_redirect_uri'), { status: 400 });
  }
  return client;
}

async function findOrCreateSocialUser({ discordId, googleId, email, discordUsername, googleEmail, avatarUrl }) {
  // 1. Match by provider ID
  if (discordId) {
    const u = await User.findOne({ discordId });
    if (u) return u;
  }
  if (googleId) {
    const u = await User.findOne({ googleId });
    if (u) return u;
  }

  // 2. Match by email — link provider to existing account
  if (email) {
    const u = await User.findOne({ email: email.toLowerCase() });
    if (u) {
      if (discordId) { u.discordId = discordId; u.discordUsername = discordUsername || u.discordUsername; }
      if (googleId)  { u.googleId = googleId;   u.googleEmail = googleEmail || u.googleEmail; }
      if (avatarUrl && !u.avatarUrl) u.avatarUrl = avatarUrl;
      await u.save();
      return u;
    }
  }

  // 3. Create new CB user
  const sub = crypto.randomUUID();
  const user = await User.create({
    sub,
    email: email ? email.toLowerCase() : undefined,
    emailVerified: !!email,
    discordId:       discordId || undefined,
    discordUsername: discordUsername || undefined,
    googleId:        googleId || undefined,
    googleEmail:     googleEmail || undefined,
    avatarUrl:       avatarUrl || undefined,
    roles: ['member'],
  });
  return user;
}

// ── DISCORD ───────────────────────────────────────────────────────────────────

router.get('/discord', async (req, res, next) => {
  try {
    const { client_id, redirect_uri } = req.query;
    if (!client_id || !redirect_uri) return res.status(400).json({ error: 'missing_params' });
    await validateClient(client_id, redirect_uri);

    const state = crypto.randomBytes(24).toString('hex');
    await SocialAuthState.create({
      state, provider: 'discord', clientId: client_id, redirectUri: redirect_uri,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      redirect_uri: `${CB_BASE_URL}/oauth/social/discord/callback`,
      response_type: 'code',
      scope: 'identify email',
      state,
    });
    res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
  } catch (err) { next(err); }
});

router.get('/discord/callback', async (req, res, next) => {
  try {
    const { code, state, error } = req.query;
    if (error || !code || !state) return res.redirect(`/?error=discord_denied`);

    const pending = await SocialAuthState.findOne({ state, provider: 'discord' });
    if (!pending || pending.expiresAt < new Date()) return res.status(400).json({ error: 'invalid_state' });
    await pending.deleteOne();

    // Exchange code for token
    const tokenResp = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${CB_BASE_URL}/oauth/social/discord/callback`,
      }),
    });
    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) throw new Error('No access_token from Discord');

    // Get Discord profile
    const profileResp = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const { id: discordId, username, global_name, email, avatar } = await profileResp.json();
    const avatarUrl = avatar ? `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png` : null;

    const user = await findOrCreateSocialUser({
      discordId, discordUsername: global_name || username, email, avatarUrl,
    });

    const accessToken = await signAccessToken({
      sub: user.sub,
      aud: pending.clientId,
      scope: 'openid email profile',
      claims: { email: user.email, roles: user.roles, discordUsername: user.discordUsername },
    });

    const dest = new URL(pending.redirectUri);
    dest.searchParams.set('token', accessToken);
    res.redirect(dest.toString());
  } catch (err) { next(err); }
});

// ── GOOGLE ────────────────────────────────────────────────────────────────────

router.get('/google', async (req, res, next) => {
  try {
    const { client_id, redirect_uri } = req.query;
    if (!client_id || !redirect_uri) return res.status(400).json({ error: 'missing_params' });
    await validateClient(client_id, redirect_uri);

    const state = crypto.randomBytes(24).toString('hex');
    await SocialAuthState.create({
      state, provider: 'google', clientId: client_id, redirectUri: redirect_uri,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: `${CB_BASE_URL}/oauth/social/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  } catch (err) { next(err); }
});

router.get('/google/callback', async (req, res, next) => {
  try {
    const { code, state, error } = req.query;
    if (error || !code || !state) return res.redirect(`/?error=google_denied`);

    const pending = await SocialAuthState.findOne({ state, provider: 'google' });
    if (!pending || pending.expiresAt < new Date()) return res.status(400).json({ error: 'invalid_state' });
    await pending.deleteOne();

    // Exchange code for token
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: `${CB_BASE_URL}/oauth/social/google/callback`,
        grant_type: 'authorization_code',
        code,
      }),
    });
    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) throw new Error('No access_token from Google');

    // Get Google profile
    const profileResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const { sub: googleId, email, name, picture } = await profileResp.json();

    const user = await findOrCreateSocialUser({
      googleId, email, googleEmail: email, avatarUrl: picture || null,
    });

    const accessToken = await signAccessToken({
      sub: user.sub,
      aud: pending.clientId,
      scope: 'openid email profile',
      claims: { email: user.email, roles: user.roles },
    });

    const dest = new URL(pending.redirectUri);
    dest.searchParams.set('token', accessToken);
    res.redirect(dest.toString());
  } catch (err) { next(err); }
});

export default router;
