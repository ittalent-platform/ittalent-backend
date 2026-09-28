import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export const enterpriseStatuses = ['active', 'inactive', 'suspended'] as const;
export type EnterpriseStatus = (typeof enterpriseStatuses)[number];

export interface EnterpriseData {
  name: string;
  logo_url?: string;
  industry?: string;
  location?: string;
  short_description?: string;
  description?: string;
  website?: string;
  status: EnterpriseStatus;
}

const enterpriseSchema = new Schema<EnterpriseData>(
  {
    name: { type: String, required: true, trim: true },
    logo_url: { type: String, trim: true },
    industry: { type: String, trim: true },
    location: { type: String, trim: true },
    short_description: { type: String, trim: true },
    description: { type: String, trim: true },
    website: { type: String, trim: true },
    status: {
      type: String,
      enum: enterpriseStatuses,
      default: 'active',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'enterprises',
  },
);

// Public list/search always filters by status and sorts by name (then _id for stable pagination).
enterpriseSchema.index({ status: 1, name: 1, _id: 1 });

export const Enterprise = model('Enterprise', enterpriseSchema);
export type EnterpriseDoc = EnterpriseData & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};