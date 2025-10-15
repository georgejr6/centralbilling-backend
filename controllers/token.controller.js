// controllers/token.controller.js
import AuthCode from '../models/authCode.model.js';
import OAuthClient from '../models/oauthClient.model.js';
import RefreshToken from '../models/refreshToken.model.js';
import User from '../models/user.model.js';
import { genRandomToken } from '../utils/crypto.util.js';
import { signAccessToken } from '../utils/jwt.util.js';
import dotenv from 'dotenv';
dotenv.config();

const REFRESH_EXPIRE_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRE_DAYS || 30);

export async function tokenHandler(req, res, next) {
  try {
    const { grant_type } = req.body;
    if (grant_type === 'authorization_code') {
      const { code, client_id, code_verifier } = req.body;
      const authCode = await AuthCode.findOne({ code });
      if (!authCode || authCode.used || authCode.expiresAt < new Date()) return res.status(400).json({ error: 'invalid_grant' });
      const client = await OAuthClient.findOne({ clientId: client_id });
      if (!client) return res.status(400).json({ error: 'invalid_client' });

      // Verify PKCE
      const expected = base64url(require('crypto').createHash('sha256').update(code_verifier).digest());
      if (expected !== authCode.codeChallenge) return res.status(400).json({ error: 'invalid_grant' });

      authCode.used = true;
      await authCode.save();
      const user = await User.findById(authCode.userId);
      if (!user) return res.status(400).json({ error: 'invalid_grant' });

      const accessToken = signAccessToken({ sub: String(user._id), email: user.email, aud: client_id });
      const refreshValue = genRandomToken(48);
      const refresh = await RefreshToken.create({
        token: refreshValue, userId: user._id, clientId: client_id,
        expiresAt: new Date(Date.now() + REFRESH_EXPIRE_DAYS * 24 * 3600 * 1000)
      });
      return res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 60 * 10,
        refresh_token: refresh.token
      });
    }

    if (grant_type === 'refresh_token') {
      const { refresh_token, client_id } = req.body;
      const stored = await RefreshToken.findOne({ token: refresh_token });
      if (!stored || stored.revoked || stored.expiresAt < new Date()) return res.status(400).json({ error: 'invalid_grant' });

      // rotate
      stored.revoked = true;
      const newTokenValue = genRandomToken(48);
      stored.replacedByToken = newTokenValue;
      await stored.save();
      const newRT = await RefreshToken.create({
        token: newTokenValue, userId: stored.userId, clientId: client_id,
        expiresAt: new Date(Date.now() + REFRESH_EXPIRE_DAYS * 24 * 3600 * 1000)
      });
      const user = await User.findById(stored.userId);
      const accessToken = signAccessToken({ sub: String(user._id), email: user.email, aud: client_id });
      return res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 60 * 10,
        refresh_token: newRT.token
      });
    }

    return res.status(400).json({ error: 'unsupported_grant_type' });
  } catch (err) {
    next(err);
  }
}

function base64url(buffer) {
  // accepts Buffer
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
