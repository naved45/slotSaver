import { User, Session, OneTimeToken, Membership, Organization, LoginAttempt } from '../models/index.js';
import { hashPassword, verifyPassword, dummyVerify } from '../utils/passwords.js';
import { generateToken, hashToken } from '../utils/tokens.js';
import { AppError } from '../utils/appError.js';
import { getContext } from '../context.js';
import { templates } from './email/templates.js';
import { logger } from '../utils/logger.js';
import { createOrganizationForOwner } from './org.service.js';
import { recordAudit } from './audit.service.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ABSOLUTE_SESSION_DAYS = 30;
const TOKEN_TTL = { email_verify: DAY, password_reset: 30 * MINUTE };

const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');

/** Sends an email without letting provider errors leak to the caller or into logs with secrets. */
async function sendSafely(type, to, data, meta = {}) {
  const { email } = getContext();
  const { subject, text, html } = templates[type](data);
  try {
    return await email.send({ to, subject, text, html });
  } catch (err) {
    logger.error('auth_email_failed', { type, requestId: meta.requestId, message: err.message });
    return { status: 'failed' };
  }
}

async function issueOneTimeToken(purpose, user, extra = {}) {
  const token = generateToken();
  await OneTimeToken.create({
    purpose,
    tokenHash: hashToken(token),
    userId: user._id,
    email: user.email,
    expiresAt: new Date(Date.now() + TOKEN_TTL[purpose]),
    ...extra,
  });
  return token;
}

/** Atomically consumes a token. Returns the document or null if missing, used, or expired. */
async function consumeOneTimeToken(purpose, token) {
  return OneTimeToken.findOneAndUpdate(
    { tokenHash: hashToken(token), purpose, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: true }
  );
}

export async function signup(input, meta = {}) {
  const { config } = getContext();
  const email = input.email.toLowerCase();
  // Hash first so existing and new accounts take similar time (no enumeration by timing).
  const passwordHash = await hashPassword(input.password);
  const genericOk = { message: 'Check your email to verify your account.' };

  if (await User.exists({ email })) return genericOk;

  let user;
  try {
    user = await User.create({
      email,
      passwordHash,
      fullName: input.fullName,
      termsAcceptedAt: new Date(),
    });
  } catch (err) {
    if (err?.code === 11000) return genericOk; // lost a race with a concurrent signup
    throw err;
  }

  const org = await createOrganizationForOwner({
    name: input.businessName,
    businessType: input.businessType,
    timezone: input.timezone,
    ownerUserId: user._id,
  });

  const token = await issueOneTimeToken('email_verify', user, { organizationId: org._id });
  await sendSafely('email_verify', email, { link: `${config.appBaseUrl}/verify-email?token=${token}` }, meta);
  return genericOk;
}

export async function verifyEmail(token) {
  const doc = await consumeOneTimeToken('email_verify', token);
  if (!doc) throw new AppError(400, 'INVALID_TOKEN', 'This link is invalid or has expired');
  await User.updateOne({ _id: doc.userId, emailVerifiedAt: null }, { $set: { emailVerifiedAt: new Date() } });
  return { message: 'Email verified. You can sign in now.' };
}

export async function resendVerification(email, meta = {}) {
  const { config } = getContext();
  const user = await User.findOne({ email: email.toLowerCase(), emailVerifiedAt: null });
  if (user) {
    const token = await issueOneTimeToken('email_verify', user);
    await sendSafely('email_verify', user.email, { link: `${config.appBaseUrl}/verify-email?token=${token}` }, meta);
  }
  return { message: 'If that account exists and is unverified, a new link is on its way.' };
}

export async function forgotPassword(email, meta = {}) {
  const { config } = getContext();
  const user = await User.findOne({ email: email.toLowerCase(), deletedAt: null });
  if (user) {
    const token = await issueOneTimeToken('password_reset', user);
    await sendSafely('password_reset', user.email, { link: `${config.appBaseUrl}/reset-password?token=${token}` }, meta);
  }
  return { message: 'If an account exists for that email, reset instructions are on their way.' };
}

export async function resetPassword(token, password, meta = {}) {
  const doc = await consumeOneTimeToken('password_reset', token);
  if (!doc) throw new AppError(400, 'INVALID_TOKEN', 'This reset link is invalid or has expired');
  const passwordHash = await hashPassword(password);
  await User.updateOne(
    { _id: doc.userId },
    { $set: { passwordHash, failedLoginCount: 0 } }
  );
  // Revoke every session so a stolen session cannot survive a reset.
  await Session.updateMany({ userId: doc.userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  await recordAudit({ organizationId: null, actorUserId: doc.userId, action: 'account.password_reset', resourceType: 'user', resourceId: doc.userId, requestId: meta.requestId });
  return { message: 'Your password has been reset. Sign in with your new password.' };
}

/** Backoff for repeated failures on one email: none until `threshold`, then doubling delays. */
async function recordLoginFailure(keyHash, now, backoff) {
  const rec = await LoginAttempt.findOneAndUpdate(
    { keyHash },
    { $inc: { failures: 1 }, $set: { updatedAt: now } },
    { upsert: true, new: true }
  );
  if (rec.failures >= backoff.threshold) {
    const exponent = rec.failures - backoff.threshold;
    const delaySeconds = Math.min(backoff.maxSeconds, backoff.baseSeconds * 2 ** exponent);
    await LoginAttempt.updateOne({ keyHash }, { $set: { nextAllowedAt: new Date(now.getTime() + delaySeconds * 1000) } });
  }
}

export async function login(email, password, meta = {}) {
  const { config } = getContext();
  const normalized = email.toLowerCase();
  const keyHash = hashToken(normalized);
  const now = new Date();

  const attempt = await LoginAttempt.findOne({ keyHash }).lean();
  if (attempt?.nextAllowedAt && attempt.nextAllowedAt > now) {
    await dummyVerify(password);
    const err = new AppError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Wait a moment and try again.');
    err.retryAfter = Math.ceil((attempt.nextAllowedAt - now) / 1000);
    throw err;
  }

  const user = await User.findOne({ email: normalized, deletedAt: null }).select('+passwordHash');
  if (!user) {
    await dummyVerify(password);
    await recordLoginFailure(keyHash, now, config.loginBackoff);
    throw invalidCredentials();
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await recordLoginFailure(keyHash, now, config.loginBackoff);
    throw invalidCredentials();
  }
  await LoginAttempt.deleteOne({ keyHash });
  await User.updateOne({ _id: user._id }, { $set: { failedLoginCount: 0 } });

  const token = generateToken();
  const expiresAt = new Date(now.getTime() + config.sessionTtlDays * DAY);
  const absoluteExpiresAt = new Date(now.getTime() + ABSOLUTE_SESSION_DAYS * DAY);
  const session = await Session.create({
    userId: user._id,
    tokenHash: hashToken(token),
    expiresAt: expiresAt < absoluteExpiresAt ? expiresAt : absoluteExpiresAt,
    absoluteExpiresAt,
    userAgent: String(meta.userAgent ?? '').slice(0, 300),
    ip: String(meta.ip ?? '').slice(0, 64),
    lastSeenAt: now,
  });
  return { token, session, user };
}

/** Returns { user, session } for a valid token, or nulls. Slides the expiry at most every 5 minutes. */
export async function validateSession(token) {
  const now = new Date();
  const session = await Session.findOne({
    tokenHash: hashToken(token),
    revokedAt: null,
    expiresAt: { $gt: now },
    absoluteExpiresAt: { $gt: now },
  });
  if (!session) return { user: null, session: null };
  const user = await User.findOne({ _id: session.userId, deletedAt: null });
  if (!user) return { user: null, session: null };
  if (now - session.lastSeenAt > 5 * MINUTE) {
    const { config } = getContext();
    const slid = new Date(now.getTime() + config.sessionTtlDays * DAY);
    session.expiresAt = slid < session.absoluteExpiresAt ? slid : session.absoluteExpiresAt;
    session.lastSeenAt = now;
    await session.save();
  }
  return { user, session };
}

export async function logout(sessionId) {
  await Session.updateOne({ _id: sessionId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export async function listSessions(userId, currentSessionId) {
  const rows = await Session.find({ userId, revokedAt: null, expiresAt: { $gt: new Date() } })
    .sort({ lastSeenAt: -1 })
    .lean();
  return rows.map((s) => ({
    id: s._id,
    current: String(s._id) === String(currentSessionId),
    userAgent: s.userAgent,
    ip: s.ip,
    lastSeenAt: s.lastSeenAt,
    expiresAt: s.expiresAt,
  }));
}

export async function revokeSession(userId, sessionId) {
  const res = await Session.updateOne({ _id: sessionId, userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  if (res.matchedCount === 0) throw new AppError(404, 'NOT_FOUND', 'Session not found');
}

export async function getAccount(user) {
  const memberships = await Membership.find({ userId: user._id, status: 'active' }).lean();
  const orgIds = memberships.map((m) => m.organizationId);
  const orgs = await Organization.find({ _id: { $in: orgIds } }).select('name slug timezone businessType').lean();
  const byId = new Map(orgs.map((o) => [String(o._id), o]));
  return {
    user: { id: user._id, email: user.email, fullName: user.fullName, emailVerified: Boolean(user.emailVerifiedAt) },
    memberships: memberships.map((m) => ({
      organizationId: m.organizationId,
      role: m.role,
      staffProfileId: m.staffProfileId ?? null,
      organization: byId.get(String(m.organizationId)) ?? null,
    })),
  };
}

export { invalidCredentials };
