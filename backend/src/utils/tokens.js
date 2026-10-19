import crypto from 'node:crypto';

/** 32 random bytes, base64url. Returned to the caller once; store only the hash. */
export function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** SHA-256 hex digest used for storing tokens server-side. */
export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}
