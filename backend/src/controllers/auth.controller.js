import { getContext } from '../context.js';
import { inputOf } from '../middleware/validate.js';
import { setSessionCookie, clearSessionCookie } from '../middleware/cookies.js';
import * as auth from '../services/auth.service.js';

const meta = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'], requestId: req.id });

export async function signup(req, res) {
  const body = inputOf(req);
  const out = await auth.signup({ ...body }, meta(req));
  res.status(201).json({ data: out });
}

export async function verifyEmail(req, res) {
  res.json({ data: await auth.verifyEmail(inputOf(req).token) });
}

export async function resendVerification(req, res) {
  res.json({ data: await auth.resendVerification(inputOf(req).email, meta(req)) });
}

export async function login(req, res) {
  const { email, password } = inputOf(req);
  const { config } = getContext();
  const result = await auth.login(email, password, meta(req));
  setSessionCookie(res, result.token, { secure: config.cookieSecure, expires: result.session.expiresAt });
  res.json({ data: await auth.getAccount(result.user) });
}

export async function logout(req, res) {
  const { config } = getContext();
  await auth.logout(req.session._id);
  clearSessionCookie(res, { secure: config.cookieSecure });
  res.status(204).end();
}

export async function me(req, res) {
  res.json({ data: { ...(await auth.getAccount(req.user)), sessionId: req.session._id } });
}

export async function forgotPassword(req, res) {
  res.json({ data: await auth.forgotPassword(inputOf(req).email, meta(req)) });
}

export async function resetPassword(req, res) {
  const { token, password } = inputOf(req);
  res.json({ data: await auth.resetPassword(token, password, meta(req)) });
}

export async function listSessions(req, res) {
  res.json({ data: await auth.listSessions(req.user._id, req.session._id) });
}

export async function revokeSession(req, res) {
  await auth.revokeSession(req.user._id, req.params.sessionId);
  res.status(204).end();
}
