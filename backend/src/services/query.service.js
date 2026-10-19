import { DateTime } from 'luxon';
import mongoose from 'mongoose';
import {
  Appointment, Customer, Service, StaffProfile, StaffAvailability, WaitlistEntry, SlotOffer,
  Notification, NotificationDelivery, AuditLog, Organization,
} from '../models/index.js';
import { ACTIVE_STATUSES } from '../models/Appointment.js';
import { AppError } from '../utils/appError.js';
import { formatWhen } from './schedule.service.js';
import { AppointmentStatusHistory } from '../models/index.js';

const oid = (id) => new mongoose.Types.ObjectId(id);

/* ---------- Appointments ---------- */

/**
 * Staff members see only their own appointments; owners and admins see all.
 * `staffProfileId` is the caller's own profile when role is staff.
 */
export async function listAppointments(orgId, q, { role, staffProfileId }) {
  const filter = { organizationId: orgId, rolledBack: { $ne: true } };
  if (role === 'staff') filter.staffId = staffProfileId ?? oid('000000000000000000000000');
  if (q.staffId) filter.staffId = q.staffId;
  if (q.serviceId) filter.serviceId = q.serviceId;
  if (q.status) filter.status = q.status;
  if (q.from || q.to) {
    filter.startAt = {};
    if (q.from) filter.startAt.$gte = new Date(q.from);
    if (q.to) filter.startAt.$lte = new Date(q.to);
  }
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 20;
  const [rows, total] = await Promise.all([
    Appointment.find(filter).sort({ startAt: q.sort === 'desc' ? -1 : 1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    Appointment.countDocuments(filter),
  ]);
  const hydrated = await hydrate(rows);
  return { items: hydrated, meta: { page, pageSize, total } };
}

/** Attaches customer, service, and staff names for list and detail views. Never guest tokens. */
export async function hydrate(rows) {
  const [customers, services, staff] = await Promise.all([
    Customer.find({ _id: { $in: rows.map((r) => r.customerId) } }).select('fullName email phone').lean(),
    Service.find({ _id: { $in: rows.map((r) => r.serviceId) } }).select('name durationMinutes').lean(),
    StaffProfile.find({ _id: { $in: rows.map((r) => r.staffId) } }).select('displayName').lean(),
  ]);
  const c = new Map(customers.map((x) => [String(x._id), x]));
  const s = new Map(services.map((x) => [String(x._id), x]));
  const st = new Map(staff.map((x) => [String(x._id), x]));
  return rows.map((r) => {
    const { guestTokenHash, guestTokenExpiresAt, activeSlotKey, idempotencyKey, __v, ...safe } = r;
    void guestTokenHash; void guestTokenExpiresAt; void activeSlotKey; void idempotencyKey; void __v;
    return { ...safe, customer: c.get(String(r.customerId)) ?? null, service: s.get(String(r.serviceId)) ?? null, staff: st.get(String(r.staffId)) ?? null };
  });
}

export async function getAppointmentDetail(orgId, id, { role, staffProfileId }) {
  const filter = { _id: id, organizationId: orgId };
  if (role === 'staff') filter.staffId = staffProfileId;
  const [appt] = await hydrate([await Appointment.findOne(filter).lean()].filter(Boolean));
  if (!appt) throw new AppError(404, 'NOT_FOUND', 'Resource not found');
  const history = await AppointmentStatusHistory.find({ organizationId: orgId, appointmentId: id }).sort({ at: 1 }).lean();
  return { ...appt, history };
}

/* ---------- Customers ---------- */

export async function listCustomers(orgId, { q, page = 1, pageSize = 20 }) {
  const filter = { organizationId: orgId };
  if (q) {
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ fullName: new RegExp(esc, 'i') }, { email: new RegExp(esc, 'i') }];
  }
  const [items, total] = await Promise.all([
    Customer.find(filter).sort({ fullName: 1 }).skip((page - 1) * pageSize).limit(pageSize).select('-notes').lean(),
    Customer.countDocuments(filter),
  ]);
  return { items, meta: { page, pageSize, total } };
}

export async function getCustomerDetail(orgId, id) {
  const customer = await Customer.findOne({ _id: id, organizationId: orgId }).lean();
  if (!customer) throw new AppError(404, 'NOT_FOUND', 'Resource not found');
  const appointments = await Appointment.find({ organizationId: orgId, customerId: id, rolledBack: { $ne: true } }).sort({ startAt: -1 }).limit(100).lean();
  const hydrated = await hydrate(appointments);
  const now = new Date();
  return {
    customer,
    upcoming: hydrated.filter((a) => ACTIVE_STATUSES.includes(a.status) && a.startAt > now),
    history: hydrated,
    cancellations: appointments.filter((a) => a.status === 'cancelled').length,
    noShows: appointments.filter((a) => a.status === 'no_show').length,
    waitlist: await WaitlistEntry.find({ organizationId: orgId, customerId: id }).lean(),
  };
}

export async function exportCustomersCsv(orgId) {
  const rows = await Customer.find({ organizationId: orgId }).sort({ fullName: 1 }).select('fullName email phone consent createdAt').lean();
  return toCsv(['name', 'email', 'phone', 'email_consent', 'created_at'], rows.map((r) => [r.fullName, r.email, r.phone, r.consent?.email ? 'yes' : 'no', r.createdAt?.toISOString()]));
}

/* ---------- Waitlist and offers ---------- */

export async function listWaitlist(orgId, { status, serviceId, page = 1, pageSize = 20 }) {
  const filter = { organizationId: orgId };
  if (status) filter.status = status;
  if (serviceId) filter.serviceId = serviceId;
  const [rows, total] = await Promise.all([
    WaitlistEntry.find(filter).sort({ requestedAt: 1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    WaitlistEntry.countDocuments(filter),
  ]);
  const customers = await Customer.find({ _id: { $in: rows.map((r) => r.customerId) } }).select('fullName email').lean();
  const services = await Service.find({ _id: { $in: rows.map((r) => r.serviceId) } }).select('name').lean();
  const c = new Map(customers.map((x) => [String(x._id), x]));
  const s = new Map(services.map((x) => [String(x._id), x]));
  return {
    items: rows.map((r) => ({ ...r, customer: c.get(String(r.customerId)) ?? null, service: s.get(String(r.serviceId)) ?? null })),
    meta: { page, pageSize, total },
  };
}

export async function listOffers(orgId, { status, page = 1, pageSize = 20 }) {
  const filter = { organizationId: orgId };
  if (status) filter.status = status;
  const [rows, total] = await Promise.all([
    SlotOffer.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).select('-tokenHash').lean(),
    SlotOffer.countDocuments(filter),
  ]);
  return { items: rows, meta: { page, pageSize, total } };
}

/* ---------- Notifications and reminder settings ---------- */

export async function listNotifications(orgId, { status, page = 1, pageSize = 20 }) {
  const filter = { organizationId: orgId };
  if (status) filter.status = status;
  const [rows, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).select('-payload').lean(),
    Notification.countDocuments(filter),
  ]);
  const counts = await Notification.aggregate([
    { $match: { organizationId: oid(orgId) } },
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ]);
  return { items: rows, meta: { page, pageSize, total }, counts: Object.fromEntries(counts.map((c) => [c._id, c.n])) };
}

export async function listDeliveries(orgId, { page = 1, pageSize = 50 }) {
  const rows = await NotificationDelivery.find({ organizationId: orgId }).sort({ at: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean();
  return { items: rows, meta: { page, pageSize } };
}

/* ---------- Audit ---------- */

export async function listAudit(orgId, { action, from, to, page = 1, pageSize = 50 }) {
  const filter = { organizationId: orgId };
  if (action) filter.action = new RegExp(`^${action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  if (from || to) {
    filter.at = {};
    if (from) filter.at.$gte = new Date(from);
    if (to) filter.at.$lte = new Date(to);
  }
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ at: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    AuditLog.countDocuments(filter),
  ]);
  return { items, meta: { page, pageSize, total } };
}

/* ---------- Dashboard and analytics ---------- */

/**
 * Metric definitions (also documented in docs/PRD and docs/API):
 *  - Bookings: appointments starting in the period, excluding rolled-back records.
 *  - Cancellation rate = cancelled (by cancelledAt in period) / bookings in period.
 *  - No-show rate = no_show / (completed + no_show) in period (appointments that reached their time).
 *  - Recovered booking = appointment created by accepting a waitlist slot offer.
 *  - Estimated recovered revenue = sum of priceMinor of recovered bookings that are not cancelled.
 *    This is an estimate of booked value, not collected revenue (no payments are implemented).
 *  - Offer acceptance rate = accepted / (accepted + declined + expired) offers created in period.
 *  - Time to rebook = recovered booking createdAt minus the cancelled source appointment's cancelledAt.
 *  - Staff utilization = booked minutes (active, completed, no-show) / working minutes
 *    (weekly hours minus breaks, per date in range). Closures are not deducted (documented limitation).
 */
export async function computeAnalytics(orgId, { from, to, timezone }) {
  const fromD = DateTime.fromISO(from, { zone: timezone }).startOf('day').toJSDate();
  const toD = DateTime.fromISO(to, { zone: timezone }).endOf('day').toJSDate();
  const oid_ = oid(orgId);

  // Bounded projection: only the fields metrics need. Metrics are computed in code, which keeps
  // the same definitions on MongoDB and on MongoDB-compatible servers with a limited $group.
  const LIMIT = 50_000;
  const appts = await Appointment.find({
    organizationId: oid_,
    rolledBack: { $ne: true },
    $or: [{ startAt: { $gte: fromD, $lte: toD } }, { cancelledAt: { $gte: fromD, $lte: toD } }],
  })
    .select('status startAt cancelledAt recoveredFromOfferId priceMinor serviceId staffId endAt createdAt')
    .limit(LIMIT)
    .lean();
  const inStart = appts.filter((a) => a.startAt >= fromD && a.startAt <= toD);
  const recovered = inStart.filter((a) => a.recoveredFromOfferId && a.status !== 'cancelled');

  const cancelled = appts.filter((a) => a.cancelledAt && a.cancelledAt >= fromD && a.cancelledAt <= toD).length;
  const completed = inStart.filter((a) => a.status === 'completed').length;
  const noShows = inStart.filter((a) => a.status === 'no_show').length;
  const recoveredValue = recovered.reduce((sum, a) => sum + (a.priceMinor || 0), 0);

  const offers = await SlotOffer.find({ organizationId: oid_, createdAt: { $gte: fromD, $lte: toD } })
    .select('status sourceAppointmentId createdAt resultAppointmentId').limit(LIMIT).lean();
  const oc = {};
  for (const o of offers) oc[o.status] = (oc[o.status] ?? 0) + 1;
  const offerDenom = (oc.accepted ?? 0) + (oc.declined ?? 0) + (oc.expired ?? 0);

  // Time from cancellation to successful rebooking, for recovered bookings only.
  const sourceIds = offers.filter((o) => o.status === 'accepted' && o.sourceAppointmentId).map((o) => o.sourceAppointmentId);
  const sources = await Appointment.find({ _id: { $in: sourceIds } }).select('cancelledAt').lean();
  const cancelledAtBy = new Map(sources.map((s) => [String(s._id), s.cancelledAt]));
  const rebookMinutes = recovered
    .map((a) => {
      const acc = offers.find((o) => String(o.resultAppointmentId) === String(a._id));
      const cancelAt = acc && cancelledAtBy.get(String(acc.sourceAppointmentId));
      return cancelAt ? (a.createdAt - cancelAt) / 60_000 : null;
    })
    .filter((m) => m !== null && m >= 0);
  const avgMinutesToRebook = rebookMinutes.length ? Math.round(rebookMinutes.reduce((a, b) => a + b, 0) / rebookMinutes.length) : null;

  const countBy = (list, keyFn) => {
    const m = new Map();
    for (const item of list) {
      const k = keyFn(item);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };

  const dailyMap = new Map();
  for (const a of inStart) {
    const d = DateTime.fromJSDate(a.startAt, { zone: timezone }).toISODate();
    const row = dailyMap.get(d) ?? { date: d, bookings: 0, recovered: 0, noShows: 0 };
    row.bookings += 1;
    if (a.recoveredFromOfferId) row.recovered += 1;
    if (a.status === 'no_show') row.noShows += 1;
    dailyMap.set(d, row);
  }
  const daily = [...dailyMap.values()].sort((x, y) => (x.date < y.date ? -1 : 1));

  const serviceCounts = countBy(inStart.filter((a) => a.status !== 'cancelled'), (a) => String(a.serviceId));
  const topIds = [...serviceCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const serviceNames = new Map((await Service.find({ _id: { $in: topIds.map(([id]) => id) } }).select('name').lean()).map((s) => [String(s._id), s.name]));
  const topServices = topIds.map(([id, n]) => ({ name: serviceNames.get(id) ?? 'Unknown service', bookings: n }));

  const hourCounts = countBy(inStart.filter((a) => a.status !== 'cancelled'), (a) => DateTime.fromJSDate(a.startAt, { zone: timezone }).hour);
  const peakHours = [...hourCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([hour, n]) => ({ hour, bookings: n }));

  const notifs = await Notification.find({ organizationId: oid_, createdAt: { $gte: fromD, $lte: toD } }).select('status').limit(LIMIT).lean();
  const nc = countBy(notifs, (n) => n.status);
  const attempted = (nc.get('sent') ?? 0) + (nc.get('logged_dev') ?? 0) + (nc.get('failed') ?? 0);

  const bookingsCount = inStart.length;
  return {
    definitions: 'See API.md "Analytics" for metric definitions.',
    period: { from, to, timezone },
    summary: {
      bookings: bookingsCount,
      completed,
      noShows,
      cancellations: cancelled,
      cancellationRate: bookingsCount ? round(cancelled / bookingsCount) : null,
      noShowRate: completed + noShows ? round(noShows / (completed + noShows)) : null,
      recoveredBookings: recovered.length,
      estimatedRecoveredValueMinor: recoveredValue,
      offerAcceptanceRate: offerDenom ? round((oc.accepted ?? 0) / offerDenom) : null,
      offersCreated: offers.length,
      avgMinutesToRebook,
      reminderFailureRate: attempted ? round((nc.get('failed') ?? 0) / attempted) : null,
      remindersSent: nc.get('sent') ?? 0,
      remindersLoggedDev: nc.get('logged_dev') ?? 0,
    },
    daily,
    topServices,
    peakHours,
    staffUtilization: await staffUtilization(orgId, { from: fromD, to: toD, timezone, appts: inStart }),
    truncated: appts.length >= LIMIT,
  };
}

async function staffUtilization(orgId, { from, to, timezone, appts }) {
  const staff = await StaffProfile.find({ organizationId: oid(orgId), active: true }).select('displayName').lean();
  const weekly = await StaffAvailability.find({ organizationId: oid(orgId) }).lean();
  const bookedBy = new Map();
  for (const a of appts) {
    if (!ACTIVE_STATUSES.includes(a.status) && a.status !== 'completed' && a.status !== 'no_show') continue;
    const k = String(a.staffId);
    bookedBy.set(k, (bookedBy.get(k) ?? 0) + (a.endAt - a.startAt) / 60_000);
  }
  const startDay = DateTime.fromJSDate(from, { zone: timezone }).startOf('day');
  const endDay = DateTime.fromJSDate(to, { zone: timezone }).startOf('day');
  return staff.map((s) => {
    const windows = weekly.filter((w) => String(w.staffId) === String(s._id));
    let available = 0;
    for (let d = startDay; d <= endDay; d = d.plus({ days: 1 })) {
      const dow = d.weekday % 7;
      for (const w of windows.filter((x) => x.dayOfWeek === dow)) {
        const breaks = (w.breaks ?? []).reduce((acc, br) => acc + Math.max(0, br.endMinute - br.startMinute), 0);
        available += Math.max(0, w.endMinute - w.startMinute - breaks);
      }
    }
    const used = bookedBy.get(String(s._id)) ?? 0;
    return { staffId: s._id, name: s.displayName, bookedMinutes: Math.round(used), availableMinutes: available, utilization: available ? round(used / available) : null };
  });
}

export async function dashboard(orgId, timezone) {
  const now = new Date();
  const org = await Organization.findById(orgId).lean();
  const todayStart = DateTime.now().setZone(timezone).startOf('day').toJSDate();
  const todayEnd = DateTime.now().setZone(timezone).endOf('day').toJSDate();
  const weekEnd = addDaysDate(now, 7);
  const base = { organizationId: oid(orgId), rolledBack: { $ne: true } };
  const [today, upcoming, waitlistActive, openOffers, recent] = await Promise.all([
    Appointment.countDocuments({ ...base, startAt: { $gte: todayStart, $lte: todayEnd }, status: { $ne: 'cancelled' } }),
    Appointment.find({ ...base, startAt: { $gte: now, $lte: weekEnd }, status: { $in: ACTIVE_STATUSES } }).sort({ startAt: 1 }).limit(10).lean(),
    WaitlistEntry.countDocuments({ organizationId: oid(orgId), status: 'active' }),
    SlotOffer.countDocuments({ organizationId: oid(orgId), status: { $in: ['pending', 'accepting'] } }),
    AuditLog.find({ organizationId: oid(orgId) }).sort({ at: -1 }).limit(8).select('action resourceType at').lean(),
  ]);
  const analytics = await computeAnalytics(orgId, {
    from: DateTime.now().setZone(timezone).minus({ days: 29 }).toISODate(),
    to: DateTime.now().setZone(timezone).toISODate(),
    timezone,
  });
  const hydratedUpcoming = await hydrate(upcoming);
  return {
    organization: { name: org.name, timezone: org.timezone },
    today: { appointments: today },
    upcoming: hydratedUpcoming.map((a) => ({ id: a._id, startText: formatWhen(a.startAt, timezone), customer: a.customer?.fullName, service: a.service?.name, staff: a.staff?.displayName, status: a.status })),
    waitlist: { active: waitlistActive, openOffers },
    last30Days: analytics.summary,
    recentActivity: recent,
  };
}

/* ---------- CSV helpers ---------- */

export function toCsv(headers, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    // Prevent spreadsheet formula injection in exported cells.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n') + '\n';
}

export async function exportAppointmentsCsv(orgId, { from, to, timezone }) {
  const filter = { organizationId: orgId, rolledBack: { $ne: true } };
  filter.startAt = { $gte: new Date(from), $lte: new Date(to) };
  const rows = await Appointment.find(filter).sort({ startAt: 1 }).limit(10000).lean();
  const hydrated = await hydrate(rows);
  return toCsv(
    ['start_local', 'service', 'staff', 'customer', 'status', 'price_minor', 'currency', 'source'],
    hydrated.map((a) => [
      formatWhen(a.startAt, timezone), a.service?.name, a.staff?.displayName, a.customer?.fullName, a.status, a.priceMinor, a.currency, a.source,
    ])
  );
}

function round(x) {
  return Math.round(x * 1000) / 1000;
}
function addDaysDate(d, n) {
  return new Date(d.getTime() + n * 86_400_000);
}

