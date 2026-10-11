import type { HydratedDocument, Types } from 'mongoose';
import { Schema, model } from 'mongoose';

import type { CompanySize, CompanyType, EnterpriseAddress } from './enterprise.model.js';
import type {
  AdminDecisionType,
  EnterpriseRegistrationStatus,
  LegalDocumentType,
} from '../modules/enterprise-registrations/enterprise-registrations.constants.js';
import {
  adminDecisionTypes,
  legalDocumentTypes,
  registrationStatuses,
} from '../modules/enterprise-registrations/enterprise-registrations.constants.js';

export interface LegalDocumentData {
  document_type: LegalDocumentType;
  file_name: string;
  file_url: string;
  file_size?: number | undefined;
  uploaded_at: Date;
}

export interface RegistrationCompanyData {
  name: string;
  legal_name?: string | undefined;
  tax_code: string;
  registration_number?: string | undefined;
  website?: string | undefined;
  industry: string;
  sub_industries?: string[] | undefined;
  company_size: CompanySize;
  company_type?: CompanyType | undefined;
  founded_year?: number | undefined;
  address: EnterpriseAddress;
  short_description?: string | undefined;
  description?: string | undefined;
}

export interface RegistrationRepresentativeData {
  full_name: string;
  phone: string;
  position?: string | undefined;
}

export interface RegistrationClaimLocks {
  tax_code?: string | undefined;
  corporate_email?: string | undefined;
  locked_at?: Date | undefined;
}

export interface RegistrationVerificationToken {
  token_hash?: string | undefined;
  expires_at?: Date | undefined;
  verified_at?: Date | undefined;
}

export interface RegistrationInvitationToken {
  token_hash?: string | undefined;
  expires_at?: Date | undefined;
  accepted_at?: Date | undefined;
}

export interface RegistrationChecklist {
  tax_code_verified: boolean;
  legal_representative_verified: boolean;
  documents_verified: boolean;
}

export interface RegistrationReviewAudit {
  reviewed_by?: Types.ObjectId | undefined;
  reviewed_at?: Date | undefined;
  decision?: AdminDecisionType | undefined;
  rejection_reason?: string | undefined;
  checklist?: RegistrationChecklist | undefined;
}

export interface EnterpriseRegistrationData {
  registration_code: string;
  version: number;
  corporate_email: string;
  representative: RegistrationRepresentativeData;
  company_data?: RegistrationCompanyData | undefined;
  legal_documents?: LegalDocumentData[] | undefined;
  status: EnterpriseRegistrationStatus;
  claim_locks?: RegistrationClaimLocks | undefined;
  verification_token?: RegistrationVerificationToken | undefined;
  invitation_token?: RegistrationInvitationToken | undefined;
  review?: RegistrationReviewAudit | undefined;
  created_enterprise_id?: Types.ObjectId | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

const legalDocumentSchema = new Schema<LegalDocumentData>(
  {
    document_type: {
      type: String,
      enum: legalDocumentTypes,
      required: true,
    },
    file_name: { type: String, required: true, trim: true },
    file_url: { type: String, required: true, trim: true },
    file_size: { type: Number },
    uploaded_at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const registrationCompanySchema = new Schema<RegistrationCompanyData>(
  {
    name: { type: String, trim: true },
    legal_name: { type: String, trim: true },
    tax_code: { type: String, trim: true },
    registration_number: { type: String, trim: true },
    website: { type: String, trim: true },
    industry: { type: String, trim: true },
    sub_industries: [{ type: String, trim: true }],
    company_size: { type: String },
    company_type: { type: String, trim: true },
    founded_year: { type: Number },
    address: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      district: { type: String, trim: true },
      state_province: { type: String, trim: true },
      country: { type: String, trim: true },
      postal_code: { type: String, trim: true },
    },
    short_description: { type: String, trim: true },
    description: { type: String, trim: true },
  },
  { _id: false },
);

const enterpriseRegistrationSchema = new Schema<EnterpriseRegistrationData>(
  {
    registration_code: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    version: {
      type: Number,
      required: true,
      default: 1,
    },
    corporate_email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    representative: {
      full_name: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true },
      position: { type: String, trim: true },
    },
    company_data: { type: registrationCompanySchema },
    legal_documents: [legalDocumentSchema],
    status: {
      type: String,
      enum: registrationStatuses,
      default: 'draft',
      index: true,
    },
    claim_locks: {
      tax_code: { type: String, trim: true },
      corporate_email: { type: String, trim: true, lowercase: true },
      locked_at: { type: Date },
    },
    verification_token: {
      token_hash: { type: String, select: false },
      expires_at: { type: Date },
      verified_at: { type: Date },
    },
    invitation_token: {
      token_hash: { type: String, select: false },
      expires_at: { type: Date },
      accepted_at: { type: Date },
    },
    review: {
      reviewed_by: { type: Schema.Types.ObjectId, ref: 'User' },
      reviewed_at: { type: Date },
      decision: { type: String, enum: adminDecisionTypes },
      rejection_reason: { type: String, trim: true },
      checklist: {
        tax_code_verified: { type: Boolean },
        legal_representative_verified: { type: Boolean },
        documents_verified: { type: Boolean },
      },
    },
    created_enterprise_id: {
      type: Schema.Types.ObjectId,
      ref: 'Enterprise',
    },
  },
  {
    timestamps: true,
    collection: 'enterprise_registrations',
  },
);

enterpriseRegistrationSchema.index({ status: 1, createdAt: -1 });

enterpriseRegistrationSchema.index(
  { 'claim_locks.tax_code': 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: {
      status: { $in: ['pending_review', 'under_review'] },
      'claim_locks.tax_code': { $type: 'string' },
    },
  },
);

enterpriseRegistrationSchema.index(
  { 'claim_locks.corporate_email': 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: {
      status: { $in: ['pending_review', 'under_review'] },
      'claim_locks.corporate_email': { $type: 'string' },
    },
  },
);

export const EnterpriseRegistration = model<EnterpriseRegistrationData>(
  'EnterpriseRegistration',
  enterpriseRegistrationSchema,
);

export type EnterpriseRegistrationDoc = HydratedDocument<EnterpriseRegistrationData>;
