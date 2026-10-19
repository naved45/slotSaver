import mongoose from 'mongoose';
import { ttlOptions } from './indexOptions.js';
const { Schema } = mongoose;

/**
 * Single-use tokens for email verification, password reset, and staff invitations.
 * Only the SHA-256 hash is stored. `purpose` separates the token kinds.
 */
export const TOKEN_PURPOSES = ['email_verify', 'password_reset', 'invitation'];

const oneTimeTokenSchema = new Schema(
  {
    purpose: { type: String, enum: TOKEN_PURPOSES, required: true },
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
    email: { type: String, lowercase: true, default: null },
    role: { type: String, default: null },
    staffProfileId: { type: Schema.Types.ObjectId, ref: 'StaffProfile', default: null },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

oneTimeTokenSchema.index({ expiresAt: 1 }, ttlOptions());
oneTimeTokenSchema.index({ purpose: 1, userId: 1 });

export const OneTimeToken = mongoose.model('OneTimeToken', oneTimeTokenSchema);
