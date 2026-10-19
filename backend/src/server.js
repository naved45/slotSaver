import { loadConfig } from './config/env.js';
import { createApp } from './app.js';
import { connectDatabase, syncIndexes } from './config/db.js';
import { logger } from './utils/logger.js';

const config = loadConfig();
const app = createApp(config);

// Connect before accepting traffic so readiness is accurate from the first request.
await connectDatabase(config.mongoUri);
await syncIndexes();

const server = app.listen(config.port, () => {
  logger.info('api_started', { port: config.port, env: config.env, queue: 'mongo', email: config.smtp ? 'smtp' : 'dev_preview' });
});

function shutdown(signal) {
  logger.info('shutdown', { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
