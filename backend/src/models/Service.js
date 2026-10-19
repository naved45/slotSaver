import mongoose from 'mongoose';
const { Schema } = mongoose;

const serviceSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, lowercase: true, match: /^[a-z0-9-]{2,80}$/ },
    description: { type: String, default: '', maxlength: 2000 },
    durationMinutes: { type: Number, required: true, min: 5, max: 480 },
    bufferMinutes: { type: Number, default: 0, min: 0, max: 240 },
    priceMinor: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR', maxlength: 3 },
    active: { type: Boolean, default: true },
    leadTimeMinutes: { type: Number, default: 60, min: 0 },
    maxAdvanceDays: { type: Number, default: 60, min: 1, max: 730 },
    cancelCutoffMinutes: { type: Number, default: 120, min: 0 },
    mode: { type: String, enum: ['in_person', 'online'], default: 'in_person' },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

serviceSchema.index({ organizationId: 1, slug: 1 }, { unique: true });

export const Service = mongoose.model('Service', serviceSchema);
