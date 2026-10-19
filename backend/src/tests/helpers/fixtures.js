import { DateTime } from 'luxon';
import { client } from './testApp.js';
import { devOutbox } from '../../services/email/outbox.js';
import { runOnce } from '../../jobs/worker.js';

export const TZ = 'Asia/Kolkata';

/** ISO instant for a local wall-clock time `daysAhead` days from now in the org timezone. */
export function at(hour, minute = 0, daysAhead = 3) {
  return DateTime.now().setZone(TZ).plus({ days: daysAhead }).set({ hour, minute, second: 0, millisecond: 0 }).toUTC().toISO();
}

/** Runs the job worker until nothing is due. Emails are only "sent" by jobs, so tests call this. */
export async function runAllJobs(limit = 200) {
  let n = 0;
  while (n < limit && (await runOnce())) n += 1;
  return n;
}

export function tokenFromOutbox(to, subjectPart, pattern) {
  const entry = devOutbox.find(to, subjectPart);
  const m = entry?.text.match(pattern);
  return m?.[1] ?? null;
}

export const manageTokenFor = (to, subjectPart = '') =>
  tokenFromOutbox(to, subjectPart, /manage\/([A-Za-z0-9_-]+)/);
export const offerTokenFor = (to, subjectPart = 'slot opened') =>
  tokenFromOutbox(to, subjectPart, /offers\/([A-Za-z0-9_-]+)/);

/** Signs up, verifies, and logs in an owner. Returns their client and organization id. */
export async function createOwner(base, { email, businessName, password = 'correct-horse-battery' }) {
  const anon = client(base);
  await anon.post('/api/v1/auth/signup', {
    fullName: 'Owner ' + businessName,
    email,
    password,
    confirmPassword: password,
    businessName,
    businessType: 'dental',
    timezone: TZ,
    termsAccepted: true,
  });
  const token = tokenFromOutbox(email, 'Verify', /token=([A-Za-z0-9_-]+)/);
  await anon.post('/api/v1/auth/verify-email', { token });
  const c = client(base);
  const login = await c.post('/api/v1/auth/login', { email, password });
  const orgId = login.body.data.memberships[0].organizationId;
  return { client: c, orgId, email };
}

/** Standard catalog: one 30-minute service with a 10-minute buffer, two staff, 09:00–18:00 daily. */
export async function setupCatalog(owner) {
  const base = `/api/v1/orgs/${owner.orgId}`;
  const svc = await owner.client.post(`${base}/services`, {
    name: 'Cleaning', slug: 'cleaning', durationMinutes: 30, bufferMinutes: 10, priceMinor: 50000, currency: 'INR',
    leadTimeMinutes: 60, maxAdvanceDays: 60, cancelCutoffMinutes: 120,
  });
  if (svc.status !== 201) throw new Error('service setup failed: ' + JSON.stringify(svc.body));
  const days = [0, 1, 2, 3, 4, 5, 6];
  const hours = await owner.client.put(`${base}/business-hours`, {
    days: days.map((d) => ({ dayOfWeek: d, openMinute: 540, closeMinute: 1080, breaks: [] })),
  });
  if (hours.status !== 200) throw new Error('hours setup failed: ' + JSON.stringify(hours.body));
  const staffA = (await owner.client.post(`${base}/staff`, { displayName: 'Dr. Meera', serviceIds: [svc.body.data._id] })).body.data;
  const staffB = (await owner.client.post(`${base}/staff`, { displayName: 'Dr. Ravi', serviceIds: [svc.body.data._id] })).body.data;
  for (const s of [staffA, staffB]) {
    const av = await owner.client.put(`${base}/staff/${s._id}/availability`, {
      days: days.map((d) => ({ dayOfWeek: d, startMinute: 540, endMinute: 1080, breaks: [] })),
    });
    if (av.status !== 200) throw new Error('availability setup failed: ' + JSON.stringify(av.body));
  }
  return { service: svc.body.data, staffA, staffB, base };
}
