import { z } from 'zod';
import { DateTime } from 'luxon';
import mongoose from 'mongoose';
import { BUSINESS_TYPES } from '../models/Organization.js';

export const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid id');
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const isoInstant = z.iso.datetime({ offset: true }).or(z.iso.datetime());
export const timezone = z.string().refine((tz) => DateTime.local().setZone(tz).isValid, 'Unknown timezone');
export const email = z.string().trim().toLowerCase().email().max(254);
export const password = z.string().min(10, 'Use at least 10 characters').max(128);
export const minuteOfDay = z.number().int().min(0).max(1440);
export const pageParams = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const MIN_PASSWORD_BLOCKLIST = new Set(['password123', 'passwordpassword', '1234567890', 'qwertyuiop', 'letmein1234']);

export const signupSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email,
    password,
    confirmPassword: z.string(),
    businessName: z.string().trim().min(2).max(120),
    businessType: z.enum(BUSINESS_TYPES).default('other'),
    timezone,
    termsAccepted: z.literal(true, { message: 'You must accept the terms' }),
  })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirmPassword) {
      ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Passwords do not match' });
    }
    if (v.password.toLowerCase() === v.email || MIN_PASSWORD_BLOCKLIST.has(v.password.toLowerCase())) {
      ctx.addIssue({ code: 'custom', path: ['password'], message: 'Choose a less predictable password' });
    }
  });

export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
export const tokenSchema = z.object({ token: z.string().min(20).max(200) });
export const emailOnlySchema = z.object({ email });
export const resetPasswordSchema = z
  .object({ token: z.string().min(20).max(200), password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });
