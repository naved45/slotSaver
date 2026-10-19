import { Service, StaffProfile, BusinessHours, StaffAvailability, AvailabilityException, Appointment, Membership } from '../models/index.js';
import { AppError } from '../utils/appError.js';
import { recordAudit } from './audit.service.js';

const notFound = () => new AppError(404, 'NOT_FOUND', 'Resource not found');

/* ---------- Services ---------- */

export async function listServices(orgId, { includeArchived = false } = {}) {
  const filter = { organizationId: orgId, ...(includeArchived ? {} : { archivedAt: null }) };
  return Service.find(filter).sort({ name: 1 }).lean();
}

export async function getService(orgId, serviceId) {
  const svc = await Service.findOne({ _id: serviceId, organizationId: orgId }).lean();
  if (!svc) throw notFound();
  return svc;
}

export async function createService(orgId, input, actor) {
  const svc = await Service.create({ ...input, organizationId: orgId });
  await recordAudit({ organizationId: orgId, actorUserId: actor.userId, action: 'service.created', resourceType: 'service', resourceId: svc._id, after: svc.toObject(), requestId: actor.requestId });
  return svc.toObject();
}

export async function updateService(orgId, serviceId, patch, actor) {
  const before = await getService(orgId, serviceId);
  const after = await Service.findOneAndUpdate({ _id: serviceId, organizationId: orgId }, { $set: patch }, { new: true, runValidators: true }).lean();
  await recordAudit({ organizationId: orgId, actorUserId: actor.userId, action: 'service.updated', resourceType: 'service', resourceId: serviceId, before, after, requestId: actor.requestId });
  return after;
}

/** Archives a service instead of deleting it when bookings reference it. */
export async function archiveService(orgId, serviceId, actor) {
  const before = await getService(orgId, serviceId);
  const used = await Appointment.exists({ organizationId: orgId, serviceId });
  if (used) {
    await Service.updateOne({ _id: serviceId, organizationId: orgId }, { $set: { active: false, archivedAt: new Date() } });
  } else {
    await Service.deleteOne({ _id: serviceId, organizationId: orgId });
  }
  await recordAudit({ organizationId: orgId, actorUserId: actor.userId, action: 'service.archived', resourceType: 'service', resourceId: serviceId, before, requestId: actor.requestId });
}

/* ---------- Business hours ---------- */

export async function getBusinessHours(orgId) {
  return BusinessHours.find({ organizationId: orgId }).sort({ dayOfWeek: 1 }).lean();
}

/** Replaces the org's weekly hours. Days omitted are treated as closed. */
export async function setBusinessHours(orgId, days, actor) {
  const before = await getBusinessHours(orgId);
  await BusinessHours.deleteMany({ organizationId: orgId });
  if (days.length) {
    await BusinessHours.insertMany(days.map((d) => ({ ...d, organizationId: orgId })));
  }
  const after = await getBusinessHours(orgId);
  await recordAudit({ organizationId: orgId, actorUserId: actor.userId, action: 'business_hours.updated', resourceType: 'business_hours', before, after, requestId: actor.requestId });
  return after;
}

/* ---------- Staff ---------- */

export async function listStaff(orgId) {
  const staff = await StaffProfile.find({ organizationId: orgId }).sort({ displayName: 1 }).lean();
  const hours = await StaffAvailability.find({ organizationId: orgId }).lean();
  return staff.map((s) => ({ ...s, availability: hours.filter((h) => String(h.staffId) === String(s._id)) }));
}

export async function getStaff(orgId, staffId) {
  const staff = await StaffProfile.findOne({ _id: staffId, organizationId: orgId }).lean();
  if (!staff) throw notFound();
  const availability = await StaffAvailability.find({ organizationId: orgId, staffId }).lean();
  return { ...staff, availability };
}

export async function createStaff(orgId, input, actor) {
  const staff = await StaffProfile.create({ ...input, organizationId: orgId });
  await recordAudit({ organizationId: orgId, actorUserId: actor.userId, action: 'staff.created', resourceType: 'staff', resourceId: staff._id, after: staff.toObject(), requestId: actor.requestId });
  return staff.toObject();
}

export async function updateStaff(orgId, staffId, patch, actor) {
  const before = await StaffProfile.findOne({ _id: staffId, organizationId: orgId }).lean();
  if (!before) throw notFound();
  const after = await StaffProfile.findOneAndUpdate({ _id: staffId, organizationId: orgId }, { $set: patch }, { new: true, runValidators: true }).lean();
  await recordAudit({ organizationId: orgId, actorUserId: actor.userId, action: 'staff.updated', resourceType: 'staff', resourceId: staffId, before, after, requestId: actor.requestId });
  return after;
}

/** Replaces one staff member's weekly working hours. Owners, admins, or the staff member themselves. */
export async function setStaffAvailability(orgId, staffId, days, actor) {
  const staff = await StaffProfile.exists({ _id: staffId, organizationId: orgId });
  if (!staff) throw notFound();
  const before = await StaffAvailability.find({ organizationId: orgId, staffId }).lean();
  await StaffAvailability.deleteMany({ organizationId: orgId, staffId });
  if (days.length) {
    await StaffAvailability.insertMany(days.map((d) => ({ ...d, organizationId: orgId, staffId })));
  }
  const after = await StaffAvailability.find({ organizationId: orgId, staffId }).lean();
  await recordAudit({ organizationId: orgId, actorUserId: actor.userId, action: 'staff_availability.updated', resourceType: 'staff', resourceId: staffId, before, after, requestId: actor.requestId });
  return after;
}

/** Links an accepted membership to a staff profile (used on invitation acceptance). */
export async function linkMembershipToStaff(orgId, membershipId, staffProfileId) {
  await Membership.updateOne({ _id: membershipId, organizationId: orgId }, { $set: { staffProfileId } });
}

/* ---------- Closures and exceptions ---------- */

export async function listExceptions(orgId, { from, to }) {
  const filter = { organizationId: orgId };
  if (from) filter.endAt = { $gte: new Date(from) };
  if (to) filter.startAt = { $lte: new Date(to) };
  return AvailabilityException.find(filter).sort({ startAt: 1 }).limit(500).lean();
}

export async function createException(orgId, input, actor) {
  if (input.scope === 'staff') {
    const staff = await StaffProfile.exists({ _id: input.staffId, organizationId: orgId });
    if (!staff) throw notFound();
  }
  const ex = await AvailabilityException.create({ ...input, organizationId: orgId });
  await recordAudit({ organizationId: orgId, actorUserId: actor.userId, action: 'closure.created', resourceType: 'closure', resourceId: ex._id, after: ex.toObject(), requestId: actor.requestId });
  return ex.toObject();
}

export async function deleteException(orgId, exId, actor) {
  const before = await AvailabilityException.findOneAndDelete({ _id: exId, organizationId: orgId }).lean();
  if (!before) throw notFound();
  await recordAudit({ organizationId: orgId, actorUserId: actor.userId, action: 'closure.deleted', resourceType: 'closure', resourceId: exId, before, requestId: actor.requestId });
}
