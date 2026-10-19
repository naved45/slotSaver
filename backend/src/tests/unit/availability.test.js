import { describe, it, expect } from 'vitest';
import { generateAvailability, localMinuteToUtc } from '../../services/availability.service.js';

// 2026-10-19 is a Monday (dayOfWeek 1). 2026-03-08 is a Sunday (dayOfWeek 0).
const NOW = new Date('2026-01-01T00:00:00Z');
const hoursMon = [{ dayOfWeek: 1, openMinute: 540, closeMinute: 720 }]; // 09:00-12:00
const staffMon = [{ dayOfWeek: 1, startMinute: 540, endMinute: 720 }];
const base = {
  timezone: 'Asia/Kolkata',
  from: '2026-10-19',
  to: '2026-10-19',
  businessHours: hoursMon,
  staffAvailability: staffMon,
  durationMinutes: 30,
  stepMinutes: 30,
  now: NOW,
  maxAdvanceDays: 3650,
};
const starts = (result) => result[0].slots.map((s) => s.startAt.toISOString());

describe('availability engine', () => {
  it('generates slots on the grid in the organization timezone (IST = UTC+5:30)', () => {
    const slots = generateAvailability(base)[0].slots;
    expect(slots).toHaveLength(6); // 09:00..11:30
    expect(slots[0].startAt.toISOString()).toBe('2026-10-19T03:30:00.000Z');
  });

  it('respects existing busy intervals including buffer', () => {
    // Existing booking 09:00-09:45 IST (stored with buffer) = 03:30Z-04:15Z
    const busy = [{ startAt: new Date('2026-10-19T03:30:00Z'), endAt: new Date('2026-10-19T04:15:00Z') }];
    const out = starts(generateAvailability({ ...base, busy }));
    expect(out[0]).toBe('2026-10-19T04:30:00.000Z'); // 10:00 IST
    expect(out).toHaveLength(4); // 10:00, 10:30, 11:00, 11:30
  });

  it('applies a buffer after each appointment when computing conflicts', () => {
    // 30 min service + 15 min buffer. Candidate 09:00 with occupancy until 09:45 conflicts with
    // a busy block starting 09:30 IST; candidate 09:30 conflicts too.
    const busy = [{ startAt: new Date('2026-10-19T04:00:00Z'), endAt: new Date('2026-10-19T04:30:00Z') }]; // 09:30-10:00 IST
    const slots = generateAvailability({ ...base, busy, bufferMinutes: 15 })[0].slots.map((s) => s.startAt.toISOString());
    expect(slots).not.toContain('2026-10-19T03:30:00.000Z'); // 09:00
    expect(slots).not.toContain('2026-10-19T04:00:00.000Z'); // 09:30 overlaps busy
    expect(slots).toContain('2026-10-19T04:30:00.000Z'); // 10:00 is free
  });

  it('excludes business breaks', () => {
    const businessHours = [{ dayOfWeek: 1, openMinute: 540, closeMinute: 720, breaks: [{ startMinute: 600, endMinute: 630 }] }];
    const out = starts(generateAvailability({ ...base, businessHours }));
    expect(out).toHaveLength(5);
    expect(out).not.toContain('2026-10-19T04:30:00.000Z'); // 10:00 IST is inside the break
  });

  it('intersects business hours with staff hours', () => {
    const staffAvailability = [{ dayOfWeek: 1, startMinute: 600, endMinute: 660 }]; // 10:00-11:00
    const slots = generateAvailability({ ...base, staffAvailability })[0].slots;
    expect(slots).toHaveLength(2);
    expect(slots[0].startAt.toISOString()).toBe('2026-10-19T04:30:00.000Z');
  });

  it('removes slots covered by closures', () => {
    const closures = [{ startAt: new Date('2026-10-19T04:30:00Z'), endAt: new Date('2026-10-19T05:30:00Z') }]; // 10:00-11:00 IST
    expect(starts(generateAvailability({ ...base, closures }))).toHaveLength(4);
  });

  it('enforces lead time', () => {
    const now = new Date('2026-10-19T03:45:00Z'); // 09:15 IST
    const out = starts(generateAvailability({ ...base, now, leadTimeMinutes: 60 })); // earliest 10:15 IST
    // 10:00 is too soon; 10:30, 11:00, 11:30 are allowed
    expect(out).toEqual(['2026-10-19T05:00:00.000Z', '2026-10-19T05:30:00.000Z', '2026-10-19T06:00:00.000Z']);
  });

  it('returns no slots for a closed day', () => {
    const out = generateAvailability({ ...base, businessHours: [] });
    expect(out[0].slots).toEqual([]);
  });

  it('keeps wall-clock hours correct across a DST change (America/New_York)', () => {
    const result = generateAvailability({
      timezone: 'America/New_York',
      from: '2026-03-08',
      to: '2026-03-08',
      businessHours: [{ dayOfWeek: 0, openMinute: 540, closeMinute: 600 }],
      staffAvailability: [{ dayOfWeek: 0, startMinute: 540, endMinute: 600 }],
      durationMinutes: 30,
      stepMinutes: 30,
      now: NOW,
      maxAdvanceDays: 3650,
    });
    // 09:00 EDT (after DST starts) is 13:00 UTC, not 14:00 UTC.
    expect(result[0].slots[0].startAt.toISOString()).toBe('2026-03-08T13:00:00.000Z');
  });

  it('localMinuteToUtc converts a local time correctly', () => {
    expect(localMinuteToUtc('2026-10-19', 540, 'Asia/Kolkata').toISOString()).toBe('2026-10-19T03:30:00.000Z');
  });

  it('rejects non-positive durations', () => {
    expect(() => generateAvailability({ ...base, durationMinutes: 0 })).toThrow();
  });
});
