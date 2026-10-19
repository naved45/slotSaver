import mongoose from 'mongoose';
import { slotKey } from './keys.js';
const { Schema } = mongoose;

export const OFFER_STATUSES = ['pending', 'accepting', 'accepted', 'declined', 'expired', 'superseded'];

const slotOfferSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    waitlistEntryId: { type: Schema.Types.ObjectId, ref: 'WaitlistEntry', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'StaffProfile', required: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    status: { type: String, enum: OFFER_STATUSES, default: 'pending' },
    expiresAt: { type: Date, required: true },
    tokenHash: { type: String, required: true, unique: true },
    sequence: { type: Number, default: 1 },
    sourceAppointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', default: null },
    deliveredAt: { type: Date, default: null },
    respondedAt: { type: Date, default: null },
    resultAppointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', default: null },
    overrideBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // Present only while the offer is live (pending/accepting). Sparse unique indexes enforce one live offer per slot and per entry.
    activeSlotKey: { type: String, default: undefined },
    activeWaitlistKey: { type: String, default: undefined },
  },
  { timestamps: true }
);

// At most one live offer per slot, and per waitlist entry.
slotOfferSchema.index({ activeSlotKey: 1 }, { unique: true, sparse: true });
slotOfferSchema.index({ activeWaitlistKey: 1 }, { unique: true, sparse: true });
slotOfferSchema.index({ organizationId: 1, status: 1, expiresAt: 1 });
slotOfferSchema.index({ organizationId: 1, staffId: 1, startAt: 1, sequence: 1 });

export const SlotOffer = mongoose.model('SlotOffer', slotOfferSchema);

export function liveOfferFields({ staffId, startAt, waitlistEntryId }) {
  return { activeSlotKey: slotKey(staffId, startAt), activeWaitlistKey: String(waitlistEntryId) };
}
export const releaseOfferFields = { activeSlotKey: 1, activeWaitlistKey: 1 };
