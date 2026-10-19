import mongoose from 'mongoose';
import { loadConfig } from '../../config/env.js';
import { createApp } from '../../app.js';
import { connectDatabase, syncIndexes, disconnectDatabase } from '../../config/db.js';

/**
 * Starts the real app against the TEST database only. Refuses any database name that does
 * not contain "test", so development data can never be wiped by a test run.
 */
export async function startTestApp(extraEnv = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    APP_ORIGIN: 'http://localhost:5173',
    MONGODB_URI: process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017/slotsaver_test',
    RATE_LIMIT_ENABLED: 'false',
    ENABLE_DEV_OUTBOX: 'true',
    ...extraEnv,
  });
  const uri = config.mongoTestUri;
  const dbName = new URL(uri.replace(/^mongodb(\+srv)?:/, 'http:')).pathname.slice(1);
  if (!/test/i.test(dbName)) throw new Error(`Refusing to run tests against non-test database "${dbName}"`);

  await connectDatabase(uri);
  await mongoose.connection.db.dropDatabase();
  await syncIndexes();

  const app = createApp({ ...config, mongoUri: uri });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    base,
    config,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await disconnectDatabase();
    },
  };
}

/** Minimal client that sends the CSRF header and tracks the session cookie. */
export function client(base) {
  let cookie = null;
  const call = async (method, path, body, extra = {}) => {
    const headers = { 'X-Requested-With': 'SlotSaver', origin: 'http://localhost:5173', ...extra };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (cookie) headers.cookie = cookie;
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const m = setCookie.match(/ss_session=([^;]*)/);
      if (m) cookie = m[1] === '' ? null : `ss_session=${m[1]}`;
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: res.status, body: json, headers: res.headers };
  };
  return {
    get: (p, extra) => call('GET', p, undefined, extra),
    post: (p, b, extra) => call('POST', p, b ?? {}, extra),
    patch: (p, b, extra) => call('PATCH', p, b ?? {}, extra),
    put: (p, b, extra) => call('PUT', p, b ?? {}, extra),
    del: (p, extra) => call('DELETE', p, undefined, extra),
    raw: call,
    hasCookie: () => Boolean(cookie),
    clearCookie: () => { cookie = null; },
  };
}
