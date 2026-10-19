import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../app.js';
import { loadConfig } from '../../config/env.js';
import { redact } from '../../utils/logger.js';

const config = loadConfig({ NODE_ENV: 'test', APP_ORIGIN: 'http://localhost:5173' });
let server;
let base;

beforeAll(async () => {
  const app = createApp(config);
  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));

describe('HTTP shell', () => {
  it('GET /health returns ok', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { status: 'ok' } });
  });

  it('echoes a safe inbound request id and generates one otherwise', async () => {
    const withId = await fetch(`${base}/health`, { headers: { 'x-request-id': 'abc-123' } });
    expect(withId.headers.get('x-request-id')).toBe('abc-123');
    const unsafe = await fetch(`${base}/health`, { headers: { 'x-request-id': 'bad id with spaces<script>' } });
    expect(unsafe.headers.get('x-request-id')).not.toContain('<');
    expect(unsafe.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sets security headers and hides x-powered-by', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
  });

  it('returns a JSON 404 with request id for unknown routes', async () => {
    const res = await fetch(`${base}/api/v1/nope`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBeTruthy();
  });

  it('rejects malformed JSON with a safe 400 and no stack trace', async () => {
    const res = await fetch(`${base}/api/v1/anything`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{bad json',
    });
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain('MALFORMED_JSON');
    expect(text).not.toContain('at ');
  });

  it('allows only configured CORS origins with credentials', async () => {
    const ok = await fetch(`${base}/health`, { headers: { origin: 'http://localhost:5173' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(ok.headers.get('access-control-allow-credentials')).toBe('true');
    const bad = await fetch(`${base}/health`, { headers: { origin: 'https://evil.example' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('config and logging', () => {
  it('fails fast on an invalid cookie flag', () => {
    expect(() => loadConfig({ SESSION_COOKIE_SECURE: 'yes' })).toThrow(/SESSION_COOKIE_SECURE/);
  });

  it('redacts secrets in log fields', () => {
    const out = redact({ email: 'a@example.com', password: 'hunter2', resetToken: 'x', nested: { passwordHash: 'h' } });
    expect(out.password).toBe('[REDACTED]');
    expect(out.resetToken).toBe('[REDACTED]');
    expect(out.nested.passwordHash).toBe('[REDACTED]');
    expect(out.email).toBe('a@example.com');
  });
});

describe('privacy and production safety', () => {
  it('marks API responses as not cacheable', async () => {
    const app = createApp(config);
    const srv = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
    const res = await fetch(`http://127.0.0.1:${srv.address().port}/api/v1/nope`);
    expect(res.headers.get('cache-control')).toBe('no-store');
    await new Promise((r) => srv.close(r));
  });

  it('keeps the development email outbox off unless explicitly enabled', () => {
    expect(loadConfig({ NODE_ENV: 'development' }).devOutboxEnabled).toBe(false);
  });

  it('refuses to start production with unsafe settings and reports names only', () => {
    const unsafe = {
      NODE_ENV: 'production',
      ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      APP_ORIGIN: 'http://localhost:5173',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/slotsaver',
      SESSION_COOKIE_SECURE: 'false',
      ENABLE_DEV_OUTBOX: 'true',
    };
    expect(() => loadConfig(unsafe)).toThrow(/ENABLE_DEV_OUTBOX must be false/);
    expect(() => loadConfig(unsafe)).toThrow(/SESSION_COOKIE_SECURE must be true/);
    expect(() => loadConfig(unsafe)).toThrow(/^(?!.*AAAA)/);
  });

  it('accepts a correctly configured production environment', () => {
    const safe = {
      NODE_ENV: 'production',
      ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      APP_ORIGIN: 'https://app.example.com',
      MONGODB_URI: 'mongodb+srv://user:pass@cluster.example.net/slotsaver',
      SESSION_COOKIE_SECURE: 'true',
      ENABLE_DEV_OUTBOX: 'false',
      RATE_LIMIT_ENABLED: 'true',
    };
    expect(() => loadConfig(safe)).not.toThrow();
  });
});
