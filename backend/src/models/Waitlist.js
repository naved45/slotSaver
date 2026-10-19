import mongoose from 'mongoose';
const { Schema } = mongoose;

const rangeSchema = new Schema(
  { startMinute: { type: Number, min: 0, max: 1440 }, endMinute: { type: Number, min: 0, max: 1440 } },
  { _id: false }
);

const waitlistEntrySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    preferredStaffIds: [{ type: Schema.Types.ObjectId, ref: 'StaffProfile' }],
    anyStaff: { type: Boolean, default: true },
    dateFrom: { type: String, default: null },
    dateTo: { type: String, default: null },
    daysOfWeek: { type: [Number], default: [] },
    timeRanges: { type: [rangeSchema], default: [] },
    status: { type: String, enum: ['active', 'booked', 'removed', 'expired'], default: 'active' },
    expiresAt: { type: Date, required: true },
    requestedAt: { type: Date, default: Date.now },
    consent: {
      email: { type: Boolean, default: false },
      sms: { type: Boolean, default: false },
    },
    contactMethod: { type: String, enum: ['email', 'sms'], default: 'email' },
    lastOfferedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

waitlistEntrySchema.index({ organizationId: 1, serviceId: 1, status: 1 });
waitlistEntrySchema.index({ organizationId: 1, customerId: 1 });

export const WaitlistEntry = mongoose.model('WaitlistEntry', waitlistEntrySchema);
