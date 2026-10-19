import { Job } from '../models/index.js';

/**
 * Durable job store. Enqueue is idempotent by idempotencyKey: enqueueing the same logical job
 * again is a no-op. Claims use a lease so a crashed worker's job is picked up after expiry.
 */
export async function enqueue({ type, payload, idempotencyKey, runAt = new Date(), maxAttempts = 5 }) {
  await Job.updateOne(
    { idempotencyKey },
    { $setOnInsert: { type, payload, idempotencyKey, runAt, status: 'queued', attempts: 0, maxAttempts } },
    { upsert: true }
  );
}

const LEASE_MS = 60_000;

export async function claimNext(now = new Date()) {
  return Job.findOneAndUpdate(
    {
      runAt: { $lte: now },
      $or: [{ status: 'queued' }, { status: 'running', lockedUntil: { $lt: now } }],
    },
    { $set: { status: 'running', lockedUntil: new Date(now.getTime() + LEASE_MS) }, $inc: { attempts: 1 } },
    { sort: { runAt: 1 }, new: true }
  );
}

export async function complete(jobId) {
  await Job.updateOne({ _id: jobId }, { $set: { status: 'done', completedAt: new Date(), lockedUntil: null } });
}

/** Retries with exponential backoff until maxAttempts, then marks the job failed. */
export async function fail(job, err) {
  const exhausted = job.attempts >= job.maxAttempts;
  const backoffMs = Math.min(60 * 60_000, 2 ** job.attempts * 5_000);
  await Job.updateOne(
    { _id: job._id },
    {
      $set: {
        status: exhausted ? 'failed' : 'queued',
        runAt: exhausted ? job.runAt : new Date(Date.now() + backoffMs),
        lockedUntil: null,
        lastError: String(err?.message ?? err).slice(0, 300),
      },
    }
  );
}
