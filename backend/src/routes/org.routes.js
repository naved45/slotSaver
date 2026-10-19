import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireMembership } from '../middleware/membership.js';
import { requireObjectIdParams } from '../middleware/objectId.js';
import { validate } from '../middleware/validate.js';
import { limits } from '../middleware/rateLimit.js';
import * as cat from '../validators/catalog.schemas.js';
import * as ops from '../validators/operations.schemas.js';
import { orgPatch } from '../validators/catalog.schemas.js';
import * as c from '../controllers/org.controller.js';
import { z } from 'zod';
import { archiveOrganization } from '../services/account.service.js';
import { AppError } from '../utils/appError.js';

const router = Router({ mergeParams: true });

const ids = (...names) => requireObjectIdParams(...names);
const q = (schema) => validate(schema, 'query');

// Every route below requires an authenticated, verified member of the organization in the URL.
router.use(requireAuth(), requireMembership('staff'));
router.use(limits.general());

/* Organization */
router.get('/', c.getOrg);
router.patch('/', requireMembership('owner'), validate(orgPatch), c.updateOrg);
router.get('/dashboard', requireMembership('admin'), c.dashboard);
router.delete('/', requireMembership('owner'), validate(z.object({ confirmName: z.string().min(1).max(120) })), async (req, res) => {
  await archiveOrganization(req.orgId, req.input.body.confirmName, { userId: req.user._id, requestId: req.id });
  res.status(204).end();
});

/* Team */
router.get('/members', requireMembership('admin'), c.listMembers);
router.post('/invitations', requireMembership('admin'), limits.invitation(), validate(cat.inviteInput), c.invite);
router.patch('/members/:membershipId', requireMembership('owner'), ids('membershipId'), validate(cat.memberPatch), c.changeMemberRole);
router.delete('/members/:membershipId', requireMembership('owner'), ids('membershipId'), c.removeMember);

/* Services */
router.get('/services', c.listServices);
router.post('/services', requireMembership('admin'), validate(cat.serviceInput), c.createService);
router.patch('/services/:serviceId', requireMembership('admin'), ids('serviceId'), validate(cat.servicePatch), c.updateService);
router.delete('/services/:serviceId', requireMembership('admin'), ids('serviceId'), c.archiveService);

/* Business hours */
router.get('/business-hours', c.getHours);
router.put('/business-hours', requireMembership('admin'), validate(cat.businessHoursInput), c.setHours);

/* Staff */
router.get('/staff', c.listStaff);
router.post('/staff', requireMembership('admin'), validate(cat.staffInput), c.createStaff);
router.get('/staff/:staffId', ids('staffId'), c.getStaff);
router.patch('/staff/:staffId', requireMembership('admin'), ids('staffId'), validate(cat.staffPatch), c.updateStaff);
router.put('/staff/:staffId/availability', ids('staffId'), validate(cat.staffAvailabilityInput), (req, res, next) => {
  // Owners and admins, or the staff member for their own profile.
  const own = req.membership.role === 'staff' && String(req.membership.staffProfileId) === String(req.params.staffId);
  if (own || ['owner', 'admin'].includes(req.membership.role)) return c.setStaffAvailability(req, res, next);
  return next(new AppError(403, 'FORBIDDEN', 'Your role does not allow this action'));
});

/* Closures */
router.get('/exceptions', q(z.object({ from: z.string().optional(), to: z.string().optional() })), c.listExceptions);
router.post('/exceptions', requireMembership('admin'), validate(cat.closureInput), c.createException);
router.delete('/exceptions/:exceptionId', requireMembership('admin'), ids('exceptionId'), c.deleteException);

/* Appointments (staff see only their own) */
router.get('/appointments', q(ops.appointmentListQuery), c.listAppointments);
router.post('/appointments', validate(ops.staffAppointmentInput), c.createAppointment);
router.get('/appointments/:appointmentId', ids('appointmentId'), c.getAppointment);
router.patch('/appointments/:appointmentId', ids('appointmentId'), validate(ops.rescheduleInput), c.rescheduleAppointment);
router.post('/appointments/:appointmentId/cancel', ids('appointmentId'), validate(ops.cancelInput), c.cancelAppointment);
router.post('/appointments/:appointmentId/status', ids('appointmentId'), validate(ops.statusInput), c.setStatus);

/* Customers (managers only) */
router.get('/customers', requireMembership('admin'), q(ops.pageQuery.extend({ q: z.string().trim().max(100).optional() })), c.listCustomers);
router.get('/customers/export.csv', requireMembership('admin'), c.exportCustomers);
router.get('/customers/:customerId', requireMembership('admin'), ids('customerId'), c.getCustomer);

/* Waitlist and offers (managers) */
router.get('/waitlist', requireMembership('admin'), q(ops.pageQuery.extend({ status: z.enum(['active', 'booked', 'removed', 'expired']).optional(), serviceId: z.string().optional() })), c.listWaitlist);
router.post('/waitlist', requireMembership('admin'), validate(ops.waitlistInput), c.addWaitlist);
router.delete('/waitlist/:entryId', requireMembership('admin'), ids('entryId'), c.removeWaitlist);
router.get('/slot-offers', requireMembership('admin'), q(ops.pageQuery.extend({ status: z.string().optional() })), c.listOffers);
router.post('/slot-offers/:offerId/override', requireMembership('admin'), ids('offerId'), validate(ops.overrideInput), c.overrideOffer);

/* Notifications and reminders (managers) */
router.get('/notifications', requireMembership('admin'), q(ops.pageQuery.extend({ status: z.string().optional() })), c.listNotifications);
router.get('/notification-deliveries', requireMembership('admin'), q(ops.pageQuery), c.listDeliveries);
router.get('/reminder-settings', requireMembership('admin'), c.getReminderSettings);
router.put('/reminder-settings', requireMembership('owner'), validate(ops.reminderSettingsInput), c.updateReminderSettings);

/* Analytics and audit (managers) */
router.get('/analytics', requireMembership('admin'), q(ops.analyticsQuery), c.analytics);
router.get('/analytics/export.csv', requireMembership('admin'), q(ops.analyticsQuery), c.exportAppointments);
router.get('/audit-logs', requireMembership('admin'), q(ops.pageQuery.extend({ action: z.string().max(80).optional(), from: z.string().optional(), to: z.string().optional() })), c.auditLog);

export default router;
