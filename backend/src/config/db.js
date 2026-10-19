import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

/** Connects Mongoose and builds indexes. Idempotent for repeated calls. */
export async function connectDatabase(uri) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  logger.info('db_connected', { database: mongoose.connection.name });
  return mongoose.connection;
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

/** Build all declared indexes. Use in scripts and tests; production uses migrations. */
export async function syncIndexes() {
  const names = mongoose.modelNames();
  for (const name of names) {
    await mongoose.model(name).syncIndexes();
  }
  return names;
}

export function dbReady() {
  return mongoose.connection.readyState === 1;
}
