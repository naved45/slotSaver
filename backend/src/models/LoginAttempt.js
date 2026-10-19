import mongoose from 'mongoose';
const { Schema } = mongoose;

/**
 * Failed sign-in counter keyed by a hash of the email. It is kept for unknown emails too, so
 * backoff does not reveal which accounts exist. The record is deleted on a successful sign-in.
 */
const loginAttemptSchema = new Schema(
  {
    keyHash: { type: String, required: true, unique: true },
    failures: { type: Number, default: 0 },
    nextAllowedAt: { type: Date, default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export const LoginAttempt = mongoose.model('LoginAttempt', loginAttemptSchema);
