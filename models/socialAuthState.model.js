import mongoose from 'mongoose';

// Stores pending OAuth state while user goes through Discord/Google flow
// TTL: 10 minutes
const SocialAuthStateSchema = new mongoose.Schema({
  state:       { type: String, required: true, unique: true, index: true },
  provider:    { type: String, enum: ['discord', 'google'], required: true },
  clientId:    { type: String, required: true },
  redirectUri: { type: String, required: true },
  expiresAt:   { type: Date, required: true, index: { expires: 0 } },
});

export default mongoose.model('SocialAuthState', SocialAuthStateSchema);
