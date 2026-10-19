import mongoose from 'mongoose';
const { Schema } = mongoose;

export const ROLES = ['owner', 'admin', 'staff'];

const membershipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    role: { type: String, enum: ROLES, required: true },
    status: { type: String, enum: ['active', 'removed'], default: 'active' },
    staffProfileId: { type: Schema.Types.ObjectId, ref: 'StaffProfile', default: null },
  },
  { timestamps: true }
);

membershipSchema.index({ userId: 1, organizationId: 1 }, { unique: true });
membershipSchema.index({ organizationId: 1, role: 1 });

export const Membership = mongoose.model('Membership', membershipSchema);
