import rateLimit from 'express-rate-limit';
import { AppError } from '../utils/appError.js';

/**
 * Route limiters. Thresholds come from configuration (config/env.js and .env.example).
 * Limiter instances are created once in initRateLimiters() during createApp(), never per request.
 * A request that reaches a limiter before initialization is refused (fail closed).
 * Disabled only when RATE_LIMIT_ENABLED=false (tests).
 */
const specs = new Map();
const instances = new Map();

function build(spec, config) {
  return rateLimit({
    windowMs: config.rateLimits[spec.bucket].windowMs,
    limit: config.rateLimits[spec.bucket].max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => !config.rateLimitEnabled,
    ...(spec.keyFn ? { keyGenerator: spec.keyFn } : {}),
    handler: (req, res) => {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: `Too many requests (${spec.name}). Try again later.`, requestId: req.id },
      });
    },
  });
}

export function initRateLimiters(config) {
  instances.clear();
  for (const [id, spec] of specs) instances.set(id, build(spec, config));
}

export function limiter(spec) {
  specs.set(spec.name, spec);
  return (req, res, next) => {
    const inner = instances.get(spec.name);
    if (!inner) return next(new AppError(503, 'UNAVAILABLE', 'Service is starting. Try again shortly.'));
    return inner(req, res, next);
  };
}

export const limits = {
  login: () => limiter({ name: 'login', bucket: 'login' }),
  signup: () => limiter({ name: 'signup', bucket: 'signup' }),
  passwordReset: () => limiter({ name: 'password_reset', bucket: 'password' }),
  publicBooking: () => limiter({ name: 'booking', bucket: 'booking' }),
  guestAction: () => limiter({ name: 'guest_action', bucket: 'guest' }),
  invitation: () => limiter({ name: 'invitation', bucket: 'invite' }),
  general: () => limiter({ name: 'general', bucket: 'general' }),
};

