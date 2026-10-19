import { z } from 'zod';
import { objectId, minuteOfDay, isoInstant, timezone } from './schemas.js';

const breakRange = z
  .object({ startMinute: minuteOfDay, endMinute: minuteOfDay })
  .refine((b) => b.endMinute > b.startMinute, 'Break must end after it starts');

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,80}$/, 'Use lowercase letters, numbers and hyphens');

export const serviceInput = z.object({
  name: z.string().trim().min(2).max(120),
  slug,
  description: z.string().max(2000).default(''),
  durationMinutes: z.number().int().min(5).max(480),
  bufferMinutes: z.number().int().min(0).max(240).default(0),
  priceMinor: z.number().int().min(0).max(100_000_000).default(0),
  currency: z.string().length(3).default('INR'),
  active: z.boolean().default(true),
  leadTimeMinutes: z.number().int().min(0).max(60 * 24 * 30).default(60),
  maxAdvanceDays: z.number().int().min(1).max(730).default(60),
  cancelCutoffMinutes: z.number().int().min(0).max(60 * 24 * 30).default(120),
  mode: z.enum(['in_person', 'online']).default('in_person'),
});
export const servicePatch = serviceInput.partial();

export const businessHoursInput = z.object({
  days: z
    .array(
      z
        .object({
          dayOfWeek: z.number().int().min(0).max(6),
          openMinute: minuteOfDay,
          closeMinute: minuteOfDay,
          breaks: z.array(breakRange).default([]),
        })
        .refine((d) => d.closeMinute > d.openMinute, 'Closing time must be after opening time')
    )
    .max(7)
    .refine((days) => new Set(days.map((d) => d.dayOfWeek)).size === days.length, 'Each day may appear once'),
});

export const staffInput = z.object({
  displayName: z.string().trim().min(2).max(120),
  serviceIds: z.array(objectId).default([]),
  active: z.boolean().default(true),
});
export const staffPatch = staffInput.partial();

export const staffAvailabilityInput = z.object({
  days: z
    .array(
      z
        .object({
          dayOfWeek: z.number().int().min(0).max(6),
          startMinute: minuteOfDay,
          endMinute: minuteOfDay,
          breaks: z.array(breakRange).default([]),
        })
        .refine((d) => d.endMinute > d.startMinute, 'End must be after start')
    )
    .max(7),
});

export const closureInput = z
  .object({
    scope: z.enum(['org', 'staff']),
    staffId: objectId.nullable().default(null),
    startAt: isoInstant,
    endAt: isoInstant,
    reason: z.string().max(200).default(''),
  })
  .refine((v) => new Date(v.endAt) > new Date(v.startAt), { path: ['endAt'], message: 'End must be after start' })
  .refine((v) => v.scope === 'org' || v.staffId, { path: ['staffId'], message: 'Staff closures need a staff member' });

export const inviteInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(['admin', 'staff']),
  staffProfileId: objectId.nullable().optional(),
});

export const memberPatch = z.object({ role: z.enum(['admin', 'staff']) });

export const orgPatch = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  timezone: timezone.optional(),
  businessType: z.enum(['dental', 'salon', 'physiotherapy', 'wellness', 'consulting', 'other']).optional(),
  currency: z.string().length(3).optional(),
  bookingPolicy: z
    .object({
      cancelCutoffMinutes: z.number().int().min(0).max(60 * 24 * 14).optional(),
      slotOfferExpiryMinutes: z.number().int().min(5).max(60 * 48).optional(),
      reminderOffsetsMinutes: z.array(z.number().int().min(15).max(60 * 24 * 14)).max(5).optional(),
      confirmationEmails: z.boolean().optional(),
    })
    .optional(),
});
