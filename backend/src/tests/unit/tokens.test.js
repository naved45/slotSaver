import { describe, it, expect } from 'vitest';
import { generateToken, hashToken } from '../../utils/tokens.js';

describe('tokens', () => {
  it('generates url-safe tokens of expected length', () => {
    const t = generateToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBe(43); // 32 bytes base64url
  });

  it('generates unique tokens', () => {
    expect(generateToken()).not.toBe(generateToken());
  });

  it('hashes deterministically and never equals the raw token', () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toBe(t);
    expect(hashToken(t)).toMatch(/^[a-f0-9]{64}$/);
  });
});
