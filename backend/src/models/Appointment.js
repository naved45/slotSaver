import mongoose from 'mongoose';
import { slotKey } from './keys.js';
const { Schema } = mongoose;

export const APPOINTMENT_STATUSES = ['requested', 'confirmed', 'completed', 'cancelled', 'no_show'];
export const ACTIVE_STATUSES = ['requested', 'confirmed'];

const appointmentSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'StaffProfile', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    // Busy until this instant (end + buffer). Used for conflict checks.
    blockedUntil: { type: Date, required: true },
    status: { type: String, enum: APPOINTMENT_STATUSES, default: 'confirmed' },
    priceMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true },
    source: { type: String, enum: ['staff', 'customer', 'waitlist'], default: 'staff' },
    guestTokenHash: { type: String, default: null, index: true, sparse: true },
    guestTokenExpiresAt: { type: Date, default: null },
    recoveredFromOfferId: { type: Schema.Types.ObjectId, ref: 'SlotOffer', default: null },
    recoveredFromCancellationId: { type: Schema.Types.ObjectId, default: null },
    cancelledAt: { type: Date, default: null },
    // True when the record was created and then rolled back after an overlap. Excluded from metrics.
    rolledBack: { type: Boolean, default: false },
    cancelledFromAppointmentId: { type: Schema.Types.ObjectId, default: null },
    completedAt: { type: Date, default: null },
    confirmedAt: { type: Date, default: null },
    notes: { type: String, default: '', maxlength: 2000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // Left unset (not null) when absent: a sparse unique index would otherwise treat null as a value.
    idempotencyKey: { type: String, sparse: true, unique: true },
    // Present only while the appointment holds its slot. Sparse unique index = double-booking guard.
    activeSlotKey: { type: String, default: undefined },
  },
  { timestamps: true }
);

// Double-booking guard: one active booking per staff member per start instant.
appointmentSchema.index({ activeSlotKey: 1 }, { unique: true, sparse: true });
appointmentSchema.index({ organizationId: 1, startAt: 1 });
appointmentSchema.index({ organizationId: 1, staffId: 1, status: 1, startAt: 1, blockedUntil: 1 });
appointmentSchema.index({ organizationId: 1, customerId: 1, startAt: -1 });
appointmentSchema.index({ organizationId: 1, status: 1, cancelledAt: 1 });

export const Appointment = mongoose.model('Appointment', appointmentSchema);

/** Fields to set when an appointment becomes active, or to remove when it stops holding the slot. */
export function holdSlotFields(staffId, startAt) {
  return { activeSlotKey: slotKey(staffId, startAt) };
}
export const releaseSlotFields = { activeSlotKey: 1 };

const historySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true, index: true },
    fromStatus: { type: String, default: null },
    toStatus: { type: String, required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorType: { type: String, enum: ['user', 'customer', 'system'], default: 'user' },
    reason: { type: String, default: '', maxlength: 300 },
    at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
// Append-only by convention: the API exposes no update or delete for this model.
export const AppointmentStatusHistory = mongoose.model('AppointmentStatusHistory', historySchema);
