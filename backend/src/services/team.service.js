import { Membership, OneTimeToken, User, Organization, StaffProfile } from '../models/index.js';
import { generateToken, hashToken } from '../utils/tokens.js';
import { AppError } from '../utils/appError.js';
import { getContext } from '../context.js';
import { templates } from './email/templates.js';
import { recordAudit } from './audit.service.js';
import { logger } from '../utils/logger.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;

export async function listMembers(orgId) {
  const rows = await Membership.find({ organizationId: orgId, status: 'active' }).lean();
  const users = await User.find({ _id: { $in: rows.map((r) => r.userId) } }).select('email fullName emailVerifiedAt').lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return rows.map((r) => ({
    membershipId: r._id,
    role: r.role,
    staffProfileId: r.staffProfileId,
    user: byId.get(String(r.userId)) ?? null,
  }));
}

/** Owners invite admins and staff. Admins may invite staff only. Tokens are single-use and expire. */
export async function inviteMember(orgId, { email, role, staffProfileId }, actor) {
  if (actor.role === 'admin' && role !== 'staff') throw new AppError(403, 'FORBIDDEN', 'Admins can only invite staff');
  if (staffProfileId) {
    const exists = await StaffProfile.exists({ _id: staffProfileId, organizationId: orgId });
    if (!exists) throw new AppError(404, 'NOT_FOUND', 'Staff profile not found');
  }
  const existingUser = await User.findOne({ email });
  if (existingUser && (await Membership.exists({ userId: existingUser._id, organizationId: orgId, status: 'active' }))) {
    throw new AppError(409, 'CONFLICT', 'That person is already a member');
  }
  const org = await Organization.findById(orgId).lean();
  const token = generateToken();
  await OneTimeToken.create({
    purpose: 'invitation',
    tokenHash: hashToken(token),
    organizationId: orgId,
    email,
    role,
    staffProfileId: staffProfileId ?? null,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });
  const { config, email: mailer } = getContext();
  const link = `${config.appBaseUrl}/accept-invitation?token=${token}`;
  const { subject, text, html } = templates.invitation({ link, orgName: org.name, role });
  try {
    await mailer.send({ to: email, subject, text, html });
  } catch (err) {
    logger.error('invite_email_failed', { message: err.message });
  }
  await recordAudit({ organizationId: orgId, actorUserId: actor.userId, action: 'member.invited', resourceType: 'invitation', resourceId: email, after: { role }, requestId: actor.requestId });
  return { message: `Invitation sent to ${email}` };
}

/** The signed-in user must be verified and must match the invited email. */
export async function acceptInvitation(user, token, meta = {}) {
  const inv = await OneTimeToken.findOneAndUpdate(
    { tokenHash: hashToken(token), purpose: 'invitation', usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: true }
  );
  if (!inv) throw new AppError(400, 'INVALID_TOKEN', 'This invitation is invalid or has expired');
  if (inv.email !== user.email) {
    // Release the token so the right person can still use it.
    await OneTimeToken.updateOne({ _id: inv._id }, { $set: { usedAt: null } });
    throw new AppError(403, 'WRONG_ACCOUNT', 'Sign in with the email address this invitation was sent to');
  }
  const membership = await Membership.findOneAndUpdate(
    { userId: user._id, organizationId: inv.organizationId },
    { $set: { role: inv.role, status: 'active', staffProfileId: inv.staffProfileId ?? null } },
    { upsert: true, new: true }
  );
  await recordAudit({ organizationId: inv.organizationId, actorUserId: user._id, action: 'member.joined', resourceType: 'membership', resourceId: membership._id, after: { role: inv.role }, requestId: meta.requestId });
  return { organizationId: inv.organizationId, role: inv.role };
}

/** Owner-only role change. Owners cannot be demoted here (ownership transfer is out of scope). */
export async function changeRole(orgId, membershipId, role, actor) {
  const before = await Membership.findOne({ _id: membershipId, organizationId: orgId, status: 'active' }).lean();
  if (!before) throw new AppError(404, 'NOT_FOUND', 'Member not found');
  if (before.role === 'owner') throw new AppError(409, 'CONFLICT', 'The owner role cannot be changed here');
  await Membership.updateOne({ _id: membershipId }, { $set: { role } });
  await recordAudit({ organizationId: orgId, actorUserId: actor.userId, action: 'member.role_changed', resourceType: 'membership', resourceId: membershipId, before: { role: before.role }, after: { role }, requestId: actor.requestId });
}

export async function removeMember(orgId, membershipId, actor) {
  const before = await Membership.findOne({ _id: membershipId, organizationId: orgId, status: 'active' }).lean();
  if (!before) throw new AppError(404, 'NOT_FOUND', 'Member not found');
  if (before.role === 'owner') throw new AppError(409, 'CONFLICT', 'The owner cannot be removed');
  await Membership.updateOne({ _id: membershipId }, { $set: { status: 'removed' } });
  await recordAudit({ organizationId: orgId, actorUserId: actor.userId, action: 'member.removed', resourceType: 'membership', resourceId: membershipId, before: { role: before.role }, requestId: actor.requestId });
}
