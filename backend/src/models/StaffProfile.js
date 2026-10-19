import mongoose from 'mongoose';
const { Schema } = mongoose;

const staffProfileSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    displayName: { type: String, required: true, trim: true, maxlength: 120 },
    serviceIds: [{ type: Schema.Types.ObjectId, ref: 'Service' }],
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

staffProfileSchema.index({ organizationId: 1, active: 1 });

export const StaffProfile = mongoose.model('StaffProfile', staffProfileSchema);
