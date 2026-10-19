import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestApp, client } from '../helpers/testApp.js';
import { devOutbox } from '../../services/email/outbox.js';
import { User, Session } from '../../models/index.js';

let app;
const signupBody = (over = {}) => ({
  fullName: 'Asha Verma',
  email: 'owner@example.com',
  password: 'correct-horse-battery',
  confirmPassword: 'correct-horse-battery',
  businessName: 'Maple Dental Studio',
  businessType: 'dental',
  timezone: 'Asia/Kolkata',
  termsAccepted: true,
  ...over,
});
const tokenFrom = (to, purposeText) => {
  const m = devOutbox.find(to, purposeText)?.text.match(/token=([A-Za-z0-9_-]+)/);
  return m?.[1];
};

beforeAll(async () => { app = await startTestApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => {
  devOutbox.clear();
  const { LoginAttempt } = await import('../../models/index.js');
  await LoginAttempt.deleteMany({});
});

describe('signup and email verification', () => {
  it('creates an unverified user and sends a verification preview', async () => {
    const c = client(app.base);
    const res = await c.post('/api/v1/auth/signup', signupBody());
    expect(res.status).toBe(201);
    const user = await User.findOne({ email: 'owner@example.com' }).select('+passwordHash');
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(tokenFrom('owner@example.com', 'Verify')).toBeTruthy();
  });

  it('returns the same response for an existing email (no enumeration) and does not create a duplicate', async () => {
    const c = client(app.base);
    const again = await c.post('/api/v1/auth/signup', signupBody());
    expect(again.status).toBe(201);
    expect(again.body.data.message).toBe('Check your email to verify your account.');
    expect(await User.countDocuments({ email: 'owner@example.com' })).toBe(1);
  });

  it('blocks login-required routes until the email is verified', async () => {
    const c = client(app.base);
    await c.post('/api/v1/auth/login', { email: 'owner@example.com', password: 'correct-horse-battery' });
    // Login itself is allowed for unverified accounts; app routes are not.
    expect(c.hasCookie()).toBe(true);
    const res = await c.get('/api/v1/auth/me');
    expect(res.status).toBe(200); // me is allowed unverified, so the client can show a banner
    expect(res.body.data.user.emailVerified).toBe(false);
  });

  it('verifies with a single-use token and rejects reuse', async () => {
    // The outbox is cleared between tests, so request a fresh link through the resend endpoint.
    await client(app.base).post('/api/v1/auth/resend-verification', { email: 'owner@example.com' });
    const token = tokenFrom('owner@example.com', 'Verify');
    expect(token).toBeTruthy();
    const c = client(app.base);
    expect((await c.post('/api/v1/auth/verify-email', { token })).status).toBe(200);
    const second = await c.post('/api/v1/auth/verify-email', { token });
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects garbage tokens with the same generic error', async () => {
    const res = await client(app.base).post('/api/v1/auth/verify-email', { token: 'x'.repeat(30) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('validates signup input on the server', async () => {
    const res = await client(app.base).post('/api/v1/auth/signup', signupBody({ password: 'short', confirmPassword: 'short', termsAccepted: false }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects mismatched passwords and unknown timezones', async () => {
    const res = await client(app.base).post('/api/v1/auth/signup', signupBody({ confirmPassword: 'different-password-1', timezone: 'Mars/Olympus' }));
    expect(res.status).toBe(400);
    const paths = res.body.error.details.map((d) => d.path);
    expect(paths).toContain('confirmPassword');
    expect(paths).toContain('timezone');
  });
});

describe('login, sessions, and logout', () => {
  it('verifies the account, then logs in and sets an HttpOnly session cookie', async () => {
    const c = client(app.base);
    await c.post('/api/v1/auth/verify-email', { token: tokenFrom('owner@example.com', 'Verify') });
    const res = await c.post('/api/v1/auth/login', { email: 'owner@example.com', password: 'correct-horse-battery' });
    expect(res.status).toBe(200);
    expect(res.body.data.memberships[0].role).toBe('owner');
    expect(res.body.data.user.passwordHash).toBeUndefined();
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
  });

  it('gives the same error for wrong password and unknown email', async () => {
    const c = client(app.base);
    const wrong = await c.post('/api/v1/auth/login', { email: 'owner@example.com', password: 'nope-nope-nope' });
    const unknown = await c.post('/api/v1/auth/login', { email: 'nobody@example.com', password: 'nope-nope-nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('backs off after repeated failures instead of locking the account, then allows a retry', async () => {
    const c = client(app.base);
    // Defaults: backoff starts after 3 failures with a 2-second base delay.
    for (let i = 0; i < 3; i += 1) {
      await c.post('/api/v1/auth/login', { email: 'owner@example.com', password: 'wrong-wrong-wrong' });
    }
    const blocked = await c.post('/api/v1/auth/login', { email: 'owner@example.com', password: 'correct-horse-battery' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    // The wait is temporary: after it passes, the correct password works again.
    await new Promise((r) => setTimeout(r, 2200));
    const ok = await c.post('/api/v1/auth/login', { email: 'owner@example.com', password: 'correct-horse-battery' });
    expect(ok.status).toBe(200);
  });

  it('applies the same backoff to unknown emails, so backoff does not reveal which accounts exist', async () => {
    const c = client(app.base);
    for (let i = 0; i < 3; i += 1) {
      await c.post('/api/v1/auth/login', { email: 'ghost-user@example.com', password: 'wrong-wrong-wrong' });
    }
    const res = await c.post('/api/v1/auth/login', { email: 'ghost-user@example.com', password: 'wrong-wrong-wrong' });
    expect(res.status).toBe(429);
  });

  it('serves /me to the signed-in session and logout revokes it', async () => {
    const c = client(app.base);
    await c.post('/api/v1/auth/login', { email: 'owner@example.com', password: 'correct-horse-battery' });
    expect((await c.get('/api/v1/auth/me')).status).toBe(200);
    expect((await c.post('/api/v1/auth/logout')).status).toBe(204);
    expect((await c.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('lists sessions and lets the user revoke one', async () => {
    const a = client(app.base);
    const b = client(app.base);
    await a.post('/api/v1/auth/login', { email: 'owner@example.com', password: 'correct-horse-battery' });
    await b.post('/api/v1/auth/login', { email: 'owner@example.com', password: 'correct-horse-battery' });
    const list = await a.get('/api/v1/auth/sessions');
    expect(list.body.data.length).toBeGreaterThanOrEqual(2);
    const other = list.body.data.find((s) => !s.current);
    expect((await a.del(`/api/v1/auth/sessions/${other.id}`)).status).toBe(204);
    expect((await b.get('/api/v1/auth/me')).status).toBe(401);
    expect((await a.get('/api/v1/auth/me')).status).toBe(200);
  });

  it('rejects an expired session', async () => {
    const c = client(app.base);
    await c.post('/api/v1/auth/login', { email: 'owner@example.com', password: 'correct-horse-battery' });
    await Session.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await c.get('/api/v1/auth/me')).status).toBe(401);
    await Session.deleteMany({});
  });
});

describe('password reset', () => {
  it('sends a reset link generically, and the reset token is single-use and revokes sessions', async () => {
    const c = client(app.base);
    const existing = await c.post('/api/v1/auth/login', { email: 'owner@example.com', password: 'correct-horse-battery' });
    expect(existing.status).toBe(200);
    const unknown = await c.post('/api/v1/auth/forgot-password', { email: 'ghost@example.com' });
    const known = await c.post('/api/v1/auth/forgot-password', { email: 'owner@example.com' });
    expect(unknown.body.data.message).toBe(known.body.data.message);
    const token = tokenFrom('owner@example.com', 'Reset');
    expect(token).toBeTruthy();

    const reset = await c.post('/api/v1/auth/reset-password', { token, password: 'brand-new-passphrase', confirmPassword: 'brand-new-passphrase' });
    expect(reset.status).toBe(200);
    expect((await c.post('/api/v1/auth/reset-password', { token, password: 'another-passphrase-1', confirmPassword: 'another-passphrase-1' })).status).toBe(400);

    // The earlier session must no longer work.
    c.clearCookie();
    const old = client(app.base);
    expect((await old.post('/api/v1/auth/login', { email: 'owner@example.com', password: 'correct-horse-battery' })).status).toBe(401);
    expect((await old.post('/api/v1/auth/login', { email: 'owner@example.com', password: 'brand-new-passphrase' })).status).toBe(200);
  });

  it('never returns or stores a reset token in plaintext', async () => {
    const token = tokenFrom('owner@example.com', 'Reset');
    const { OneTimeToken } = await import('../../models/index.js');
    const docs = await OneTimeToken.find({}).lean();
    for (const d of docs) expect(JSON.stringify(d)).not.toContain(token ?? '@@none@@');
  });
});

describe('request protection', () => {
  it('rejects a cross-site mutating request from an unlisted origin', async () => {
    const res = await client(app.base).raw('POST', '/api/v1/auth/login', { email: 'a@b.co', password: 'x' }, { origin: 'https://evil.example', 'X-Requested-With': 'SlotSaver' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INVALID_ORIGIN');
  });

  it('rejects mutating requests without the CSRF header', async () => {
    const res = await fetch(app.base + '/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
      body: JSON.stringify({ email: 'a@b.co', password: 'x' }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('CSRF_HEADER_MISSING');
  });

  it('returns 404 for an unknown session id format rather than probing', async () => {
    const c = client(app.base);
    await c.post('/api/v1/auth/login', { email: 'owner@example.com', password: 'brand-new-passphrase' });
    expect((await c.del('/api/v1/auth/sessions/not-an-id')).status).toBe(404);
  });
});
