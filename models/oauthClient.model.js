// models/oauthClient.model.js
import mongoose from 'mongoose';

const { Schema } = mongoose;
const OAuthClientSchema = new Schema({
  clientId: { type: String, required: true, unique: true },
  clientSecretHash: { type: String }, // optional for confidential clients
  name: String,
  redirectUris: [String],
  allowedScopes: [String]
}, { timestamps: true });

export default mongoose.model('OAuthClient', OAuthClientSchema);
