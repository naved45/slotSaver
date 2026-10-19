import crypto from 'node:crypto';
import { Organization, Membership } from '../models/index.js';

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'business';

/** Creates an organization and its owner membership. Retries slug collisions. */
export async function createOrganizationForOwner({ name, businessType, timezone, ownerUserId }) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = `${slugify(name)}-${crypto.randomBytes(3).toString('hex')}`;
    try {
      const org = await Organization.create({ name, slug, businessType, timezone, ownerUserId });
      await Membership.create({ userId: ownerUserId, organizationId: org._id, role: 'owner' });
      return org;
    } catch (err) {
      lastErr = err;
      if (err?.code !== 11000) throw err;
    }
  }
  throw lastErr;
}
