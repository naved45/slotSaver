import { describe, it, expect } from 'vitest';
import { evaluateEntry, rankWaitlistCandidates } from '../../services/waitlist.service.js';

const TZ = 'Asia/Kolkata';
const NOW = new Date('2026-10-18T00:00:00Z');
// Slot: Monday 2026-10-19 10:00 IST = 04:30Z, staff "s1", service "svc"
const slot = { serviceId: 'svc', staffId: 's1', startAt: new Date('2026-10-19T04:30:00Z') };

const make = (overrides = {}) => ({
  _id: overrides._id ?? 'e' + Math.random().toString(36).slice(2, 6),
  status: 'active',
  serviceId: 'svc',
  anyStaff: true,
  preferredStaffIds: [],
  consent: { email: true },
  requestedAt: new Date('2026-10-01T00:00:00Z'),
  expiresAt: new Date('2026-12-31T00:00:00Z'),
  daysOfWeek: [],
  timeRanges: [],
  ...overrides,
});

describe('waitlist eligibility', () => {
  it('accepts a matching entry', () => {
    expect(evaluateEntry(make(), slot, TZ, NOW).eligible).toBe(true);
  });

  it('skips inactive, expired, wrong-service, and no-consent entries', () => {
    expect(evaluateEntry(make({ status: 'booked' }), slot, TZ, NOW).reason).toBe('inactive');
    expect(evaluateEntry(make({ expiresAt: new Date('2026-10-10T00:00:00Z') }), slot, TZ, NOW).reason).toBe('expired');
    expect(evaluateEntry(make({ serviceId: 'other' }), slot, TZ, NOW).reason).toBe('service');
    expect(evaluateEntry(make({ consent: { email: false } }), slot, TZ, NOW).reason).toBe('no_consent');
  });

  it('checks staff eligibility', () => {
    expect(evaluateEntry(make({ anyStaff: false, preferredStaffIds: ['s2'] }), slot, TZ, NOW).reason).toBe('staff');
    expect(evaluateEntry(make({ anyStaff: false, preferredStaffIds: ['s1'] }), slot, TZ, NOW).eligible).toBe(true);
  });

  it('checks date range, weekday, and time preferences in the org timezone', () => {
    expect(evaluateEntry(make({ dateTo: '2026-10-18' }), slot, TZ, NOW).reason).toBe('after_range');
    expect(evaluateEntry(make({ daysOfWeek: [0, 6] }), slot, TZ, NOW).reason).toBe('weekday');
    // 10:00 IST is 600 minutes. Window 09:00-11:00 includes it; 14:00-16:00 does not.
    expect(evaluateEntry(make({ timeRanges: [{ startMinute: 540, endMinute: 660 }] }), slot, TZ, NOW).eligible).toBe(true);
    expect(evaluateEntry(make({ timeRanges: [{ startMinute: 840, endMinute: 960 }] }), slot, TZ, NOW).reason).toBe('time');
  });
});

describe('waitlist ranking', () => {
  it('ranks preferred-staff matches above an earlier any-staff request', () => {
    const early = make({ _id: 'early-any', requestedAt: new Date('2026-10-01T00:00:00Z') });
    const preferred = make({ _id: 'late-pref', anyStaff: false, preferredStaffIds: ['s1'], requestedAt: new Date('2026-10-10T00:00:00Z') });
    const ranked = rankWaitlistCandidates([early, preferred], slot, TZ, NOW);
    expect(ranked[0].entry._id).toBe('late-pref');
  });

  it('breaks ties by oldest request (fairness)', () => {
    const a = make({ _id: 'a', requestedAt: new Date('2026-10-05T00:00:00Z') });
    const b = make({ _id: 'b', requestedAt: new Date('2026-10-02T00:00:00Z') });
    const ranked = rankWaitlistCandidates([a, b], slot, TZ, NOW);
    expect(ranked.map((r) => r.entry._id)).toEqual(['b', 'a']);
  });

  it('excludes ineligible entries entirely', () => {
    const ok = make({ _id: 'ok' });
    const bad = make({ _id: 'bad', consent: { email: false } });
    expect(rankWaitlistCandidates([bad, ok], slot, TZ, NOW).map((r) => r.entry._id)).toEqual(['ok']);
  });
});
