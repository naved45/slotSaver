/**
 * Seeds FICTIONAL demo data for local development. Never run against production.
 * Creates one verified owner, services, staff, hours, and a waitlist entry.
 * The demo password is printed once and must be changed after first sign-in.
 */
import mongoose from 'mongoose';
import { loadConfig } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase, syncIndexes } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import { User, Organization, Membership, Service, StaffProfile, BusinessHours, StaffAvailability } from '../src/models/index.js';
import { hashPassword } from '../src/utils/passwords.js';

const config = loadConfig();
if (config.isProduction) {
  console.error('Refusing to seed in production.');
  process.exit(1);
}
createApp(config);
await connectDatabase(config.mongoUri);
await syncIndexes();

import crypto from 'node:crypto';

const EMAIL = 'owner@example.com';
// Set SEED_OWNER_PASSWORD, or a strong random password is generated and printed once.
const PASSWORD = process.env.SEED_OWNER_PASSWORD || crypto.randomBytes(18).toString('base64url');
if (await User.exists({ email: EMAIL })) {
  console.log('Demo data already exists. Nothing changed.');
  await disconnectDatabase();
  process.exit(0);
}

const user = await User.create({
  email: EMAIL,
  passwordHash: await hashPassword(PASSWORD),
  fullName: 'Demo Owner',
  emailVerifiedAt: new Date(),
  termsAcceptedAt: new Date(),
});
const org = await Organization.create({
  name: 'Maple Dental Studio',
  slug: 'maple-dental-studio',
  businessType: 'dental',
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  ownerUserId: user._id,
});
await Membership.create({ userId: user._id, organizationId: org._id, role: 'owner' });

const cleaning = await Service.create({ organizationId: org._id, name: 'Dental cleaning', slug: 'cleaning', durationMinutes: 30, bufferMinutes: 10, priceMinor: 150000, currency: 'INR' });
const checkup = await Service.create({ organizationId: org._id, name: 'Check-up', slug: 'check-up', durationMinutes: 45, bufferMinutes: 5, priceMinor: 250000, currency: 'INR' });
const meera = await StaffProfile.create({ organizationId: org._id, displayName: 'Dr. Meera Iyer', serviceIds: [cleaning._id, checkup._id] });
const ravi = await StaffProfile.create({ organizationId: org._id, displayName: 'Dr. Ravi Kumar', serviceIds: [cleaning._id] });

const days = [1, 2, 3, 4, 5, 6];
await BusinessHours.insertMany(days.map((d) => ({ organizationId: org._id, dayOfWeek: d, openMinute: 540, closeMinute: 1080, breaks: [{ startMinute: 780, endMinute: 810 }] })));
for (const s of [meera, ravi]) {
  await StaffAvailability.insertMany(days.map((d) => ({ organizationId: org._id, staffId: s._id, dayOfWeek: d, startMinute: 540, endMinute: 1080, breaks: [] })));
}

console.log('Seeded fictional demo business "Maple Dental Studio".');
console.log(`Sign in as ${EMAIL} with the password from SEED_OWNER_PASSWORD (or this generated one: ${PASSWORD}). Change it after first sign-in.`);
await mongoose.disconnect();
