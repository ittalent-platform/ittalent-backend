import type { HydratedDocument, Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export const enterpriseStatuses = [
  'pending',
  'active',
  'suspended',
  'rejected',
  'inactive',
  'deleted',
] as const;
export type EnterpriseStatus = (typeof enterpriseStatuses)[number];

export const companySizes = [
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '501-1000',
  '1000+',
] as const;
export type CompanySize = (typeof companySizes)[number];

export const companyTypes = [
  'Product',
  'Outsourcing',
  'IT Service',
  'Consulting',
  'Agency',
  'Hybrid',
  'Other',
] as const;
export type CompanyType = (typeof companyTypes)[number];

export interface EnterpriseAddress {
  street: string;
  city: string;
  district?: string | undefined;
  state_province?: string | undefined;
  country: string;
  postal_code?: string | undefined;
}

export interface EnterpriseSocialLinks {
  linkedin?: string | undefined;
  facebook?: string | undefined;
  github?: string | undefined;
  twitter?: string | undefined;
}

export interface EnterpriseData {
  name: string;
  legal_name?: string | undefined;
  tax_code: string;
  registration_number?: string | undefined;
  founded_year?: number | undefined;

  email: string;
  phone: string;
  website?: string | undefined;

  industry: string;
  sub_industries?: string[] | undefined;
  company_size: CompanySize;
  company_type?: CompanyType | undefined;

  address: EnterpriseAddress;
  branches?: EnterpriseAddress[] | undefined;

  logo_url?: string | undefined;
  cover_url?: string | undefined;
  short_description?: string | undefined;
  description?: string | undefined;
  culture_summary?: string | undefined;
  benefits?: string[] | undefined;
  tech_stack?: string[] | undefined;
  social_links?: EnterpriseSocialLinks | undefined;
  working_days?: string | undefined;
  media_gallery?: string[] | undefined;

  status: EnterpriseStatus;
  status_reason?: string | undefined;
  status_updated_by?: Types.ObjectId | undefined;
  status_updated_at?: Date | undefined;

  creator_account_id: Types.ObjectId;
  is_deleted: boolean;
  deleted_at?: Date | undefined;
  deleted_by?: Types.ObjectId | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

const enterpriseAddressSchema = new Schema<EnterpriseAddress>(
  {
    street: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    district: { type: String, trim: true },
    state_province: { type: String, trim: true },
    country: { type: String, required: true, trim: true },
    postal_code: { type: String, trim: true },
  },
  { _id: false },
);

const enterpriseSocialLinksSchema = new Schema<EnterpriseSocialLinks>(
  {
    linkedin: { type: String, trim: true },
    facebook: { type: String, trim: true },
    github: { type: String, trim: true },
    twitter: { type: String, trim: true },
  },
  { _id: false },
);

const enterpriseSchema = new Schema<EnterpriseData>(
  {
    name: { type: String, required: true, trim: true, index: true },
    legal_name: { type: String, trim: true },
    tax_code: { type: String, required: true, trim: true },
    registration_number: { type: String, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    website: { type: String, trim: true },
    industry: { type: String, required: true, trim: true, index: true },
    sub_industries: [{ type: String, trim: true }],
    company_size: {
      type: String,
      enum: companySizes,
      required: true,
      index: true,
    },
    company_type: {
      type: String,
      enum: companyTypes,
      trim: true,
    },
    founded_year: { type: Number },
    address: { type: enterpriseAddressSchema, required: true },
    branches: [enterpriseAddressSchema],
    logo_url: { type: String, trim: true },
    cover_url: { type: String, trim: true },
    short_description: { type: String, trim: true },
    description: { type: String, trim: true },
    culture_summary: { type: String, trim: true },
    benefits: [{ type: String, trim: true }],
    tech_stack: [{ type: String, trim: true }],
    social_links: { type: enterpriseSocialLinksSchema },
    working_days: { type: String, trim: true },
    media_gallery: [{ type: String, trim: true }],
    status: {
      type: String,
      enum: enterpriseStatuses,
      default: 'pending',
      required: true,
      index: true,
    },
    status_reason: { type: String, trim: true },
    status_updated_by: { type: Schema.Types.ObjectId, ref: 'User' },
    status_updated_at: { type: Date },
    creator_account_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    is_deleted: { type: Boolean, default: false, required: true, index: true },
    deleted_at: { type: Date },
    deleted_by: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    collection: 'enterprises',
  },
);

enterpriseSchema.index(
  { tax_code: 1 },
  {
    unique: true,
    partialFilterExpression: { is_deleted: false },
  },
);

enterpriseSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { is_deleted: false },
  },
);

enterpriseSchema.index(
  { creator_account_id: 1 },
  {
    partialFilterExpression: { is_deleted: false },
  },
);

enterpriseSchema.index({ status: 1, is_deleted: 1, name: 1, _id: 1 });
enterpriseSchema.index({ status: 1, is_deleted: 1, industry: 1, 'address.city': 1 });

export const Enterprise = model('Enterprise', enterpriseSchema);
export type EnterpriseDoc = HydratedDocument<EnterpriseData>;