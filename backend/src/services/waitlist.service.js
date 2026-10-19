/**
 * Pure waitlist eligibility and ranking. Given a freed slot, returns eligible
 * waitlist entries in offer order. Transparent rules:
 *   1. Entry must be active, unexpired, for the same service, with email consent.
 *   2. Staff must be eligible (anyStaff, or the staff is in preferredStaffIds).
 *   3. Slot's local date must be within dateFrom..dateTo, on an allowed weekday,
 *      and its local start time must fall inside one of timeRanges (if any given).
 *   4. Ranking: preferred-staff match first, then narrower time-range match,
 *      then oldest request first (fairness), then id for a stable tie-break.
 */
import { DateTime } from 'luxon';

function localPartsOf(startAt, timezone) {
  const dt = DateTime.fromJSDate(startAt, { zone: timezone });
  return {
    date: dt.toISODate(),
    weekday: dt.weekday % 7,
    minuteOfDay: dt.hour * 60 + dt.minute,
  };
}

/** Returns { eligible, reason, score } for one entry. */
export function evaluateEntry(entry, slot, timezone, now = new Date()) {
  if (entry.status !== 'active') return { eligible: false, reason: 'inactive' };
  if (entry.expiresAt && new Date(entry.expiresAt) <= now) return { eligible: false, reason: 'expired' };
  if (String(entry.serviceId) !== String(slot.serviceId)) return { eligible: false, reason: 'service' };
  if (!entry.consent?.email) return { eligible: false, reason: 'no_consent' };

  const preferred = (entry.preferredStaffIds ?? []).map(String);
  const staffMatch = entry.anyStaff || preferred.includes(String(slot.staffId));
  if (!staffMatch) return { eligible: false, reason: 'staff' };

  const local = localPartsOf(slot.startAt, timezone);
  if (entry.dateFrom && local.date < entry.dateFrom) return { eligible: false, reason: 'before_range' };
  if (entry.dateTo && local.date > entry.dateTo) return { eligible: false, reason: 'after_range' };
  if (entry.daysOfWeek?.length && !entry.daysOfWeek.includes(local.weekday)) {
    return { eligible: false, reason: 'weekday' };
  }

  let timeScore = 0;
  if (entry.timeRanges?.length) {
    const hit = entry.timeRanges.find((r) => local.minuteOfDay >= r.startMinute && local.minuteOfDay < r.endMinute);
    if (!hit) return { eligible: false, reason: 'time' };
    // Narrower windows are more specific, so they score higher (range 1..2).
    timeScore = 1 + Math.max(0, 1 - (hit.endMinute - hit.startMinute) / (24 * 60));
  }

  const staffScore = entry.anyStaff ? 0 : 2;
  return { eligible: true, reason: null, score: staffScore + timeScore };
}

/** @returns {Array<{ entry, score }>} eligible entries sorted best-first. */
export function rankWaitlistCandidates(entries, slot, timezone, now = new Date()) {
  const ranked = [];
  for (const entry of entries) {
    const result = evaluateEntry(entry, slot, timezone, now);
    if (result.eligible) ranked.push({ entry, score: result.score });
  }
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ta = new Date(a.entry.requestedAt).getTime();
    const tb = new Date(b.entry.requestedAt).getTime();
    if (ta !== tb) return ta - tb;
    return String(a.entry._id ?? '').localeCompare(String(b.entry._id ?? ''));
  });
  return ranked;
}
