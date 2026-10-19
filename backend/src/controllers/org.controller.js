import { Organization } from '../models/index.js';
import { inputOf } from '../middleware/validate.js';
import { AppError } from '../utils/appError.js';
import * as catalog from '../services/catalog.service.js';
import * as booking from '../services/booking.service.js';
import * as team from '../services/team.service.js';
import * as query from '../services/query.service.js';
import * as offers from '../services/offer.service.js';
import { createWaitlistEntry } from '../services/waitlistEntry.service.js';
import { recordAudit } from '../services/audit.service.js';
import { isManager } from '../middleware/membership.js';
import { DateTime } from 'luxon';
import { Appointment } from '../models/index.js';

const actorOf = (req) => ({ userId: req.user._id, requestId: req.id, role: req.membership.role, staffProfileId: req.membership.staffProfileId });
const sendCsv = (res, name, body) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(body);
};

/* ----- Organization ----- */

export async function getOrg(req, res) {
  const org = await Organization.findById(req.orgId).lean();
  res.json({ data: { ...org, role: req.membership.role } });
}

export async function updateOrg(req, res) {
  const patch = inputOf(req);
  const before = await Organization.findById(req.orgId).lean();
  const flat = { ...patch };
  if (patch.bookingPolicy) {
    for (const [k, v] of Object.entries(patch.bookingPolicy)) flat[`bookingPolicy.${k}`] = v;
    delete flat.bookingPolicy;
  }
  const after = await Organization.findByIdAndUpdate(req.orgId, { $set: flat }, { new: true, runValidators: true }).lean();
  await recordAudit({ organizationId: req.orgId, actorUserId: req.user._id, action: 'settings.updated', resourceType: 'organization', resourceId: req.orgId, before, after, requestId: req.id });
  res.json({ data: after });
}

export async function dashboard(req, res) {
  const org = await Organization.findById(req.orgId).lean();
  res.json({ data: await query.dashboard(req.orgId, org.timezone) });
}

/* ----- Team ----- */

export async function listMembers(req, res) {
  res.json({ data: await team.listMembers(req.orgId) });
}
export async function invite(req, res) {
  res.status(201).json({ data: await team.inviteMember(req.orgId, inputOf(req), actorOf(req)) });
}
export async function changeMemberRole(req, res) {
  await team.changeRole(req.orgId, req.params.membershipId, inputOf(req).role, actorOf(req));
  res.status(204).end();
}
export async function removeMember(req, res) {
  await team.removeMember(req.orgId, req.params.membershipId, actorOf(req));
  res.status(204).end();
}

/* ----- Services ----- */

export async function listServices(req, res) {
  res.json({ data: await catalog.listServices(req.orgId, { includeArchived: isManager(req.membership) && req.query.includeArchived === 'true' }) });
}
export async function createService(req, res) {
  res.status(201).json({ data: await catalog.createService(req.orgId, inputOf(req), actorOf(req)) });
}
export async function updateService(req, res) {
  res.json({ data: await catalog.updateService(req.orgId, req.params.serviceId, inputOf(req), actorOf(req)) });
}
export async function archiveService(req, res) {
  await catalog.archiveService(req.orgId, req.params.serviceId, actorOf(req));
  res.status(204).end();
}

/* ----- Business hours ----- */

export async function getHours(req, res) {
  res.json({ data: await catalog.getBusinessHours(req.orgId) });
}
export async function setHours(req, res) {
  res.json({ data: await catalog.setBusinessHours(req.orgId, inputOf(req).days, actorOf(req)) });
}

/* ----- Staff ----- */

export async function listStaff(req, res) {
  res.json({ data: await catalog.listStaff(req.orgId) });
}
export async function createStaff(req, res) {
  res.status(201).json({ data: await catalog.createStaff(req.orgId, inputOf(req), actorOf(req)) });
}
export async function getStaff(req, res) {
  res.json({ data: await catalog.getStaff(req.orgId, req.params.staffId) });
}
export async function updateStaff(req, res) {
  res.json({ data: await catalog.updateStaff(req.orgId, req.params.staffId, inputOf(req), actorOf(req)) });
}
export async function setStaffAvailability(req, res) {
  res.json({ data: await catalog.setStaffAvailability(req.orgId, req.params.staffId, inputOf(req).days, actorOf(req)) });
}

/* ----- Closures ----- */

export async function listExceptions(req, res) {
  res.json({ data: await catalog.listExceptions(req.orgId, req.query) });
}
export async function createException(req, res) {
  res.status(201).json({ data: await catalog.createException(req.orgId, inputOf(req), actorOf(req)) });
}
export async function deleteException(req, res) {
  await catalog.deleteException(req.orgId, req.params.exceptionId, actorOf(req));
  res.status(204).end();
}

/* ----- Appointments ----- */

/** Staff may act only on appointments assigned to their own profile. Others get 404. */
async function assertCanSeeAppointment(req, appointmentId) {
  if (isManager(req.membership)) return;
  const appt = await Appointment.findOne({ _id: appointmentId, organizationId: req.orgId }).select('staffId').lean();
  if (!appt || String(appt.staffId) !== String(req.membership.staffProfileId)) {
    throw new AppError(404, 'NOT_FOUND', 'Resource not found');
  }
}

export async function listAppointments(req, res) {
  const out = await query.listAppointments(req.orgId, inputOf(req, 'query'), { role: req.membership.role, staffProfileId: req.membership.staffProfileId });
  res.json({ data: out.items, meta: out.meta });
}
export async function createAppointment(req, res) {
  const actor = actorOf(req);
  const appt = await booking.createStaffAppointment(req.orgId, inputOf(req), actor);
  res.status(201).json({ data: appt });
}
export async function getAppointment(req, res) {
  res.json({ data: await query.getAppointmentDetail(req.orgId, req.params.appointmentId, { role: req.membership.role, staffProfileId: req.membership.staffProfileId }) });
}
export async function rescheduleAppointment(req, res) {
  await assertCanSeeAppointment(req, req.params.appointmentId);
  const out = await booking.rescheduleAppointment(req.orgId, req.params.appointmentId, inputOf(req).startAt, actorOf(req));
  res.json({ data: out.appointment });
}
export async function cancelAppointment(req, res) {
  await assertCanSeeAppointment(req, req.params.appointmentId);
  const out = await booking.cancelAppointment(req.orgId, req.params.appointmentId, actorOf(req), inputOf(req).reason);
  res.json({ data: out });
}
export async function setStatus(req, res) {
  await assertCanSeeAppointment(req, req.params.appointmentId);
  res.json({ data: await booking.setAppointmentStatus(req.orgId, req.params.appointmentId, inputOf(req).status, actorOf(req)) });
}

/* ----- Customers ----- */

export async function listCustomers(req, res) {
  const out = await query.listCustomers(req.orgId, inputOf(req, 'query'));
  res.json({ data: out.items, meta: out.meta });
}
export async function getCustomer(req, res) {
  res.json({ data: await query.getCustomerDetail(req.orgId, req.params.customerId) });
}
export async function exportCustomers(req, res) {
  await recordAudit({ organizationId: req.orgId, actorUserId: req.user._id, action: 'export.customers', resourceType: 'export', requestId: req.id });
  sendCsv(res, 'customers.csv', await query.exportCustomersCsv(req.orgId));
}

/* ----- Waitlist and offers ----- */

export async function listWaitlist(req, res) {
  const out = await query.listWaitlist(req.orgId, inputOf(req, 'query'));
  res.json({ data: out.items, meta: out.meta });
}
export async function addWaitlist(req, res) {
  res.status(201).json({ data: await createWaitlistEntry(req.orgId, inputOf(req), actorOf(req)) });
}
export async function removeWaitlist(req, res) {
  await offers.removeWaitlistEntry(req.orgId, req.params.entryId, req.user._id, req.id);
  res.status(204).end();
}
export async function listOffers(req, res) {
  const out = await query.listOffers(req.orgId, inputOf(req, 'query'));
  res.json({ data: out.items, meta: out.meta });
}
export async function overrideOffer(req, res) {
  res.json({ data: await offers.overrideOffer({ orgId: req.orgId, offerId: req.params.offerId, action: inputOf(req).action, actorUserId: req.user._id, requestId: req.id }) });
}

/* ----- Notifications and reminder settings ----- */

export async function listNotifications(req, res) {
  const out = await query.listNotifications(req.orgId, inputOf(req, 'query'));
  res.json({ data: out.items, meta: out.meta, counts: out.counts });
}
export async function listDeliveries(req, res) {
  const out = await query.listDeliveries(req.orgId, inputOf(req, 'query'));
  res.json({ data: out.items, meta: out.meta });
}
export async function getReminderSettings(req, res) {
  const org = await Organization.findById(req.orgId).select('bookingPolicy').lean();
  res.json({ data: { reminderOffsetsMinutes: org.bookingPolicy.reminderOffsetsMinutes, confirmationEmails: org.bookingPolicy.confirmationEmails } });
}
export async function updateReminderSettings(req, res) {
  const body = inputOf(req);
  const before = await Organization.findById(req.orgId).select('bookingPolicy').lean();
  await Organization.updateOne({ _id: req.orgId }, { $set: { 'bookingPolicy.reminderOffsetsMinutes': body.reminderOffsetsMinutes, 'bookingPolicy.confirmationEmails': body.confirmationEmails } });
  await recordAudit({ organizationId: req.orgId, actorUserId: req.user._id, action: 'reminders.updated', resourceType: 'organization', resourceId: req.orgId, before: before.bookingPolicy, after: body, requestId: req.id });
  res.json({ data: body });
}

/* ----- Analytics and audit ----- */

export async function analytics(req, res) {
  const org = await Organization.findById(req.orgId).lean();
  const q = inputOf(req, 'query');
  res.json({ data: await query.computeAnalytics(req.orgId, { ...q, timezone: org.timezone }) });
}
export async function exportAppointments(req, res) {
  const org = await Organization.findById(req.orgId).lean();
  const q = inputOf(req, 'query');
  const from = DateTime.fromISO(q.from, { zone: org.timezone }).startOf('day').toISO();
  const to = DateTime.fromISO(q.to, { zone: org.timezone }).endOf('day').toISO();
  await recordAudit({ organizationId: req.orgId, actorUserId: req.user._id, action: 'export.appointments', resourceType: 'export', requestId: req.id });
  sendCsv(res, 'appointments.csv', await query.exportAppointmentsCsv(req.orgId, { from, to, timezone: org.timezone }));
}
export async function auditLog(req, res) {
  const out = await query.listAudit(req.orgId, inputOf(req, 'query'));
  res.json({ data: out.items, meta: out.meta });
}

