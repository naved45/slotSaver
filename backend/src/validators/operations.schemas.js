import { z } from 'zod';
import { objectId, isoInstant, email, minuteOfDay, isoDate, timezone } from './schemas.js';

export const customerInput = z.object({
  fullName: z.string().trim().min(2).max(120),
  email,
  phone: z.string().trim().max(30).optional().default(''),
});

const consentInput = z.object({ email: z.boolean() }).optional();

export const publicBookingInput = z.object({
  staffId: objectId.optional(),
  startAt: isoInstant,
  customer: customerInput,
  consent: consentInput,
  idempotencyKey: z.string().min(8).max(100).regex(/^[A-Za-z0-9_-]+$/).optional(),
});

export const staffAppointmentInput = z.object({
  serviceId: objectId,
  staffId: objectId,
  startAt: isoInstant,
  customer: customerInput,
  consent: consentInput,
});

export const rescheduleInput = z.object({ startAt: isoInstant });

export const statusInput = z.object({ status: z.enum(['completed', 'no_show']) });

export const cancelInput = z.object({ reason: z.string().trim().max(300).optional().default('') });

export const availabilityQuery = z
  .object({ from: isoDate, to: isoDate, staffId: objectId.optional() })
  .refine((v) => v.to >= v.from, { message: 'to must be on or after from', path: ['to'] })
  .refine((v) => {
    const days = (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000;
    return days <= 31;
  }, { message: 'Range may be at most 31 days', path: ['to'] });

export const waitlistInput = z
  .object({
    serviceId: objectId,
    customer: customerInput,
    anyStaff: z.boolean().default(true),
    preferredStaffIds: z.array(objectId).max(20).default([]),
    dateFrom: isoDate.nullable().default(null),
    dateTo: isoDate.nullable().default(null),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    timeRanges: z
      .array(z.object({ startMinute: minuteOfDay, endMinute: minuteOfDay }).refine((r) => r.endMinute > r.startMinute, 'End must be after start'))
      .max(6)
      .default([]),
    expiresAt: isoInstant.optional(),
    consent: z.object({ email: z.boolean() }),
  })
  .refine((v) => v.anyStaff || v.preferredStaffIds.length > 0, { path: ['preferredStaffIds'], message: 'Choose a staff member or any staff' });

export const overrideInput = z.object({ action: z.enum(['expire_and_advance', 'release']) });

export const reminderSettingsInput = z.object({
  reminderOffsetsMinutes: z.array(z.number().int().min(15).max(60 * 24 * 14)).max(5),
  confirmationEmails: z.boolean(),
});

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const appointmentListQuery = pageQuery.extend({
  from: isoInstant.optional(),
  to: isoInstant.optional(),
  serviceId: objectId.optional(),
  staffId: objectId.optional(),
  status: z.enum(['requested', 'confirmed', 'completed', 'cancelled', 'no_show']).optional(),
  sort: z.enum(['asc', 'desc']).default('asc'),
});

export const analyticsQuery = z
  .object({ from: isoDate, to: isoDate })
  .refine((v) => v.to >= v.from, { path: ['to'], message: 'to must be on or after from' })
  .refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 <= 366, { path: ['to'], message: 'Range may be at most 366 days' });

export const tzQuery = z.object({ timezone: timezone.optional() });
