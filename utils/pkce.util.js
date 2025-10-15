// utils/pkce.util.js
import crypto from 'crypto';

export function generateCodeVerifier() {
  return base64url(crypto.randomBytes(32));
}
export function createCodeChallenge(codeVerifier) {
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  return base64url(hash);
}
function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
