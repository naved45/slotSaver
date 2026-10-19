import { Membership, Organization } from '../models/index.js';
import { AppError } from '../utils/appError.js';

const RANK = { staff: 1, admin: 2, owner: 3 };

/**
 * Loads the caller's active membership for req.params.orgId and enforces a minimum role.
 * The organization id from the URL is never trusted on its own: membership is checked on
 * every request. Non-members get 404 (not 403) so organization ids cannot be probed.
 */
export function requireMembership(minRole = 'staff') {
  return async (req, res, next) => {
    try {
      const membership = await Membership.findOne({
        userId: req.user._id,
        organizationId: req.params.orgId,
        status: 'active',
      }).lean();
      if (!membership) throw new AppError(404, 'NOT_FOUND', 'Resource not found');
      const org = await Organization.findById(membership.organizationId).select('archivedAt').lean();
      if (!org || org.archivedAt) throw new AppError(404, 'NOT_FOUND', 'Resource not found');
      if (RANK[membership.role] < RANK[minRole]) {
        throw new AppError(403, 'FORBIDDEN', 'Your role does not allow this action');
      }
      req.membership = membership;
      req.orgId = membership.organizationId;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** True if the membership may act on every staff member's data (owner/admin). */
export function isManager(membership) {
  return membership?.role === 'owner' || membership?.role === 'admin';
}
