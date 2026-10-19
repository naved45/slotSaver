import mongoose from 'mongoose';
const { Schema } = mongoose;

const breakSchema = new Schema(
  { startMinute: { type: Number, min: 0, max: 1440 }, endMinute: { type: Number, min: 0, max: 1440 } },
  { _id: false }
);

/** Organization opening hours: one document per day of week. */
export const BusinessHours = mongoose.model(
  'BusinessHours',
  new Schema(
    {
      organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
      dayOfWeek: { type: Number, min: 0, max: 6, required: true },
      openMinute: { type: Number, min: 0, max: 1440, required: true },
      closeMinute: { type: Number, min: 0, max: 1440, required: true },
      breaks: { type: [breakSchema], default: [] },
    },
    { timestamps: true }
  ).index({ organizationId: 1, dayOfWeek: 1 }, { unique: true })
);

/** Weekly working hours for one staff member. */
export const StaffAvailability = mongoose.model(
  'StaffAvailability',
  new Schema(
    {
      organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
      staffId: { type: Schema.Types.ObjectId, ref: 'StaffProfile', required: true },
      dayOfWeek: { type: Number, min: 0, max: 6, required: true },
      startMinute: { type: Number, min: 0, max: 1440, required: true },
      endMinute: { type: Number, min: 0, max: 1440, required: true },
      breaks: { type: [breakSchema], default: [] },
    },
    { timestamps: true }
  ).index({ organizationId: 1, staffId: 1, dayOfWeek: 1 }, { unique: true })
);

/** Holidays, closures, and staff leave. Times are UTC instants. */
export const AvailabilityException = mongoose.model(
  'AvailabilityException',
  new Schema(
    {
      organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
      scope: { type: String, enum: ['org', 'staff'], required: true },
      staffId: { type: Schema.Types.ObjectId, ref: 'StaffProfile', default: null },
      startAt: { type: Date, required: true },
      endAt: { type: Date, required: true },
      reason: { type: String, default: '', maxlength: 200 },
    },
    { timestamps: true }
  ).index({ organizationId: 1, startAt: 1, endAt: 1 })
);
