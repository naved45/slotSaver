import { loadConfig } from './config/env.js';
import { createApp } from './app.js';
import { connectDatabase, syncIndexes, disconnectDatabase } from './config/db.js';
import { runLoop } from './jobs/worker.js';
import { logger } from './utils/logger.js';

/**
 * Background worker: delivers notifications and expires slot offers. Run as a separate process
 * (`npm run worker`). Jobs are durable in MongoDB, so a restart resumes pending work.
 */
const config = loadConfig();
createApp(config); // installs the context (config and email adapter) used by services
await connectDatabase(config.mongoUri);
await syncIndexes();
logger.info('worker_started', { email: config.smtp ? 'smtp' : 'dev_preview' });

const controller = new AbortController();
const stop = async (signal) => {
  logger.info('worker_stopping', { signal });
  controller.abort();
  setTimeout(async () => { await disconnectDatabase(); process.exit(0); }, 1000).unref();
};
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

await runLoop({ signal: controller.signal });
await disconnectDatabase();
