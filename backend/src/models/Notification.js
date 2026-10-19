import mongoose from 'mongoose';
const { Schema } = mongoose;

export const NOTIFICATION_TYPES = [
  'booking_confirmation',
  'booking_cancellation',
  'reschedule_confirmation',
  'appointment_reminder',
  'waitlist_offer',
  'waitlist_offer_expired',
  'staff_notification',
];
export const NOTIFICATION_STATUSES = ['scheduled', 'sent', 'failed', 'cancelled', 'logged_dev'];

const notificationSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    recipientEmail: { type: String, required: true, lowercase: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', default: null, index: true },
    offerId: { type: Schema.Types.ObjectId, ref: 'SlotOffer', default: null },
    subject: { type: String, default: '', maxlength: 300 },
    // Body is rendered at send time from non-secret fields; secret links are generated then.
    payload: { type: Schema.Types.Mixed, default: {} },
    scheduledFor: { type: Date, required: true },
    status: { type: String, enum: NOTIFICATION_STATUSES, default: 'scheduled' },
    sentAt: { type: Date, default: null },
    providerMessageId: { type: String, default: null },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: null },
    // Duplicate-send prevention: unique per logical notification.
    idempotencyKey: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

notificationSchema.index({ organizationId: 1, status: 1, scheduledFor: 1 });
notificationSchema.index({ status: 1, scheduledFor: 1 });

export const Notification = mongoose.model('Notification', notificationSchema);

const deliverySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    notificationId: { type: Schema.Types.ObjectId, ref: 'Notification', required: true, index: true },
    attempt: { type: Number, required: true },
    provider: { type: String, enum: ['smtp', 'dev_preview'], required: true },
    providerMessageId: { type: String, default: null },
    status: { type: String, enum: ['sent', 'failed', 'logged_dev'], required: true },
    error: { type: String, default: null },
    at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export const NotificationDelivery = mongoose.model('NotificationDelivery', deliverySchema);
