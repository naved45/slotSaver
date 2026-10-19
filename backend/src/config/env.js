import crypto from 'node:crypto';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/slotsaver'),
  MONGODB_TEST_URI: z.string().default('mongodb://127.0.0.1:27017/slotsaver_test'),
  APP_ORIGIN: z.string().default('http://localhost:5173'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(14),
  SESSION_COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  EMAIL_FROM: z.string().default('SlotSaver <no-reply@example.com>'),
  REDIS_URL: z.string().optional().default(''),
  ENCRYPTION_KEY: z.string().optional().default(''),
  RATE_LIMIT_GENERAL_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_LOGIN_WINDOW_MINUTES: z.coerce.number().positive().default(15),
  RATE_LIMIT_SIGNUP_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_SIGNUP_WINDOW_MINUTES: z.coerce.number().positive().default(60),
  RATE_LIMIT_PASSWORD_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_PASSWORD_WINDOW_MINUTES: z.coerce.number().positive().default(60),
  RATE_LIMIT_BOOKING_MAX: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_BOOKING_WINDOW_MINUTES: z.coerce.number().positive().default(15),
  RATE_LIMIT_GUEST_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_GUEST_WINDOW_MINUTES: z.coerce.number().positive().default(15),
  RATE_LIMIT_INVITE_MAX: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_INVITE_WINDOW_MINUTES: z.coerce.number().positive().default(60),
  // Login backoff: after `threshold` failed attempts for an email, each further failure doubles
  // the wait, from `base` seconds up to `max` seconds. No permanent lock.
  LOGIN_BACKOFF_THRESHOLD: z.coerce.number().int().min(1).default(3),
  LOGIN_BACKOFF_BASE_SECONDS: z.coerce.number().positive().default(2),
  LOGIN_BACKOFF_MAX_SECONDS: z.coerce.number().positive().default(900),
  RATE_LIMIT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  ENABLE_DEV_OUTBOX: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

/**
 * Refuses to start production with settings that could expose data. The process exits with the
 * list of problems, and no value is printed.
 */
function assertProductionSafe(env) {
  const problems = [];
  if (!env.ENCRYPTION_KEY) problems.push('ENCRYPTION_KEY must be set');
  if (env.ENABLE_DEV_OUTBOX) problems.push('ENABLE_DEV_OUTBOX must be false');
  if (!env.SESSION_COOKIE_SECURE) problems.push('SESSION_COOKIE_SECURE must be true');
  if (/localhost|127\.0\.0\.1/.test(env.APP_ORIGIN)) problems.push('APP_ORIGIN must not point at localhost');
  if (/localhost|127\.0\.0\.1/.test(env.MONGODB_URI)) problems.push('MONGODB_URI must not point at localhost');
  if (!env.RATE_LIMIT_ENABLED) problems.push('RATE_LIMIT_ENABLED must be true');
  if (problems.length) throw new Error('Unsafe production configuration: ' + problems.join('; '));
}

/**
 * Parse environment once. Returns a frozen config object.
 * Secrets are never echoed back in errors.
 */
export function loadConfig(source = process.env) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment configuration for: ${fields}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production') assertProductionSafe(env);
  return Object.freeze({
    env: env.NODE_ENV,
    port: env.PORT,
    mongoUri: env.MONGODB_URI,
    mongoTestUri: env.MONGODB_TEST_URI,
    appOrigins: env.APP_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
    sessionTtlDays: env.SESSION_TTL_DAYS,
    cookieSecure: env.SESSION_COOKIE_SECURE,
    smtp: env.SMTP_HOST
      ? { host: env.SMTP_HOST, port: env.SMTP_PORT, user: env.SMTP_USER, pass: env.SMTP_PASS }
      : null,
    emailFrom: env.EMAIL_FROM,
    redisUrl: env.REDIS_URL || null,
    rateLimitEnabled: env.RATE_LIMIT_ENABLED,
    // 32-byte key, base64. Required in production. Outside production a random key is generated
    // per process, so no secret is ever written into the source code.
    encryptionKey: env.ENCRYPTION_KEY || (env.NODE_ENV === 'production' ? null : crypto.randomBytes(32).toString('base64')),
    rateLimits: {
      general: { max: env.RATE_LIMIT_GENERAL_MAX, windowMs: 15 * 60_000 },
      login: { max: env.RATE_LIMIT_LOGIN_MAX, windowMs: env.RATE_LIMIT_LOGIN_WINDOW_MINUTES * 60_000 },
      signup: { max: env.RATE_LIMIT_SIGNUP_MAX, windowMs: env.RATE_LIMIT_SIGNUP_WINDOW_MINUTES * 60_000 },
      password: { max: env.RATE_LIMIT_PASSWORD_MAX, windowMs: env.RATE_LIMIT_PASSWORD_WINDOW_MINUTES * 60_000 },
      booking: { max: env.RATE_LIMIT_BOOKING_MAX, windowMs: env.RATE_LIMIT_BOOKING_WINDOW_MINUTES * 60_000 },
      guest: { max: env.RATE_LIMIT_GUEST_MAX, windowMs: env.RATE_LIMIT_GUEST_WINDOW_MINUTES * 60_000 },
      invite: { max: env.RATE_LIMIT_INVITE_MAX, windowMs: env.RATE_LIMIT_INVITE_WINDOW_MINUTES * 60_000 },
    },
    loginBackoff: {
      threshold: env.LOGIN_BACKOFF_THRESHOLD,
      baseSeconds: env.LOGIN_BACKOFF_BASE_SECONDS,
      maxSeconds: env.LOGIN_BACKOFF_MAX_SECONDS,
    },
    // Dev outbox exposes previews (including links) only outside production.
    devOutboxEnabled: env.ENABLE_DEV_OUTBOX && env.NODE_ENV !== 'production',
    appBaseUrl: env.APP_ORIGIN.split(',')[0].trim().replace(/\/$/, ''),
    isProduction: env.NODE_ENV === 'production',
  });
}
