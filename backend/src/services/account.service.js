import crypto from 'node:crypto';
import { User, Session, OneTimeToken, Membership, Organization, AuditLog } from '../models/index.js';
import { verifyPassword } from '../utils/passwords.js';
import { AppError } from '../utils/appError.js';
import { recordAudit } from './audit.service.js';

/**
 * Personal data export (access/portability). Includes the user's profile, memberships, and the
 * audit entries they performed. Never includes password hashes, tokens, or session secrets.
 */
export async function exportAccount(user) {
  const memberships = await Membership.find({ userId: user._id }).lean();
  const orgs = await Organization.find({ _id: { $in: memberships.map((m) => m.organizationId) } }).select('name slug timezone').lean();
  const byId = new Map(orgs.map((o) => [String(o._id), o]));
  const audit = await AuditLog.find({ actorUserId: user._id }).sort({ at: -1 }).limit(1000).select('action resourceType resourceId at organizationId').lean();
  const sessions = await Session.countDocuments({ userId: user._id, revokedAt: null });
  return {
    exportedAt: new Date().toISOString(),
    profile: { email: user.email, fullName: user.fullName, emailVerifiedAt: user.emailVerifiedAt, termsAcceptedAt: user.termsAcceptedAt, createdAt: user.createdAt },
    memberships: memberships.map((m) => ({ role: m.role, status: m.status, organization: byId.get(String(m.organizationId)) ?? null })),
    activeSessions: sessions,
    actionsPerformed: audit,
  };
}

/** Owners must archive their organizations first, so customers' bookings are never orphaned silently. */
export async function deleteAccount(user, password, meta = {}) {
  const row = await User.findById(user._id).select('+passwordHash');
  if (!row || !(await verifyPassword(password, row.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Password is incorrect');
  }
  const ownedActive = await Membership.countDocuments({ userId: user._id, role: 'owner', status: 'active' });
  const liveOwned = ownedActive ? await Organization.countDocuments({ ownerUserId: user._id, archivedAt: null }) : 0;
  if (liveOwned > 0) {
    throw new AppError(409, 'OWNER_HAS_ORGANIZATION', 'Archive your organization before deleting your account');
  }

  await recordAudit({ organizationId: null, actorUserId: user._id, action: 'account.deleted', resourceType: 'user', resourceId: user._id, requestId: meta.requestId });
  // Anonymize rather than hard-delete, so audit references stay meaningful without personal data.
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        email: `deleted-${user._id}@deleted.invalid`,
        fullName: 'Deleted user',
        passwordHash: await (await import('../utils/passwords.js')).hashPassword(crypto.randomBytes(24).toString('hex')),
        deletedAt: new Date(),
        emailVerifiedAt: null,
        lockedUntil: null,
      },
    }
  );
  await Session.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  await OneTimeToken.deleteMany({ userId: user._id });
  await Membership.updateMany({ userId: user._id }, { $set: { status: 'removed' } });
}

/** Owner-only archive. Archived organizations stop accepting bookings and disappear from every app. */
export async function archiveOrganization(orgId, confirmName, actor) {
  const org = await Organization.findById(orgId);
  if (!org || org.archivedAt) throw new AppError(404, 'NOT_FOUND', 'Resource not found');
  if (confirmName !== org.name) throw new AppError(400, 'CONFIRMATION_MISMATCH', 'Type the organization name exactly to confirm');
  org.archivedAt = new Date();
  await org.save();
  await Membership.updateMany({ organizationId: orgId }, { $set: { status: 'removed' } });
  await recordAudit({ organizationId: orgId, actorUserId: actor.userId, action: 'organization.archived', resourceType: 'organization', resourceId: orgId, requestId: actor.requestId });
}
