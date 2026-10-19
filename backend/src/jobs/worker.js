import { claimNext, complete, fail } from './queue.js';
import { deliverNotification } from '../services/notification.service.js';
import { expireOffer } from '../services/offer.service.js';
import { logger } from '../utils/logger.js';

const handlers = {
  send_notification: ({ notificationId }) => deliverNotification(notificationId),
  expire_offer: ({ offerId }) => expireOffer(offerId),
};

/** Processes at most one job. Returns true if a job ran. */
export async function runOnce() {
  const job = await claimNext();
  if (!job) return false;
  const handler = handlers[job.type];
  try {
    if (!handler) throw new Error(`No handler for ${job.type}`);
    await handler(job.payload);
    await complete(job._id);
  } catch (err) {
    logger.warn('job_failed', { jobId: String(job._id), type: job.type, attempt: job.attempts, message: err.message });
    await fail(job, err);
  }
  return true;
}

/** Long-running loop used by the worker process. Stops when `signal.aborted` is set. */
export async function runLoop({ signal, idleMs = 2000 } = {}) {
  while (!signal?.aborted) {
    let ran = false;
    try {
      ran = await runOnce();
    } catch (err) {
      logger.error('worker_loop_error', { message: err.message });
    }
    if (!ran) await new Promise((r) => setTimeout(r, idleMs));
  }
}
