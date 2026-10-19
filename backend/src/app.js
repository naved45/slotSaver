import express from 'express';
import helmet from 'helmet';
import { requestId } from './middleware/requestId.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { csrfProtection } from './middleware/csrf.js';
import { limits, initRateLimiters } from './middleware/rateLimit.js';
import { setContext } from './context.js';
import { createEmailAdapter } from './services/email/index.js';
import { dbReady } from './config/db.js';
import authRoutes from './routes/auth.routes.js';
import devRoutes from './routes/dev.routes.js';
import openApiRoutes from './routes/openapi.routes.js';
import { apiRoutes } from './routes/index.js';

/**
 * Builds the Express app. Dependencies are installed into the process context so services
 * can read config and send email without threading them through every call.
 */
export function createApp(config, overrides = {}) {
  const email = overrides.email ?? createEmailAdapter(config);
  setContext({ config, email });
  initRateLimiters(config);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.isProduction ? 1 : false);

  app.use(requestId);
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"] } } }));

  // Strict CORS allowlist. Credentials are allowed only for listed origins.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && config.appOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, Idempotency-Key');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
      if (req.method === 'OPTIONS') return res.status(204).end();
    }
    return next();
  });

  // Responses carry personal data, so browsers and shared caches must not store them.
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  app.use(express.json({ limit: '100kb' }));
  app.use('/api/v1', limits.general(), csrfProtection);

  app.get('/health', (req, res) => res.json({ data: { status: 'ok' } }));
  app.get('/health/ready', (req, res) => {
    const mongo = dbReady() ? 'ok' : 'down';
    res.status(mongo === 'ok' ? 200 : 503).json({
      data: { status: mongo === 'ok' ? 'ok' : 'degraded', mongo, queue: 'mongo', email: email.mode },
    });
  });

  app.use('/api/v1', openApiRoutes);
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1', apiRoutes);
  if (config.devOutboxEnabled) app.use('/api/v1/dev', devRoutes);

  app.use('/api/v1', notFound);
  app.use(notFound);
  app.use(errorHandler(config.isProduction));
  return app;
}
