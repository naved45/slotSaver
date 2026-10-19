import {
  Organization, Service, StaffProfile, Customer, Appointment, AppointmentStatusHistory,
  holdSlotFields, releaseSlotFields, ACTIVE_STATUSES,
} from '../models/index.js';
import { generateToken, hashToken } from '../utils/tokens.js';
import { AppError } from '../utils/appError.js';
import { addMinutes } from '../utils/time.js';
import { getContext } from '../context.js';
import { canTransition } from './appointmentStatus.js';
import { recordAudit } from './audit.service.js';
import {
  eligibleStaff, assertSlotBookable, findOverlap, staffSlots, formatWhen,
} from './schedule.service.js';
import { scheduleAppointmentEmails, scheduleNotification, cancelScheduledFor } from './notification.service.js';
import { offerSlotToWaitlist, acceptOffer } from './offer.service.js';
import { DateTime } from 'luxon';

const notFound = () => new AppError(404, 'NOT_FOUND', 'Resource not found');
const slotTaken = () => new AppError(409, 'SLOT_UNAVAILABLE', 'That time is no longer available. Please choose another.');

/* ---------- Customers ---------- */

/** Creates or updates a customer by (organization, email). Consent changes only when explicitly given. */
export async function upsertCustomer(orgId, { fullName, email, phone = '' }, consentEmail = undefined) {
  const set = { fullName, phone };
  if (consentEmail !== undefined) {
    set['consent.email'] = consentEmail;
    set['consent.consentedAt'] = new Date();
  }
  try {
    return await Customer.findOneAndUpdate(
      { organizationId: orgId, email: email.toLowerCase() },
      { $set: set, $setOnInsert: { organizationId: orgId, email: email.toLowerCase() } },
      { upsert: true, new: true }
    );
  } catch (err) {
    if (err?.code !== 11000) throw err;
    return Customer.findOne({ organizationId: orgId, email: email.toLowerCase() });
  }
}

/* ---------- Public business and availability ---------- */

export async function getPublicBusiness(slug) {
  const org = await Organization.findOne({ slug, archivedAt: null }).select('name slug timezone businessType currency').lean();
  if (!org) throw notFound();
  const services = await Service.find({ organizationId: org._id, active: true, archivedAt: null })
    .select('name slug description durationMinutes priceMinor currency mode')
    .sort({ name: 1 })
    .lean();
  return { organization: { name: org.name, slug: org.slug, timezone: org.timezone, businessType: org.businessType }, services };
}

async function publicService(org, serviceSlug) {
  const service = await Service.findOne({ organizationId: org._id, slug: serviceSlug, active: true, archivedAt: null }).lean();
  if (!service) throw notFound();
  return service;
}

export async function getPublicAvailability(slug, serviceSlug, { from, to, staffId }) {
  const org = await Organization.findOne({ slug, archivedAt: null }).lean();
  if (!org) throw notFound();
  const service = await publicService(org, serviceSlug);
  const staffFilter = { organizationId: org._id, active: true, serviceIds: service._id };
  if (staffId) staffFilter._id = staffId;
  const staffList = await StaffProfile.find(staffFilter).lean();

  const byStart = new Map();
  for (const staff of staffList) {
    const days = await staffSlots({ org, service, staff, from, to });
    for (const day of days) {
      for (const s of day.slots) {
        const key = s.startAt.toISOString();
        if (!byStart.has(key)) byStart.set(key, { startAt: s.startAt, endAt: s.endAt, staffIds: [], staffNames: [] });
        const entry = byStart.get(key);
        entry.staffIds.push(String(staff._id));
        entry.staffNames.push(staff.displayName);
      }
    }
  }
  const slots = [...byStart.values()].sort((a, b) => a.startAt - b.startAt);
  return {
    timezone: org.timezone,
    service: { name: service.name, durationMinutes: service.durationMinutes, priceMinor: service.priceMinor, currency: service.currency },
    slots: slots.map((s) => ({
      startAt: s.startAt,
      endAt: s.endAt,
      localDate: DateTime.fromJSDate(s.startAt, { zone: org.timezone }).toISODate(),
      localTime: DateTime.fromJSDate(s.startAt, { zone: org.timezone }).toFormat('HH:mm'),
      staffIds: s.staffIds,
      staffNames: s.staffNames,
    })),
  };
}

/* ---------- Core write path ---------- */

/**
 * Writes one appointment after revalidation. The unique activeSlotKey index is the race guard:
 * when two requests try the same staff and start time, only one insert succeeds. A second guard
 * checks overlapping (different start) bookings after the write and rolls back on conflict.
 */
export async function placeAppointment({ org, service, staff, startAt, customer, source, createdBy = null, actorType = 'user', idempotencyKey = null, recoveredFromOfferId = null, requestId = null }) {
  const endAt = addMinutes(startAt, service.durationMinutes);
  const blockedUntil = addMinutes(endAt, service.bufferMinutes);
  const guestToken = generateToken();
  const now = new Date();

  let appt;
  try {
    appt = await Appointment.create({
      organizationId: org._id,
      serviceId: service._id,
      staffId: staff._id,
      customerId: customer._id,
      startAt,
      endAt,
      blockedUntil,
      status: 'confirmed',
      confirmedAt: now,
      priceMinor: service.priceMinor, // always the server's price, never the client's
      currency: service.currency,
      source,
      createdBy,
      ...(idempotencyKey ? { idempotencyKey } : {}),
      recoveredFromOfferId,
      guestTokenHash: hashToken(guestToken),
      guestTokenExpiresAt: startAt,
      ...holdSlotFields(staff._id, startAt),
    });
  } catch (err) {
    if (err?.code === 11000) {
      if (String(err.message).includes('activeSlotKey')) throw slotTaken();
      throw new AppError(409, 'DUPLICATE', 'This request was already processed');
    }
    throw err;
  }

  const overlap = await findOverlap({ orgId: org._id, staffId: staff._id, startAt, blockedUntil, excludeId: appt._id });
  if (overlap) {
    // Fail closed: keep the record for audit, but release the slot and mark it cancelled.
    await Appointment.updateOne(
      { _id: appt._id },
      { $set: { status: 'cancelled', cancelledAt: now, rolledBack: true, notes: 'Rolled back: overlapped another booking' }, $unset: releaseSlotFields }
    );
    await AppointmentStatusHistory.create({ organizationId: org._id, appointmentId: appt._id, fromStatus: 'confirmed', toStatus: 'cancelled', actorType: 'system', reason: 'overlap rollback' });
    throw slotTaken();
  }

  await AppointmentStatusHistory.create({ organizationId: org._id, appointmentId: appt._id, fromStatus: null, toStatus: 'confirmed', actorUserId: createdBy, actorType, reason: `created (${source})` });
  await recordAudit({ organizationId: org._id, actorUserId: createdBy, actorType, action: 'appointment.created', resourceType: 'appointment', resourceId: appt._id, after: { startAt, staffId: staff._id, serviceId: service._id, source }, requestId });

  const manageUrl = `${getContext().config.appBaseUrl}/manage/${guestToken}`;
  await scheduleAppointmentEmails({
    org,
    appointment: appt,
    customer,
    serviceName: service.name,
    manageUrl,
    whenText: formatWhen(startAt, org.timezone),
    now,
  });
  return { ...appt.toObject(), guestToken };
}

/** Public booking for guests. Never trusts the client for price, availability, or staff eligibility. */
export async function createPublicBooking(slug, serviceSlug, input, meta = {}) {
  const org = await Organization.findOne({ slug, archivedAt: null }).lean();
  if (!org) throw notFound();
  const service = await publicService(org, serviceSlug);
  const startAt = new Date(input.startAt);
  const now = new Date();

  // A retried request must return the original booking, even though its slot is now taken.
  const idempotencyKey = input.idempotencyKey ? `${org._id}:${input.idempotencyKey}` : null;
  if (idempotencyKey) {
    const existing = await Appointment.findOne({ idempotencyKey }).lean();
    if (existing) return { appointment: sanitize(existing), replayed: true };
  }

  // Pick a staff member: the one requested, or the first eligible one who has this exact slot.
  let staff;
  if (input.staffId) {
    staff = await eligibleStaff(org._id, input.staffId, service._id);
    await assertSlotBookable({ org, service, staff, startAt, now });
  } else {
    const candidates = await StaffProfile.find({ organizationId: org._id, active: true, serviceIds: service._id }).lean();
    for (const cand of candidates) {
      try {
        await assertSlotBookable({ org, service, staff: cand, startAt, now });
        staff = cand;
        break;
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
      }
    }
    if (!staff) throw slotTaken();
  }

  const customer = await upsertCustomer(org._id, input.customer, input.consent?.email === true);
  const appt = await placeAppointment({
    org, service, staff, startAt, customer, source: 'customer', actorType: 'customer', idempotencyKey, requestId: meta.requestId,
  });
  return { appointment: sanitize(appt), replayed: false };
}

/** Staff or owner creates an appointment. Staff may only book for themselves. */
export async function createStaffAppointment(orgId, input, actor) {
  const org = await Organization.findById(orgId).lean();
  if (!org) throw notFound();
  const service = await Service.findOne({ _id: input.serviceId, organizationId: orgId, active: true }).lean();
  if (!service) throw notFound();
  const staff = await eligibleStaff(orgId, input.staffId, service._id);
  if (actor.role === 'staff' && String(actor.staffProfileId) !== String(staff._id)) {
    throw new AppError(403, 'FORBIDDEN', 'Staff can only book their own appointments');
  }
  const startAt = new Date(input.startAt);
  await assertSlotBookable({ org, service, staff, startAt });
  const customer = await upsertCustomer(orgId, input.customer, input.consent?.email);
  const appt = await placeAppointment({
    org, service, staff, startAt, customer, source: 'staff', createdBy: actor.userId, actorType: 'user', requestId: actor.requestId,
  });
  return sanitize(appt);
}

/* ---------- Changes ---------- */

/** Removes internal and secret fields. Guest tokens only ever leave the server inside emails. */
function sanitize(appt) {
  const { guestTokenHash, guestTokenExpiresAt, activeSlotKey, idempotencyKey, guestToken, __v, ...rest } = appt;
  void guestTokenHash; void guestTokenExpiresAt; void activeSlotKey; void idempotencyKey; void guestToken; void __v;
  return rest;
}

async function loadAppointment(orgId, appointmentId) {
  const appt = await Appointment.findOne({ _id: appointmentId, organizationId: orgId });
  if (!appt) throw notFound();
  return appt;
}

/** Customers may change or cancel only up to the service's cancellation cutoff. Staff may override. */
function assertCutoff(service, appt, actor) {
  if (actor.type !== 'customer') return;
  const cutoff = addMinutes(appt.startAt, -service.cancelCutoffMinutes);
  if (new Date() >= cutoff) {
    throw new AppError(409, 'CUTOFF_PASSED', 'The change window for this appointment has closed. Please contact the business.');
  }
}

async function setStatusHistory(orgId, appointmentId, fromStatus, toStatus, actor, reason) {
  await AppointmentStatusHistory.create({
    organizationId: orgId,
    appointmentId,
    fromStatus,
    toStatus,
    actorUserId: actor.userId ?? null,
    actorType: actor.type === 'customer' ? 'customer' : 'user',
    reason,
  });
}

export async function cancelAppointment(orgId, appointmentId, actor, reason = '') {
  const appt = await loadAppointment(orgId, appointmentId);
  if (!ACTIVE_STATUSES.includes(appt.status)) {
    throw new AppError(409, 'INVALID_STATUS', `Only upcoming appointments can be cancelled (status: ${appt.status})`);
  }
  const service = await Service.findById(appt.serviceId).lean();
  assertCutoff(service, appt, actor);

  const now = new Date();
  // Conditional update: only the first cancel wins if two requests race.
  const res = await Appointment.updateOne(
    { _id: appt._id, status: { $in: ACTIVE_STATUSES } },
    { $set: { status: 'cancelled', cancelledAt: now, notes: reason ? `Cancelled: ${reason}` : appt.notes }, $unset: releaseSlotFields }
  );
  if (res.modifiedCount === 0) throw new AppError(409, 'CONFLICT', 'This appointment was already changed');

  await setStatusHistory(orgId, appt._id, appt.status, 'cancelled', actor, reason || 'cancelled');
  await recordAudit({ organizationId: orgId, actorUserId: actor.userId ?? null, actorType: actor.type === 'customer' ? 'customer' : 'user', action: 'appointment.cancelled', resourceType: 'appointment', resourceId: appt._id, before: { status: appt.status }, after: { status: 'cancelled' }, requestId: actor.requestId });
  await cancelScheduledFor(appt._id);

  const [org, customer] = await Promise.all([Organization.findById(orgId).lean(), Customer.findById(appt.customerId).lean()]);
  if (customer) {
    await scheduleNotification({
      organizationId: orgId,
      type: 'booking_cancellation',
      recipientEmail: customer.email,
      customerId: customer._id,
      appointmentId: appt._id,
      scheduledFor: now,
      payload: { orgName: org.name, serviceName: service.name, whenText: formatWhen(appt.startAt, org.timezone) },
      idempotencyKey: `cancel:${appt._id}`,
    });
  }

  // Recovery: the freed slot goes to the best eligible waitlisted customer.
  const offer = await offerSlotToWaitlist({
    orgId, serviceId: appt.serviceId, staffId: appt.staffId, startAt: appt.startAt, endAt: appt.endAt,
    sourceAppointmentId: appt._id, now, requestId: actor.requestId,
  });
  return { status: 'cancelled', recoveryOfferId: offer?._id ?? null };
}

/** Moves an appointment to a new slot. The old slot is released by the same atomic write. */
export async function rescheduleAppointment(orgId, appointmentId, newStartAt, actor) {
  const appt = await loadAppointment(orgId, appointmentId);
  if (!ACTIVE_STATUSES.includes(appt.status)) {
    throw new AppError(409, 'INVALID_STATUS', 'Only upcoming appointments can be rescheduled');
  }
  const [org, service, staff] = await Promise.all([
    Organization.findById(orgId).lean(),
    Service.findById(appt.serviceId).lean(),
    StaffProfile.findById(appt.staffId).lean(),
  ]);
  assertCutoff(service, appt, actor);
  if (new Date(newStartAt).getTime() === appt.startAt.getTime()) return { appointment: sanitize(appt.toObject()), guestToken: null };

  const startAt = new Date(newStartAt);
  await assertSlotBookable({ org, service, staff, startAt, excludeAppointmentId: appt._id });
  const endAt = addMinutes(startAt, service.durationMinutes);
  const blockedUntil = addMinutes(endAt, service.bufferMinutes);
  const old = { startAt: appt.startAt, endAt: appt.endAt, blockedUntil: appt.blockedUntil, activeSlotKey: appt.activeSlotKey };

  let res;
  try {
    res = await Appointment.updateOne(
      { _id: appt._id, status: { $in: ACTIVE_STATUSES }, startAt: appt.startAt },
      { $set: { startAt, endAt, blockedUntil, ...holdSlotFields(staff._id, startAt) } }
    );
  } catch (err) {
    if (err?.code === 11000) throw slotTaken();
    throw err;
  }
  if (res.modifiedCount === 0) throw new AppError(409, 'CONFLICT', 'This appointment was changed by someone else. Please refresh.');

  const overlap = await findOverlap({ orgId, staffId: staff._id, startAt, blockedUntil, excludeId: appt._id });
  if (overlap) {
    // Put the original slot back; the move did not happen.
    await Appointment.updateOne(
      { _id: appt._id },
      { $set: { startAt: old.startAt, endAt: old.endAt, blockedUntil: old.blockedUntil, activeSlotKey: old.activeSlotKey } }
    );
    throw slotTaken();
  }

  await setStatusHistory(orgId, appt._id, appt.status, appt.status, actor, `rescheduled from ${appt.startAt.toISOString()} to ${startAt.toISOString()}`);
  await recordAudit({ organizationId: orgId, actorUserId: actor.userId ?? null, actorType: actor.type === 'customer' ? 'customer' : 'user', action: 'appointment.rescheduled', resourceType: 'appointment', resourceId: appt._id, before: { startAt: old.startAt }, after: { startAt }, requestId: actor.requestId });

  // Pending reminders are replaced with ones for the new time.
  await cancelScheduledFor(appt._id);
  // The old manage link stops working after a move; the new one goes out in the email.
  const customer = await Customer.findById(appt.customerId).lean();
  const guestTokenRotated = generateToken();
  await Appointment.updateOne({ _id: appt._id }, { $set: { guestTokenHash: hashToken(guestTokenRotated), guestTokenExpiresAt: startAt } });
  if (customer) {
    await scheduleAppointmentEmails({
      org,
      appointment: { _id: appt._id, organizationId: orgId, startAt },
      customer,
      serviceName: service.name,
      manageUrl: `${getContext().config.appBaseUrl}/manage/${guestTokenRotated}`,
      whenText: formatWhen(startAt, org.timezone),
      confirmationType: 'reschedule_confirmation',
    });
  }

  // The old slot is now free: offer it to the waitlist.
  await offerSlotToWaitlist({ orgId, serviceId: service._id, staffId: staff._id, startAt: old.startAt, endAt: old.endAt, sourceAppointmentId: appt._id, requestId: actor.requestId });

  return { appointment: sanitize(await Appointment.findById(appt._id).lean()), guestToken: guestTokenRotated };
}

/** Status changes that are not cancellation: completed and no-show. */
export async function setAppointmentStatus(orgId, appointmentId, toStatus, actor) {
  const appt = await loadAppointment(orgId, appointmentId);
  if (!canTransition(appt.status, toStatus)) {
    throw new AppError(409, 'INVALID_STATUS', `Cannot change status from ${appt.status} to ${toStatus}`);
  }
  if (toStatus === 'cancelled') return cancelAppointment(orgId, appointmentId, actor);
  const set = { status: toStatus };
  if (toStatus === 'completed') set.completedAt = new Date();
  const res = await Appointment.updateOne(
    { _id: appt._id, status: appt.status },
    { $set: set, $unset: releaseSlotFields }
  );
  if (res.modifiedCount === 0) throw new AppError(409, 'CONFLICT', 'This appointment was already changed');
  await setStatusHistory(orgId, appt._id, appt.status, toStatus, actor, toStatus);
  await recordAudit({ organizationId: orgId, actorUserId: actor.userId ?? null, action: `appointment.${toStatus}`, resourceType: 'appointment', resourceId: appt._id, before: { status: appt.status }, after: { status: toStatus }, requestId: actor.requestId });
  return { status: toStatus };
}

/* ---------- Guest (token) actions ---------- */

async function loadByGuestToken(token) {
  const appt = await Appointment.findOne({ guestTokenHash: hashToken(token), guestTokenExpiresAt: { $gt: new Date() } }).lean();
  if (!appt) throw new AppError(404, 'NOT_FOUND', 'This link is not valid or has expired');
  return appt;
}

export async function getGuestAppointment(token) {
  const appt = await loadByGuestToken(token);
  const [org, service] = await Promise.all([Organization.findById(appt.organizationId).lean(), Service.findById(appt.serviceId).lean()]);
  const cutoff = addMinutes(appt.startAt, -service.cancelCutoffMinutes);
  return {
    id: appt._id,
    status: appt.status,
    organization: { name: org.name, timezone: org.timezone },
    service: { name: service.name, durationMinutes: service.durationMinutes },
    startAt: appt.startAt,
    startText: formatWhen(appt.startAt, org.timezone),
    canChange: ACTIVE_STATUSES.includes(appt.status) && new Date() < cutoff,
    slug: org.slug,
    serviceId: service._id,
    serviceSlug: service.slug,
  };
}

export async function cancelByGuest(token, meta = {}) {
  const appt = await loadByGuestToken(token);
  return cancelAppointment(appt.organizationId, appt._id, { type: 'customer', requestId: meta.requestId }, 'Cancelled by customer');
}

/** The caller proved possession of the old link, so the new link is returned to them directly too. */
export async function rescheduleByGuest(token, newStartAt, meta = {}) {
  const appt = await loadByGuestToken(token);
  const { guestToken } = await rescheduleAppointment(appt.organizationId, appt._id, newStartAt, { type: 'customer', requestId: meta.requestId });
  const view = await getGuestAppointment(guestToken ?? token);
  return { ...view, manageToken: guestToken };
}

/** Guest accepts an offer: thin wrapper that supplies the appointment writer to the offer engine. */
export async function acceptSlotOffer(token, meta = {}) {
  const appt = await acceptOffer(token, { placeAppointment }, meta);
  return sanitize(appt);
}
