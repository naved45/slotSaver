/**
 * Pure availability engine. No database access, so the rules can be unit-tested
 * exactly. All instants are JS Date objects (UTC). Local dates are 'YYYY-MM-DD'
 * interpreted in the organization's IANA timezone.
 *
 * Occupancy model: an appointment occupies [start, start + duration + buffer).
 * Existing busy intervals passed in are already stored with their buffer included.
 * A candidate slot must fit entirely inside the staff working window
 * (start + duration <= window end), must not overlap breaks, closures, or busy
 * intervals, and must respect lead time and maximum advance booking.
 */
import { DateTime } from 'luxon';

const MS_PER_MIN = 60_000;

/** Convert a local date + minute-of-day in a timezone to a UTC Date. */
export function localMinuteToUtc(dateStr, minuteOfDay, timezone) {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const dt = DateTime.fromISO(dateStr, { zone: timezone }).set({ hour, minute, second: 0, millisecond: 0 });
  if (!dt.isValid) throw new Error(`Invalid local time ${dateStr} ${minuteOfDay} in ${timezone}`);
  return dt.toUTC().toJSDate();
}

/** Day of week (0 = Sunday ... 6 = Saturday) for a local date string. */
export function dayOfWeekFor(dateStr, timezone) {
  const dt = DateTime.fromISO(dateStr, { zone: timezone });
  return dt.weekday % 7; // luxon: Monday=1 ... Sunday=7
}

/** Enumerate local date strings from `from` to `to` inclusive. */
export function enumerateDates(from, to, timezone) {
  const out = [];
  let cur = DateTime.fromISO(from, { zone: timezone }).startOf('day');
  const end = DateTime.fromISO(to, { zone: timezone }).startOf('day');
  if (!cur.isValid || !end.isValid) throw new Error('Invalid date range');
  while (cur <= end) {
    out.push(cur.toISODate());
    cur = cur.plus({ days: 1 });
  }
  return out;
}

/** Interval overlap for half-open intervals [aStart,aEnd) and [bStart,bEnd). */
export function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * @param {object} input
 * @param {string} input.timezone            organization IANA timezone
 * @param {string} input.from                'YYYY-MM-DD' local
 * @param {string} input.to                  'YYYY-MM-DD' local
 * @param {Array}  input.businessHours       [{ dayOfWeek, openMinute, closeMinute, breaks?: [{startMinute,endMinute}] }]
 * @param {Array}  input.staffAvailability   [{ dayOfWeek, startMinute, endMinute, breaks?: [...] }]
 * @param {Array}  input.closures            [{ startAt: Date, endAt: Date }] org-wide or staff-specific, already filtered
 * @param {Array}  input.busy                [{ startAt: Date, endAt: Date }] existing appointments/holds (buffer included)
 * @param {number} input.durationMinutes
 * @param {number} input.bufferMinutes       buffer after each appointment, default 0
 * @param {number} input.stepMinutes         slot grid, default 15
 * @param {number} input.leadTimeMinutes     minimum notice before start
 * @param {number} input.maxAdvanceDays      how far ahead bookings may be made
 * @param {Date}   input.now
 * @returns {Array<{ date: string, slots: Array<{ startAt: Date, endAt: Date }> }>}
 */
export function generateAvailability(input) {
  const {
    timezone,
    from,
    to,
    businessHours = [],
    staffAvailability = [],
    closures = [],
    busy = [],
    durationMinutes,
    bufferMinutes = 0,
    stepMinutes = 15,
    leadTimeMinutes = 0,
    maxAdvanceDays = 60,
    now = new Date(),
  } = input;

  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    throw new Error('durationMinutes must be a positive integer');
  }
  const durMs = durationMinutes * MS_PER_MIN;
  const occMs = (durationMinutes + bufferMinutes) * MS_PER_MIN;
  const stepMs = stepMinutes * MS_PER_MIN;
  const earliest = new Date(now.getTime() + leadTimeMinutes * MS_PER_MIN);
  const latest = new Date(now.getTime() + maxAdvanceDays * 24 * 60 * MS_PER_MIN);

  const days = [];
  for (const date of enumerateDates(from, to, timezone)) {
    const dow = dayOfWeekFor(date, timezone);
    const biz = businessHours.find((h) => h.dayOfWeek === dow);
    const staff = staffAvailability.find((h) => h.dayOfWeek === dow);
    const slots = [];

    if (biz && staff) {
      // Working window is the intersection of business hours and staff hours.
      const openMin = Math.max(biz.openMinute, staff.startMinute);
      const closeMin = Math.min(biz.closeMinute, staff.endMinute);

      if (closeMin > openMin) {
        const windowStartMs = localMinuteToUtc(date, openMin, timezone).getTime();
        const windowEndMs = localMinuteToUtc(date, closeMin, timezone).getTime();

        const blocked = [
          ...(biz.breaks ?? []).map((b) => ({
            startAt: localMinuteToUtc(date, b.startMinute, timezone),
            endAt: localMinuteToUtc(date, b.endMinute, timezone),
          })),
          ...(staff.breaks ?? []).map((b) => ({
            startAt: localMinuteToUtc(date, b.startMinute, timezone),
            endAt: localMinuteToUtc(date, b.endMinute, timezone),
          })),
          ...closures,
          ...busy,
        ];

        for (let t = windowStartMs; t + durMs <= windowEndMs; t += stepMs) {
          const start = new Date(t);
          if (start < earliest || start > latest) continue;

          const occStart = start;
          const occEnd = new Date(t + occMs);
          const conflict = blocked.some((b) => intervalsOverlap(occStart, occEnd, b.startAt, b.endAt));
          if (!conflict) slots.push({ startAt: start, endAt: new Date(t + durMs) });
        }
      }
    }
    days.push({ date, slots });
  }
  return days;
}
