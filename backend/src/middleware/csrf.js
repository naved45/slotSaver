import { AppError } from '../utils/appError.js';
import { getContext } from '../context.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defense for cookie-authenticated requests:
 *  1. Every mutating request must carry X-Requested-With: SlotSaver. Browsers cannot send
 *     this custom header cross-site without a CORS preflight, which our allowlist refuses.
 *  2. If an Origin header is present, it must be on the allowlist.
 */
export function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const { appOrigins } = getContext().config;
  const origin = req.headers.origin;
  if (origin && !appOrigins.includes(origin)) {
    return next(new AppError(403, 'INVALID_ORIGIN', 'Request origin is not allowed'));
  }
  if (req.headers['x-requested-with'] !== 'SlotSaver') {
    return next(new AppError(403, 'CSRF_HEADER_MISSING', 'Missing required request header'));
  }
  return next();
}
