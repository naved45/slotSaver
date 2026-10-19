import { DateTime } from 'luxon';
import {
  Organization, StaffProfile, BusinessHours, StaffAvailability, AvailabilityException, Appointment,
} from '../models/index.js';
import { ACTIVE_STATUSES } from '../models/Appointment.js';
import { generateAvailability, localMinuteToUtc } from './availability.service.js';
import { localDate } from '../utils/time.js';
import { AppError } from '../utils/appError.js';

export async function loadOrg(orgId) {
  const org = await Organization.findById(orgId).lean();
  if (!org) throw new AppError(404, 'NOT_FOUND', 'Resource not found');
  return org;
}

/** Staff must be active and listed for the service. Otherwise the booking is refused. */
export async function eligibleStaff(orgId, staffId, serviceId) {
  const staff = await StaffProfile.findOne({ _id: staffId, organizationId: orgId, active: true }).lean();
  if (!staff) throw new AppError(404, 'NOT_FOUND', 'Staff member not found');
  if (serviceId && !staff.serviceIds.some((id) => String(id) === String(serviceId))) {
    throw new AppError(409, 'STAFF_NOT_ELIGIBLE', 'This staff member does not offer that service');
  }
  return staff;
}

/** Slots for one staff member for a service over a local date range, respecting every rule. */
export async function staffSlots({ org, service, staff, from, to, excludeAppointmentId = null, now = new Date() }) {
  const tz = org.timezone;
  const fromUtc = DateTime.fromISO(from, { zone: tz }).minus({ days: 1 }).toJSDate();
  const toUtc = DateTime.fromISO(to, { zone: tz }).plus({ days: 2 }).toJSDate();

  const [hours, staffHours, closures, busyRows] = await Promise.all([
    BusinessHours.find({ organizationId: org._id }).lean(),
    StaffAvailability.find({ organizationId: org._id, staffId: staff._id }).lean(),
    AvailabilityException.find({
      organizationId: org._id,
      $or: [{ scope: 'org' }, { scope: 'staff', staffId: staff._id }],
      startAt: { $lt: toUtc },
      endAt: { $gt: fromUtc },
    }).lean(),
    Appointment.find({
      organizationId: org._id,
      staffId: staff._id,
      status: { $in: ACTIVE_STATUSES },
      startAt: { $lt: toUtc },
      blockedUntil: { $gt: fromUtc },
      ...(excludeAppointmentId ? { _id: { $ne: excludeAppointmentId } } : {}),
    }).lean(),
  ]);

  return generateAvailability({
    timezone: tz,
    from,
    to,
    businessHours: hours.map((h) => ({ dayOfWeek: h.dayOfWeek, openMinute: h.openMinute, closeMinute: h.closeMinute, breaks: h.breaks })),
    staffAvailability: staffHours.map((h) => ({ dayOfWeek: h.dayOfWeek, startMinute: h.startMinute, endMinute: h.endMinute, breaks: h.breaks })),
    closures: closures.map((c) => ({ startAt: c.startAt, endAt: c.endAt })),
    busy: busyRows.map((b) => ({ startAt: b.startAt, endAt: b.blockedUntil })),
    durationMinutes: service.durationMinutes,
    bufferMinutes: service.bufferMinutes,
    stepMinutes: 15,
    leadTimeMinutes: service.leadTimeMinutes,
    maxAdvanceDays: service.maxAdvanceDays,
    now,
  });
}

/**
 * Server-side revalidation right before a booking is written. Client-side availability is never
 * trusted. Returns true only if startAt is exactly one of the currently computed slot starts.
 */
export async function assertSlotBookable({ org, service, staff, startAt, excludeAppointmentId = null, now = new Date() }) {
  const date = localDate(startAt, org.timezone);
  const days = await staffSlots({ org, service, staff, from: date, to: date, excludeAppointmentId, now });
  const ok = days.some((d) => d.slots.some((s) => s.startAt.getTime() === startAt.getTime()));
  if (!ok) throw new AppError(409, 'SLOT_UNAVAILABLE', 'That time is no longer available. Please choose another.');
  return true;
}

/** Any other active appointment for this staff whose occupancy overlaps [startAt, blockedUntil). */
export async function findOverlap({ orgId, staffId, startAt, blockedUntil, excludeId }) {
  return Appointment.findOne({
    organizationId: orgId,
    staffId,
    status: { $in: ACTIVE_STATUSES },
    startAt: { $lt: blockedUntil },
    blockedUntil: { $gt: startAt },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  }).lean();
}

export function formatWhen(startAt, timezone) {
  return DateTime.fromJSDate(startAt, { zone: timezone }).toFormat("ccc d LLL yyyy, h:mm a ZZZZ");
}

export { localMinuteToUtc };
