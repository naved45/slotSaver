import mongoose from 'mongoose';
const { Schema } = mongoose;

const auditLogSchema = new Schema(
  {
    // Null for account-level events (sign-in, password reset) that are not tied to an organization.
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorType: { type: String, enum: ['user', 'customer', 'system'], default: 'user' },
    action: { type: String, required: true, maxlength: 80 },
    resourceType: { type: String, required: true, maxlength: 60 },
    resourceId: { type: String, default: '', maxlength: 60 },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    requestId: { type: String, default: null },
    at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

auditLogSchema.index({ organizationId: 1, at: -1 });
auditLogSchema.index({ organizationId: 1, resourceType: 1, resourceId: 1 });

// Append-only: this model exposes no update/delete paths in the service layer.
export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
