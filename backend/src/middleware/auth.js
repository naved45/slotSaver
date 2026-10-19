import { AppError } from '../utils/appError.js';
import { readCookie, SESSION_COOKIE } from './cookies.js';
import { validateSession } from '../services/auth.service.js';

/**
 * Requires a valid, unrevoked, unexpired session. Sets req.user and req.session.
 * Unverified users are blocked from app routes unless allowUnverified is set.
 */
export function requireAuth({ allowUnverified = false } = {}) {
  return async (req, res, next) => {
    try {
      const token = readCookie(req, SESSION_COOKIE);
      if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue');
      const { user, session } = await validateSession(token);
      if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue');
      if (!user.emailVerifiedAt && !allowUnverified) {
        throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email to continue');
      }
      req.user = user;
      req.session = session;
      next();
    } catch (err) {
      next(err);
    }
  };
}
