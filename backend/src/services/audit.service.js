import { AuditLog } from '../models/index.js';

const SECRET_KEYS = /pass(word)?|token|secret|cookie|hash/i;

/** Strip secrets and keep only the fields needed to explain a change. */
export function redactSnapshot(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_KEYS.test(k)) continue;
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

/**
 * Record an audit event. Failures are logged but never block the business action,
 * because the action has already happened. Entries are append-only.
 */
export async function recordAudit({ organizationId, actorUserId = null, actorType = 'user', action, resourceType, resourceId = '', before = null, after = null, requestId = null }) {
  try {
    await AuditLog.create({
      organizationId,
      actorUserId,
      actorType,
      action,
      resourceType,
      resourceId: String(resourceId ?? ''),
      before: redactSnapshot(before),
      after: redactSnapshot(after),
      requestId,
      at: new Date(),
    });
  } catch (err) {
    const { logger } = await import('../utils/logger.js');
    logger.error('audit_write_failed', { action, resourceType, message: err.message });
  }
}
