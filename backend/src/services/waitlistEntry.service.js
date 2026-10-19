import { WaitlistEntry, Service, StaffProfile } from '../models/index.js';
import { AppError } from '../utils/appError.js';
import { upsertCustomer } from './booking.service.js';
import { recordAudit } from './audit.service.js';

const DEFAULT_ENTRY_DAYS = 60;

/** Adds a customer to the waitlist. Consent is recorded; entries without email consent are never offered. */
export async function createWaitlistEntry(orgId, input, actor) {
  const service = await Service.findOne({ _id: input.serviceId, organizationId: orgId, active: true }).lean();
  if (!service) throw new AppError(404, 'NOT_FOUND', 'Service not found');
  if (input.preferredStaffIds.length) {
    const count = await StaffProfile.countDocuments({ _id: { $in: input.preferredStaffIds }, organizationId: orgId, serviceIds: service._id });
    if (count !== new Set(input.preferredStaffIds.map(String)).size) {
      throw new AppError(409, 'STAFF_NOT_ELIGIBLE', 'One or more staff members do not offer this service');
    }
  }
  const customer = await upsertCustomer(orgId, input.customer, input.consent.email);
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : new Date(Date.now() + DEFAULT_ENTRY_DAYS * 86_400_000);
  const entry = await WaitlistEntry.create({
    organizationId: orgId,
    serviceId: service._id,
    customerId: customer._id,
    anyStaff: input.anyStaff,
    preferredStaffIds: input.anyStaff ? [] : input.preferredStaffIds,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    daysOfWeek: input.daysOfWeek,
    timeRanges: input.timeRanges,
    expiresAt,
    requestedAt: new Date(),
    consent: { email: input.consent.email, sms: false },
    contactMethod: 'email',
  });
  await recordAudit({ organizationId: orgId, actorUserId: actor.userId, action: 'waitlist.created', resourceType: 'waitlist_entry', resourceId: entry._id, after: { serviceId: service._id, customerId: customer._id }, requestId: actor.requestId });
  return entry.toObject();
}
