import { Router } from 'express';

/**
 * OpenAPI 3.0 description of the main API surface. Marked partial: it lists every route group
 * and method with a summary, but schemas are not yet complete. See docs/API.md for contracts.
 */
const op = (summary, tag, secured = true) => ({ summary, tags: [tag], ...(secured ? { security: [{ sessionCookie: [] }] } : {}), responses: { 200: { description: 'OK' }, 400: { description: 'Validation error' }, 401: { description: 'Not signed in' }, 403: { description: 'Forbidden' }, 404: { description: 'Not found' }, 409: { description: 'Conflict' }, 429: { description: 'Rate limited' } } });

export const openApiSpec = {
  openapi: '3.0.3',
  info: { title: 'SlotSaver API', version: '0.2.0', description: 'Partial specification. x-status: partial' },
  'x-status': 'partial',
  servers: [{ url: '/api/v1' }],
  components: { securitySchemes: { sessionCookie: { type: 'apiKey', in: 'cookie', name: 'ss_session' } } },
  paths: {
    '/auth/signup': { post: op('Create owner account and business (generic response)', 'auth', false) },
    '/auth/verify-email': { post: op('Verify email with single-use token', 'auth', false) },
    '/auth/resend-verification': { post: op('Resend verification (generic)', 'auth', false) },
    '/auth/login': { post: op('Sign in; sets session cookie', 'auth', false) },
    '/auth/logout': { post: op('Revoke current session', 'auth') },
    '/auth/me': { get: op('Current user and memberships', 'auth') },
    '/auth/forgot-password': { post: op('Request password reset (generic)', 'auth', false) },
    '/auth/reset-password': { post: op('Reset password; revokes sessions', 'auth', false) },
    '/auth/sessions': { get: op('List active sessions', 'auth') },
    '/auth/sessions/{sessionId}': { delete: op('Revoke one session', 'auth') },
    '/auth/export': { get: op('Export personal data', 'account') },
    '/auth/account': { delete: op('Delete account (owners must archive organizations first)', 'account') },
    '/public/businesses/{slug}': { get: op('Public business and services', 'public', false) },
    '/public/businesses/{slug}/services/{serviceSlug}/availability': { get: op('Bookable slots', 'public', false) },
    '/public/businesses/{slug}/services/{serviceSlug}/bookings': { post: op('Public booking (rate limited)', 'public', false) },
    '/public/guest/appointments/{token}': { get: op('Guest booking view', 'public', false) },
    '/public/guest/appointments/{token}/cancel': { post: op('Guest cancel', 'public', false) },
    '/public/guest/appointments/{token}/reschedule': { post: op('Guest reschedule', 'public', false) },
    '/public/slot-offers/{token}': { get: op('Offer view', 'public', false) },
    '/public/slot-offers/{token}/accept': { post: op('Accept offer (first valid acceptance wins)', 'public', false) },
    '/public/slot-offers/{token}/decline': { post: op('Decline offer', 'public', false) },
    '/invitations/accept': { post: op('Accept staff invitation', 'team') },
    '/orgs/{orgId}': { get: op('Organization', 'org'), patch: op('Update organization (owner)', 'org'), delete: op('Archive organization (owner)', 'org') },
    '/orgs/{orgId}/dashboard': { get: op('Dashboard metrics', 'analytics') },
    '/orgs/{orgId}/members': { get: op('Members (admin)', 'team') },
    '/orgs/{orgId}/invitations': { post: op('Invite member (admin)', 'team') },
    '/orgs/{orgId}/services': { get: op('List services', 'catalog'), post: op('Create service (admin)', 'catalog') },
    '/orgs/{orgId}/services/{serviceId}': { patch: op('Update service', 'catalog'), delete: op('Archive or delete service', 'catalog') },
    '/orgs/{orgId}/business-hours': { get: op('Business hours', 'catalog'), put: op('Replace business hours (admin)', 'catalog') },
    '/orgs/{orgId}/staff': { get: op('List staff', 'catalog'), post: op('Create staff (admin)', 'catalog') },
    '/orgs/{orgId}/staff/{staffId}/availability': { put: op('Replace staff weekly hours', 'catalog') },
    '/orgs/{orgId}/exceptions': { get: op('Closures', 'catalog'), post: op('Create closure (admin)', 'catalog') },
    '/orgs/{orgId}/appointments': { get: op('List appointments', 'appointments'), post: op('Create appointment', 'appointments') },
    '/orgs/{orgId}/appointments/{appointmentId}': { get: op('Appointment detail with history', 'appointments'), patch: op('Reschedule', 'appointments') },
    '/orgs/{orgId}/appointments/{appointmentId}/cancel': { post: op('Cancel (triggers waitlist recovery)', 'appointments') },
    '/orgs/{orgId}/appointments/{appointmentId}/status': { post: op('Mark completed or no-show', 'appointments') },
    '/orgs/{orgId}/customers': { get: op('List customers (admin)', 'customers') },
    '/orgs/{orgId}/customers/{customerId}': { get: op('Customer detail (admin)', 'customers') },
    '/orgs/{orgId}/customers/export.csv': { get: op('Export customers CSV (admin)', 'customers') },
    '/orgs/{orgId}/waitlist': { get: op('Waitlist (admin)', 'waitlist'), post: op('Add waitlist entry (admin)', 'waitlist') },
    '/orgs/{orgId}/waitlist/{entryId}': { delete: op('Remove waitlist entry', 'waitlist') },
    '/orgs/{orgId}/slot-offers': { get: op('Slot offers (admin)', 'waitlist') },
    '/orgs/{orgId}/slot-offers/{offerId}/override': { post: op('Manual override (admin)', 'waitlist') },
    '/orgs/{orgId}/notifications': { get: op('Notifications and counts (admin)', 'reminders') },
    '/orgs/{orgId}/notification-deliveries': { get: op('Delivery history (admin)', 'reminders') },
    '/orgs/{orgId}/reminder-settings': { get: op('Reminder settings', 'reminders'), put: op('Update reminder settings (owner)', 'reminders') },
    '/orgs/{orgId}/analytics': { get: op('Analytics for a date range (admin)', 'analytics') },
    '/orgs/{orgId}/analytics/export.csv': { get: op('Appointments CSV (admin)', 'analytics') },
    '/orgs/{orgId}/audit-logs': { get: op('Audit history (admin)', 'audit') },
  },
};

const router = Router();
router.get('/openapi.json', (req, res) => res.json(openApiSpec));
export default router;
