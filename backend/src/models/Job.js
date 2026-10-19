import mongoose from 'mongoose';
const { Schema } = mongoose;

/**
 * Durable job store used when Redis/BullMQ is not configured. Jobs survive restarts.
 * A worker claims a job by setting a short lease (lockedUntil); expired leases are reclaimed.
 */
export const JOB_TYPES = ['send_notification', 'expire_offer', 'retry_notification'];

const jobSchema = new Schema(
  {
    type: { type: String, enum: JOB_TYPES, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    idempotencyKey: { type: String, required: true, unique: true },
    runAt: { type: Date, required: true },
    status: { type: String, enum: ['queued', 'running', 'done', 'failed'], default: 'queued' },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    lockedUntil: { type: Date, default: null },
    lastError: { type: String, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

jobSchema.index({ status: 1, runAt: 1 });

export const Job = mongoose.model('Job', jobSchema);
