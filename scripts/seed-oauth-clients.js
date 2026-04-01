/**
 * Seeds OAuth clients for apps that use CB SSO.
 * Run once: node scripts/seed-oauth-clients.js
 * Add new apps here as they join the SSO system.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import OAuthClient from '../models/oauthClient.model.js';

dotenv.config();

const CLIENTS = [
  {
    clientId: 'muchogusto',
    name: 'Mucho Gusto Xo',
    redirectUris: [
      'https://muchogusto-backend-production.up.railway.app/api/auth/social/callback',
      'http://localhost:3001/api/auth/social/callback',
    ],
    allowedScopes: ['openid', 'email', 'profile'],
  },
  {
    clientId: 'myconsent',
    name: 'MyConsent.me',
    redirectUris: [
      'https://backend.myconsent.me/api/auth/social/callback',
      'http://localhost:8800/api/auth/social/callback',
    ],
    allowedScopes: ['openid', 'email', 'profile'],
  },
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  for (const client of CLIENTS) {
    await OAuthClient.findOneAndUpdate(
      { clientId: client.clientId },
      client,
      { upsert: true, new: true }
    );
    console.log(`✅ ${client.name} registered`);
  }
  await mongoose.disconnect();
  console.log('Done.');
})();
