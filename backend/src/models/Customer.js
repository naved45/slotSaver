import mongoose from 'mongoose';
const { Schema } = mongoose;

const customerSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    phone: { type: String, default: '', maxlength: 30 },
    notes: { type: String, default: '', maxlength: 2000 },
    consent: {
      email: { type: Boolean, default: false },
      sms: { type: Boolean, default: false },
      consentedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

customerSchema.index({ organizationId: 1, email: 1 }, { unique: true });
customerSchema.index({ organizationId: 1, fullName: 1 });

export const Customer = mongoose.model('Customer', customerSchema);
