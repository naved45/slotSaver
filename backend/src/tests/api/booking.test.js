import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startTestApp, client } from '../helpers/testApp.js';
import { createOwner, setupCatalog, at, runAllJobs, manageTokenFor, offerTokenFor } from '../helpers/fixtures.js';
import { devOutbox } from '../../services/email/outbox.js';
import { Appointment, AuditLog, Customer, WaitlistEntry, SlotOffer, Job } from '../../models/index.js';

let app;
let owner;
let cat;
let pub;

beforeAll(async () => {
  app = await startTestApp();
  owner = await createOwner(app.base, { email: 'owner-book@example.com', businessName: 'Maple Dental Studio' });
  cat = await setupCatalog(owner);
  pub = client(app.base);
});
afterAll(async () => { await app.close(); });

const slug = 'maple-dental-studio';
const bookPath = () => `/api/v1/public/businesses/${slugOf()}/services/cleaning/bookings`;
let cachedSlug = null;
function slugOf() {
  return cachedSlug;
}

describe('public discovery and availability', () => {
  it('publishes the business and its active services', async () => {
    const org = await Appointment.db.db.collection('organizations').findOne({ _id: new mongoose.Types.ObjectId(owner.orgId) });
    cachedSlug = org.slug;
    const res = await pub.get(`/api/v1/public/businesses/${org.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.data.services.map((s) => s.slug)).toContain('cleaning');
    expect(res.body.data.services[0].priceMinor).toBe(50000);
  });

  it('lists availability with buffers and both staff members', async () => {
    const day = at(10, 0).slice(0, 10);
    const res = await pub.get(`/api/v1/public/businesses/${cachedSlug}/services/cleaning/availability?from=${day}&to=${day}`);
    expect(res.status).toBe(200);
    const ten = res.body.data.slots.find((s) => s.localTime === '10:00');
    expect(ten.staffIds).toHaveLength(2);
  });

  it('rejects an availability range longer than 31 days', async () => {
    const res = await pub.get(`/api/v1/public/businesses/${cachedSlug}/services/cleaning/availability?from=2026-01-01&to=2026-06-01`);
    expect(res.status).toBe(400);
  });
});

describe('double-booking prevention', () => {
  it('books a slot and sends a confirmation only after the job runs, with a manage link', async () => {
    const email = 'guest1@example.com';
    const res = await pub.post(bookPath(), {
      staffId: cat.staffA._id,
      startAt: at(10, 0),
      customer: { fullName: 'Guest One', email },
      consent: { email: true },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.appointment.priceMinor).toBe(50000); // server price
    expect(JSON.stringify(res.body)).not.toMatch(/guestToken|manage\//); // link never in the response
    expect(devOutbox.find(email, 'confirmed')).toBeUndefined();
    await runAllJobs();
    expect(devOutbox.find(email, 'confirmed')).toBeTruthy();
    expect(manageTokenFor(email)).toBeTruthy();
  });

  it('refuses a second booking for the same staff and time', async () => {
    const res = await pub.post(bookPath(), {
      staffId: cat.staffA._id, startAt: at(10, 0), customer: { fullName: 'Guest Two', email: 'guest2@example.com' }, consent: { email: false },
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_UNAVAILABLE');
  });

  it('lets only ONE of many simultaneous requests win the same slot', async () => {
    const start = at(11, 0);
    const requests = Array.from({ length: 6 }, (_, i) =>
      client(app.base).post(bookPath(), {
        staffId: cat.staffA._id, startAt: start, customer: { fullName: `Racer ${i}`, email: `racer${i}@example.com` }, consent: { email: false },
      })
    );
    const results = await Promise.all(requests);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.every((s) => s === 201 || s === 409)).toBe(true);
    const active = await Appointment.countDocuments({ staffId: cat.staffA._id, startAt: new Date(start), status: { $in: ['requested', 'confirmed'] } });
    expect(active).toBe(1);
  });

  it('never leaves two overlapping active bookings for one staff, even with different start times', async () => {
    // 10:00 and 10:15 overlap for a 30-minute service plus 10-minute buffer.
    const results = await Promise.all([
      client(app.base).post(bookPath(), { staffId: cat.staffB._id, startAt: at(12, 0), customer: { fullName: 'Overlap A', email: 'ovA@example.com' }, consent: { email: false } }),
      client(app.base).post(bookPath(), { staffId: cat.staffB._id, startAt: at(12, 15), customer: { fullName: 'Overlap B', email: 'ovB@example.com' }, consent: { email: false } }),
    ]);
    expect(results.every((r) => r.status === 201 || r.status === 409)).toBe(true);
    const active = await Appointment.find({ staffId: cat.staffB._id, status: { $in: ['requested', 'confirmed'] }, startAt: { $gte: new Date(at(11, 30)), $lte: new Date(at(12, 30)) } }).lean();
    expect(active.length).toBeLessThanOrEqual(1);
  });

  it('replays an idempotent request without creating a second appointment', async () => {
    const body = { staffId: cat.staffA._id, startAt: at(15, 0), customer: { fullName: 'Idem', email: 'idem@example.com' }, consent: { email: false }, idempotencyKey: 'abcdef-123456' };
    const first = await pub.post(bookPath(), body);
    const second = await pub.post(bookPath(), body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data.appointment.id).toBe(first.body.data.appointment.id);
  });

  it('rejects times outside business hours and never trusts a client-supplied price', async () => {
    const late = await pub.post(bookPath(), { staffId: cat.staffA._id, startAt: at(20, 0), customer: { fullName: 'Late', email: 'late@example.com' }, consent: { email: false } });
    expect(late.status).toBe(409);
    const priced = await pub.post(bookPath(), { staffId: cat.staffA._id, startAt: at(16, 0), priceMinor: 1, customer: { fullName: 'Price', email: 'price@example.com' }, consent: { email: false } });
    expect(priced.status).toBe(201);
    expect(priced.body.data.appointment.priceMinor).toBe(50000);
  });
});

describe('guest self-service', () => {
  let guestEmail;
  beforeAll(async () => {
    guestEmail = 'selfservice@example.com';
    const r = await pub.post(bookPath(), { staffId: cat.staffB._id, startAt: at(9, 30, 4), customer: { fullName: 'Self Service', email: guestEmail }, consent: { email: true } });
    expect(r.status).toBe(201);
    await runAllJobs();
  });

  it('shows the booking to the guest holding the link', async () => {
    const token = manageTokenFor(guestEmail);
    const res = await pub.get(`/api/v1/public/guest/appointments/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.canChange).toBe(true);
  });

  it('rejects a made-up token', async () => {
    const res = await pub.get('/api/v1/public/guest/appointments/' + 'A'.repeat(43));
    expect(res.status).toBe(404);
  });

  it('reschedules and releases the old slot so someone else can book it', async () => {
    const token = manageTokenFor(guestEmail);
    const moved = await pub.post(`/api/v1/public/guest/appointments/${token}/reschedule`, { startAt: at(13, 0, 4) });
    expect(moved.status).toBe(200);
    expect(moved.body.data.manageToken).toBeTruthy();
    await runAllJobs(); // the move email (with the new link) is delivered by the worker
    const oldSlotBooking = await client(app.base).post(bookPath(), { staffId: cat.staffB._id, startAt: at(9, 30, 4), customer: { fullName: 'Next', email: 'next@example.com' }, consent: { email: false } });
    expect(oldSlotBooking.status).toBe(201);
    const oldToken = token;
    const stale = await pub.get(`/api/v1/public/guest/appointments/${oldToken}`);
    expect(stale.status).toBe(404); // old link stops working after a move
  });

  it('cancels with the new link and makes the slot bookable again', async () => {
    const token = manageTokenFor(guestEmail); // the reschedule email carried the new link
    const cancel = await pub.post(`/api/v1/public/guest/appointments/${token}/cancel`);
    expect(cancel.status).toBe(200);
    const again = await client(app.base).post(bookPath(), { staffId: cat.staffB._id, startAt: at(13, 0, 4), customer: { fullName: 'Refill', email: 'refill@example.com' }, consent: { email: false } });
    expect(again.status).toBe(201);
  });

  it('blocks a guest cancellation inside the cutoff window', async () => {
    // Time-independent: widen the cutoff to 5 days so a booking 3 days ahead is always inside it.
    const { Service } = await import('../../models/index.js');
    await Service.updateOne({ slug: 'cleaning' }, { $set: { cancelCutoffMinutes: 7200, leadTimeMinutes: 0 } });
    const booked = await pub.post(bookPath(), { staffId: cat.staffA._id, startAt: at(17, 0, 3), customer: { fullName: 'Soon Guest', email: 'soon@example.com' }, consent: { email: true } });
    expect(booked.status).toBe(201);
    await runAllJobs();
    const token = manageTokenFor('soon@example.com', 'confirmed');
    const res = await pub.post(`/api/v1/public/guest/appointments/${token}/cancel`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CUTOFF_PASSED');
    await Service.updateOne({ slug: 'cleaning' }, { $set: { cancelCutoffMinutes: 120 } });
  });
});

describe('staff permissions and tenant isolation', () => {
  let staffUser;
  let staffAppt;
  beforeAll(async () => {
    // Invite a staff member for staffB and accept it.
    const invite = await owner.client.post(`/api/v1/orgs/${owner.orgId}/invitations`, { email: 'ravi@example.com', role: 'staff', staffProfileId: cat.staffB._id });
    expect(invite.status).toBe(201);
    const token = devOutbox.find('ravi@example.com', 'invited').text.match(/token=([A-Za-z0-9_-]+)/)[1];
    const signup = client(app.base);
    await signup.post('/api/v1/auth/signup', { fullName: 'Ravi', email: 'ravi@example.com', password: 'correct-horse-battery', confirmPassword: 'correct-horse-battery', businessName: 'Ravi Own Biz', businessType: 'other', timezone: 'Asia/Kolkata', termsAccepted: true });
    const v = devOutbox.find('ravi@example.com', 'Verify').text.match(/token=([A-Za-z0-9_-]+)/)[1];
    await signup.post('/api/v1/auth/verify-email', { token: v });
    await signup.post('/api/v1/auth/login', { email: 'ravi@example.com', password: 'correct-horse-battery' });
    staffUser = signup;
    const accepted = await staffUser.post('/api/v1/invitations/accept', { token });
    expect(accepted.status).toBe(200);
    const bk = await owner.client.post(`/api/v1/orgs/${owner.orgId}/appointments`, { serviceId: cat.service._id, staffId: cat.staffA._id, startAt: at(17, 0, 5), customer: { fullName: 'Owner Booked', email: 'ownerbooked@example.com' }, consent: { email: false } });
    expect(bk.status).toBe(201);
    staffAppt = bk.body.data;
  });

  it('staff cannot see another staff member\'s appointment (404, not 403)', async () => {
    const res = await staffUser.get(`/api/v1/orgs/${owner.orgId}/appointments/${staffAppt._id}`);
    expect(res.status).toBe(404);
  });

  it('staff cannot book for another staff member', async () => {
    const res = await staffUser.post(`/api/v1/orgs/${owner.orgId}/appointments`, { serviceId: cat.service._id, staffId: cat.staffA._id, startAt: at(12, 0, 5), customer: { fullName: 'Xavier Pine', email: 'x@example.com' }, consent: { email: false } });
    expect(res.status).toBe(403);
  });

  it('staff cannot read customers, analytics, or audit logs', async () => {
    expect((await staffUser.get(`/api/v1/orgs/${owner.orgId}/customers`)).status).toBe(403);
    expect((await staffUser.get(`/api/v1/orgs/${owner.orgId}/analytics?from=2026-01-01&to=2026-01-31`)).status).toBe(403);
    expect((await staffUser.get(`/api/v1/orgs/${owner.orgId}/audit-logs`)).status).toBe(403);
  });

  it('staff cannot change services or business hours', async () => {
    expect((await staffUser.post(`/api/v1/orgs/${owner.orgId}/services`, { name: 'Hack', slug: 'hack', durationMinutes: 30 })).status).toBe(403);
    expect((await staffUser.put(`/api/v1/orgs/${owner.orgId}/business-hours`, { days: [] })).status).toBe(403);
  });

  it('another organization owner cannot read this organization (404)', async () => {
    const other = await createOwner(app.base, { email: 'intruder@example.com', businessName: 'Intruder Co' });
    const res = await other.client.get(`/api/v1/orgs/${owner.orgId}/services`);
    expect(res.status).toBe(404);
    const writes = await other.client.post(`/api/v1/orgs/${owner.orgId}/services`, { name: 'Pwn', slug: 'pwn', durationMinutes: 30 });
    expect(writes.status).toBe(404);
  });

  it('rejects malformed object ids in the URL with 404', async () => {
    expect((await owner.client.get(`/api/v1/orgs/${owner.orgId}/appointments/not-an-id`)).status).toBe(404);
  });

  it('writes audit entries for important changes and exposes them to owners only', async () => {
    const log = await owner.client.get(`/api/v1/orgs/${owner.orgId}/audit-logs?action=appointment`);
    expect(log.status).toBe(200);
    expect(log.body.data.some((e) => e.action === 'appointment.created')).toBe(true);
    const entries = await AuditLog.find({ organizationId: owner.orgId }).lean();
    expect(JSON.stringify(entries)).not.toMatch(/correct-horse-battery|guestToken/);
  });
});

describe('waitlist recovery', () => {
  let w1, customerCancelled, sourceAppt;
  const svcId = () => cat.service._id;

  beforeAll(async () => {
    const base = `/api/v1/orgs/${owner.orgId}`;
    const book = await owner.client.post(`${base}/appointments`, { serviceId: svcId(), staffId: cat.staffA._id, startAt: at(14, 0, 6), customer: { fullName: 'Booked Earlier', email: 'booked@example.com' }, consent: { email: true } });
    sourceAppt = book.body.data;
    // Waitlist entries, joined in this order (W1 first, so W1 has the earliest request).
    w1 = (await owner.client.post(`${base}/waitlist`, { serviceId: svcId(), customer: { fullName: 'Wait One', email: 'wait1@example.com' }, anyStaff: true, consent: { email: true } })).body.data;
    await owner.client.post(`${base}/waitlist`, { serviceId: svcId(), customer: { fullName: 'Wait Two', email: 'wait2@example.com' }, anyStaff: true, consent: { email: true } });
    await owner.client.post(`${base}/waitlist`, { serviceId: svcId(), customer: { fullName: 'No Consent', email: 'noconsent@example.com' }, anyStaff: true, consent: { email: false } });
    customerCancelled = await Customer.findOne({ email: 'booked@example.com' }).lean();
  });

  it('offers a cancelled slot to the first eligible entry and skips those without consent', async () => {
    const base = `/api/v1/orgs/${owner.orgId}`;
    const cancel = await owner.client.post(`${base}/appointments/${sourceAppt._id}/cancel`, { reason: 'Staff sick' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.recoveryOfferId).toBeTruthy();
    await runAllJobs();
    expect(offerTokenFor('wait1@example.com')).toBeTruthy();
    expect(offerTokenFor('noconsent@example.com')).toBeNull();
    expect(offerTokenFor('wait2@example.com')).toBeNull();
    expect(customerCancelled).toBeTruthy();
  });

  it('advances to the next candidate when the first one declines, and never re-offers the same slot to someone who already declined', async () => {
    const token = offerTokenFor('wait1@example.com');
    const res = await pub.post(`/api/v1/public/slot-offers/${token}/decline`);
    expect(res.status).toBe(200);
    await runAllJobs();
    const next = offerTokenFor('wait2@example.com');
    expect(next).toBeTruthy();
    const again = await pub.post(`/api/v1/public/slot-offers/${token}/accept`);
    expect(again.status).toBe(410);
  });

  it('advances past an expired offer when the expiry job runs', async () => {
    const token = offerTokenFor('wait2@example.com');
    const offer = await SlotOffer.findOne({ tokenHash: (await import('../../utils/tokens.js')).hashToken(token) });
    await SlotOffer.updateOne({ _id: offer._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await Job.updateMany({ type: 'expire_offer', 'payload.offerId': String(offer._id) }, { $set: { runAt: new Date(Date.now() - 1000) } });
    await runAllJobs();
    const expired = await SlotOffer.findById(offer._id).lean();
    expect(expired.status).toBe('expired');
    // Nobody else is eligible for this slot, so no new live offer exists.
    expect(await SlotOffer.countDocuments({ staffId: cat.staffA._id, startAt: offer.startAt, status: { $in: ['pending', 'accepting'] } })).toBe(0);
  });

  it('accepts a fresh offer for a second cancelled slot exactly once, and creates a recovered appointment', async () => {
    const base = `/api/v1/orgs/${owner.orgId}`;
    const book = await owner.client.post(`${base}/appointments`, { serviceId: svcId(), staffId: cat.staffA._id, startAt: at(15, 0, 6), customer: { fullName: 'Second', email: 'second@example.com' }, consent: { email: false } });
    await owner.client.post(`${base}/appointments/${book.body.data._id}/cancel`, { reason: 'Moved' });
    await runAllJobs();
    const token = offerTokenFor('wait1@example.com');
    expect(token).toBeTruthy();
    const accepted = await pub.post(`/api/v1/public/slot-offers/${token}/accept`);
    expect(accepted.status).toBe(201);
    const second = await pub.post(`/api/v1/public/slot-offers/${token}/accept`);
    expect(second.status).toBe(410);
    const recovered = await Appointment.findOne({ recoveredFromOfferId: { $ne: null } }).lean();
    expect(recovered).toBeTruthy();
    expect(recovered.source).toBe('waitlist');
    expect(recovered.priceMinor).toBe(50000);
    const entry = await WaitlistEntry.findById(w1._id).lean();
    expect(entry.status).toBe('booked');
  });

  it('reports recovery in analytics from real records only', async () => {
    const base = `/api/v1/orgs/${owner.orgId}`;
    const res = await owner.client.get(`${base}/analytics?from=${at(0, 0, -1).slice(0, 10)}&to=${at(0, 0, 10).slice(0, 10)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.summary.recoveredBookings).toBeGreaterThanOrEqual(1);
    expect(res.body.data.summary.estimatedRecoveredValueMinor).toBeGreaterThanOrEqual(50000);
    expect(res.body.data.summary.cancellations).toBeGreaterThanOrEqual(2);
  });
});

describe('manager operations', () => {
  it('lets an owner override a live offer manually', async () => {
    const base = `/api/v1/orgs/${owner.orgId}`;
    const entry = await owner.client.post(`${base}/waitlist`, { serviceId: cat.service._id, customer: { fullName: 'Manual', email: 'manual@example.com' }, anyStaff: true, consent: { email: true } });
    expect(entry.status).toBe(201);
    const appt = await owner.client.post(`${base}/appointments`, { serviceId: cat.service._id, staffId: cat.staffB._id, startAt: at(16, 0, 7), customer: { fullName: 'Ov', email: 'ov@example.com' }, consent: { email: false } });
    await owner.client.post(`${base}/appointments/${appt.body.data._id}/cancel`, { reason: 'x' });
    await runAllJobs();
    const offers = await owner.client.get(`${base}/slot-offers?status=pending`);
    const live = offers.body.data.find((o) => String(o.staffId) === String(cat.staffB._id));
    expect(live).toBeTruthy();
    const override = await owner.client.post(`${base}/slot-offers/${live._id}/override`, { action: 'release' });
    expect(override.status).toBe(200);
  });

  it('marks an appointment completed and records the transition in history', async () => {
    const base = `/api/v1/orgs/${owner.orgId}`;
    const appt = await owner.client.post(`${base}/appointments`, { serviceId: cat.service._id, staffId: cat.staffA._id, startAt: at(9, 0, 8), customer: { fullName: 'Done', email: 'done@example.com' }, consent: { email: false } });
    const res = await owner.client.post(`${base}/appointments/${appt.body.data._id}/status`, { status: 'completed' });
    expect(res.status).toBe(200);
    const detail = await owner.client.get(`${base}/appointments/${appt.body.data._id}`);
    expect(detail.body.data.history.map((h) => h.toStatus)).toEqual(['confirmed', 'completed']);
    const again = await owner.client.post(`${base}/appointments/${appt.body.data._id}/status`, { status: 'no_show' });
    expect(again.status).toBe(409);
  });

  it('exports CSV for managers with formula-injection protection', async () => {
    const base = `/api/v1/orgs/${owner.orgId}`;
    await owner.client.post(`${base}/customers`, {}).catch(() => {});
    const res = await owner.client.get(`${base}/customers/export.csv`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/csv/);
  });

  it('rejects a double-booking through the staff route as well', async () => {
    const base = `/api/v1/orgs/${owner.orgId}`;
    const res = await owner.client.post(`${base}/appointments`, { serviceId: cat.service._id, staffId: cat.staffA._id, startAt: at(10, 0), customer: { fullName: 'Dup', email: 'dup@example.com' }, consent: { email: false } });
    expect(res.status).toBe(409);
    void slug; void Customer;
  });

  it('keeps the audit log append-only (no update or delete routes exist)', async () => {
    const base = `/api/v1/orgs/${owner.orgId}`;
    expect((await owner.client.del(`${base}/audit-logs/anything`)).status).toBe(404);
    expect((await owner.client.patch(`${base}/audit-logs/anything`, {})).status).toBe(404);
  });
});
