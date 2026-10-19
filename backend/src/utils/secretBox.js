import crypto from 'node:crypto';
import { getContext } from '../context.js';

/**
 * AES-256-GCM sealing for secrets that must be re-sent later (action links in reminder emails).
 * Plaintext secrets never touch the database; only the sealed form is stored. The key comes
 * from ENCRYPTION_KEY and must never be committed.
 */
function key() {
  const raw = getContext().config.encryptionKey;
  if (!raw) throw new Error('ENCRYPTION_KEY is not configured');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('ENCRYPTION_KEY must decode to 32 bytes');
  return buf;
}

export function seal(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}

export function unseal(sealed) {
  const [ivB64, tagB64, dataB64] = String(sealed).split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}
