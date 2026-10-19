import { Notification, NotificationDelivery, Appointment, Customer } from '../models/index.js';
import { templates } from './email/templates.js';
import { getContext } from '../context.js';
import { seal, unseal } from '../utils/secretBox.js';
import { enqueue } from '../jobs/queue.js';
import { addMinutes } from '../utils/time.js';

const MAX_ATTEMPTS = 5;

/**
 * Creates a Notification record and enqueues its delivery at scheduledFor. Idempotent: the
 * idempotencyKey is unique, so repeating the same logical notification is a no-op.
 */
export async function scheduleNotification({ organizationId, type, recipientEmail, customerId = null, appointmentId = null, offerId = null, scheduledFor, subject = '', payload = {}, idempotencyKey }) {
  let doc;
  try {
    doc = await Notification.create({
      organizationId, type, recipientEmail, customerId, appointmentId, offerId, scheduledFor, subject, payload, idempotencyKey,
    });
  } catch (err) {
    if (err?.code === 11000) return null;
    throw err;
  }
  await enqueue({
    type: 'send_notification',
    payload: { notificationId: String(doc._id) },
    idempotencyKey: `notif:${doc._id}`,
    runAt: scheduledFor,
  });
  return doc;
}

/** Cancels scheduled (not yet sent) notifications for an appointment, e.g. after cancel or reschedule. */
export async function cancelScheduledFor(appointmentId) {
  await Notification.updateMany(
    { appointmentId, status: 'scheduled' },
    { $set: { status: 'cancelled', lastError: 'superseded by appointment change' } }
  );
}

/** Schedules the confirmation (now) and reminders at configured offsets before the start. */
export async function scheduleAppointmentEmails({ org, appointment, customer, serviceName, manageUrl, whenText, confirmationType = 'booking_confirmation', now = new Date() }) {
  const sealedLink = seal(manageUrl);
  const base = {
    organizationId: appointment.organizationId,
    recipientEmail: customer.email,
    customerId: customer._id,
    appointmentId: appointment._id,
    payload: { orgName: org.name, serviceName, whenText, sealedLink },
  };
  if (customer.consent?.email) {
    await scheduleNotification({
      ...base,
      type: confirmationType,
      scheduledFor: now,
      idempotencyKey: `${confirmationType}:${appointment._id}:${appointment.startAt.toISOString()}`,
    });
    const offsets = org.bookingPolicy?.reminderOffsetsMinutes ?? [];
    for (const offset of offsets) {
      const when = addMinutes(appointment.startAt, -offset);
      if (when > now) {
        await scheduleNotification({
          ...base,
          type: 'appointment_reminder',
          scheduledFor: when,
          idempotencyKey: `remind:${appointment._id}:${appointment.startAt.toISOString()}:${offset}`,
        });
      }
    }
  }
}

/** Delivers one notification. Called by the job worker. Safe to call repeatedly. */
export async function deliverNotification(notificationId) {
  const n = await Notification.findById(notificationId);
  if (!n || n.status !== 'scheduled') return { skipped: true };

  // Recheck consent and appointment state at send time, not when the job was created.
  if (n.appointmentId) {
    const appt = await Appointment.findById(n.appointmentId).lean();
    if (!appt || !['requested', 'confirmed'].includes(appt.status)) {
      n.status = 'cancelled';
      n.lastError = 'appointment no longer active';
      await n.save();
      return { skipped: true };
    }
  }
  if (n.customerId) {
    const cust = await Customer.findById(n.customerId).lean();
    if (!cust?.consent?.email) {
      n.status = 'cancelled';
      n.lastError = 'no email consent';
      await n.save();
      return { skipped: true };
    }
  }

  const { email } = getContext();
  const link = n.payload?.sealedLink ? unseal(n.payload.sealedLink) : null;
  const tpl = templates[n.type];
  if (!tpl) throw new Error(`No template for ${n.type}`);
  const built = tpl({ ...n.payload, ...(link ? { link, manageLink: link, acceptLink: link } : {}) });
  n.subject = built.subject;
  n.attempts += 1;

  try {
    const result = await email.send({ to: n.recipientEmail, subject: built.subject, text: built.text, html: built.html });
    n.status = result.status; // 'sent' or 'logged_dev'
    n.sentAt = new Date();
    n.providerMessageId = result.providerMessageId;
    n.lastError = null;
    await n.save();
    await NotificationDelivery.create({
      organizationId: n.organizationId,
      notificationId: n._id,
      attempt: n.attempts,
      provider: result.status === 'sent' ? 'smtp' : 'dev_preview',
      providerMessageId: result.providerMessageId,
      status: result.status,
    });
    return { status: result.status };
  } catch (err) {
    await NotificationDelivery.create({
      organizationId: n.organizationId,
      notificationId: n._id,
      attempt: n.attempts,
      provider: 'smtp',
      status: 'failed',
      error: String(err.message).slice(0, 300),
    });
    if (n.attempts >= MAX_ATTEMPTS) {
      n.status = 'failed';
      n.lastError = 'Delivery failed after retries';
      await n.save();
      return { status: 'failed', final: true };
    }
    n.lastError = 'Temporary delivery failure; will retry';
    await n.save();
    throw err; // the job queue retries with backoff
  }
}
