import mongoose from 'mongoose';
const { Schema } = mongoose;

export const BUSINESS_TYPES = ['dental', 'salon', 'physiotherapy', 'wellness', 'consulting', 'other'];

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, match: /^[a-z0-9-]{3,60}$/ },
    businessType: { type: String, enum: BUSINESS_TYPES, default: 'other' },
    timezone: { type: String, required: true, default: 'UTC' },
    currency: { type: String, default: 'INR', maxlength: 3 },
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    bookingPolicy: {
      cancelCutoffMinutes: { type: Number, default: 120 },
      slotOfferExpiryMinutes: { type: Number, default: 60 },
      reminderOffsetsMinutes: { type: [Number], default: [1440, 120] },
      confirmationEmails: { type: Boolean, default: true },
    },
    planKey: { type: String, enum: ['free', 'starter', 'growth'], default: 'free' },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Organization = mongoose.model('Organization', organizationSchema);
