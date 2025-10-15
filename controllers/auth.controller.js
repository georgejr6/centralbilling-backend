// controllers/auth.controller.js
import AuthCode from '../models/authCode.model.js';
import OAuthClient from '../models/oauthClient.model.js';
import User from '../models/user.model.js';
import { genRandomToken } from '../utils/crypto.util.js';

export async function authorizeHandler(req, res, next) {
  try {
    const { response_type, client_id, redirect_uri, scope, code_challenge, code_challenge_method, state } = req.query;
    // Validate client
    const client = await OAuthClient.findOne({ clientId: client_id });
    if (!client) return res.status(400).send('invalid_client');
    if (!client.redirectUris.includes(redirect_uri)) return res.status(400).send('invalid_redirect_uri');
    if (!code_challenge || code_challenge_method !== 'S256') return res.status(400).send('PKCE_required');

    // For the demo, we accept login_user_id query param to auto-login — replace with real login UI
    const loginUserId = req.query.login_user_id;
    if (!loginUserId) {
      // Redirect to your central login page (not implemented here)
      return res.status(401).send('login required — implement central login UI');
    }
    const user = await User.findById(loginUserId);
    if (!user) return res.status(400).send('user_not_found');

    const code = genRandomToken(24);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await AuthCode.create({
      code, clientId: client_id, userId: user._id, codeChallenge: code_challenge,
      codeChallengeMethod: 'S256', scope: scope ? scope.split(' ') : [], expiresAt
    });
    const redirect = new URL(redirect_uri);
    redirect.searchParams.set('code', code);
    if (state) redirect.searchParams.set('state', state);
    return res.redirect(redirect.toString());
  } catch (err) {
    next(err);
  }
}
