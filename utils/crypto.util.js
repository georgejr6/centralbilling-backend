// utils/crypto.util.js
import { nanoid } from 'nanoid';
import crypto from 'crypto';
export function genRandomToken(len = 48) {
  return crypto.randomBytes(len).toString('hex');
}
export function genId(prefix = '') {
  return prefix + nanoid();
}
