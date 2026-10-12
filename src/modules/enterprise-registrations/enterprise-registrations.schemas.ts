import { z } from 'zod';

import { companySizes, companyTypes } from '../../models/enterprise.model.js';
import { paginationQueryShape } from '../../shared/schemas/pagination.schemas.js';
import { AUTH_CONFIG, USERNAME_REGEX } from '../auth/auth.constants.js';
import { type AuthTokens, passwordSchema, type UserDTO, userDtoSchema } from '../auth/auth.schemas.js';
import {
  adminDecisionTypes,
  BLOCKED_EMAIL_DOMAINS,
  legalDocumentTypes,
  REGISTRATION_CONFIG,
  REGISTRATION_MESSAGES,
  registrationStatuses,
} from './enterprise-registrations.constants.js';

export const registrationIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Registration identifier is required'),
});

export type RegistrationIdParam = z.infer<typeof registrationIdParamSchema>;

export const registrationCompanyAddressSchema = z.object({
  street: z.string().trim().min(1, 'Street address is required').max(REGISTRATION_CONFIG.STREET_MAX_LENGTH),
  city: z.string().trim().min(1, 'City is required').max(REGISTRATION_CONFIG.CITY_MAX_LENGTH),
  district: z.string().trim().max(REGISTRATION_CONFIG.DISTRICT_MAX_LENGTH).optional(),
  state_province: z.string().trim().max(REGISTRATION_CONFIG.STATE_PROVINCE_MAX_LENGTH).optional(),
  country: z.string().trim().min(1, 'Country is required').max(REGISTRATION_CONFIG.COUNTRY_MAX_LENGTH),
  postal_code: z.string().trim().max(REGISTRATION_CONFIG.POSTAL_CODE_MAX_LENGTH).optional(),
});

export type RegistrationCompanyAddressDTO = z.infer<typeof registrationCompanyAddressSchema>;

export const legalDocumentInputSchema = z.object({
  document_type: z.enum(legalDocumentTypes),
  file_name: z.string().trim().min(1, 'File name is required').max(REGISTRATION_CONFIG.FILE_NAME_MAX_LENGTH),
  file_url: z.string().trim().url('Valid file URL is required'),
  file_size: z.number().int().positive().optional(),
});

export type LegalDocumentInputDTO = z.infer<typeof legalDocumentInputSchema>;

export const uploadLegalDocumentBodySchema = z.object({
  document_type: z.enum(legalDocumentTypes),
});

export type UploadLegalDocumentBodyDTO = z.infer<typeof uploadLegalDocumentBodySchema>;

export const startRegistrationBodySchema = z.object({
  // [BR-27 / EX1]: Corporate email domain requirement.
  // Rejects public/personal webmail providers (e.g., gmail, yahoo, hotmail).
  corporate_email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Invalid corporate email address')
    .refine(
      (email) => {
        const domain = email.split('@')[1];
        return domain ? !BLOCKED_EMAIL_DOMAINS.includes(domain as (typeof BLOCKED_EMAIL_DOMAINS)[number]) : false;
      },
      { message: REGISTRATION_MESSAGES.PERSONAL_EMAIL_REJECTED },
    ),
  representative_name: z
    .string()
    .trim()
    .min(
      REGISTRATION_CONFIG.REPRESENTATIVE_NAME_MIN_LENGTH,
      `Full name must be at least ${REGISTRATION_CONFIG.REPRESENTATIVE_NAME_MIN_LENGTH} characters`,
    )
    .max(
      REGISTRATION_CONFIG.REPRESENTATIVE_NAME_MAX_LENGTH,
      `Full name cannot exceed ${REGISTRATION_CONFIG.REPRESENTATIVE_NAME_MAX_LENGTH} characters`,
    ),
  representative_phone: z
    .string()
    .trim()
    .regex(REGISTRATION_CONFIG.PHONE_REGEX, 'Invalid contact phone number format'),
  representative_position: z.string().trim().max(REGISTRATION_CONFIG.POSITION_MAX_LENGTH).optional(),
});

export type StartRegistrationDTO = z.infer<typeof startRegistrationBodySchema>;

// [BR-28 / EX5]: Email verification magic link query contract.
export const verifyEmailQuerySchema = z.object({
  token: z.string().trim().min(REGISTRATION_CONFIG.TOKEN_MIN_LENGTH, `Verification token must be at least ${REGISTRATION_CONFIG.TOKEN_MIN_LENGTH} characters`),
});

export type VerifyEmailQueryDTO = z.infer<typeof verifyEmailQuerySchema>;

export const saveDraftBodySchema = z.object({
  representative: z
    .object({
      full_name: z.string().trim().min(1).max(REGISTRATION_CONFIG.REPRESENTATIVE_NAME_MAX_LENGTH).optional(),
      phone: z.string().trim().regex(REGISTRATION_CONFIG.PHONE_REGEX, 'Invalid phone number format').optional(),
      position: z.string().trim().max(REGISTRATION_CONFIG.POSITION_MAX_LENGTH).optional(),
    })
    .optional(),
  company_data: z
    .object({
      name: z.string().trim().max(REGISTRATION_CONFIG.COMPANY_NAME_MAX_LENGTH).optional(),
      legal_name: z.string().trim().max(REGISTRATION_CONFIG.LEGAL_NAME_MAX_LENGTH).optional(),
      tax_code: z.string().trim().optional(),
      registration_number: z.string().trim().max(REGISTRATION_CONFIG.REGISTRATION_NUMBER_MAX_LENGTH).optional(),
      website: z.string().trim().url('Invalid website URL').optional().or(z.literal('')),
      industry: z.string().trim().max(REGISTRATION_CONFIG.INDUSTRY_MAX_LENGTH).optional(),
      sub_industries: z.array(z.string().trim()).optional(),
      company_size: z.enum(companySizes).optional(),
      company_type: z.enum(companyTypes).optional(),
      founded_year: z.number().int().min(REGISTRATION_CONFIG.MIN_FOUNDED_YEAR).max(new Date().getFullYear()).optional(),
      address: registrationCompanyAddressSchema.partial().optional(),
      short_description: z.string().trim().max(REGISTRATION_CONFIG.SHORT_DESC_MAX_LENGTH).optional(),
      description: z.string().trim().max(REGISTRATION_CONFIG.DESCRIPTION_MAX_LENGTH).optional(),
    })
    .optional(),
  legal_documents: z.array(legalDocumentInputSchema).optional(),
  version: z.number().int().positive().optional(),
});

export type SaveDraftDTO = z.infer<typeof saveDraftBodySchema>;

export const submitRegistrationBodySchema = z.object({
  representative: z.object({
    full_name: z
      .string()
      .trim()
      .min(
        REGISTRATION_CONFIG.REPRESENTATIVE_NAME_MIN_LENGTH,
        `Representative name must be at least ${REGISTRATION_CONFIG.REPRESENTATIVE_NAME_MIN_LENGTH} characters`,
      )
      .max(REGISTRATION_CONFIG.REPRESENTATIVE_NAME_MAX_LENGTH),
    phone: z
      .string()
      .trim()
      .regex(REGISTRATION_CONFIG.PHONE_REGEX, 'Invalid contact phone number format'),
    position: z.string().trim().max(REGISTRATION_CONFIG.POSITION_MAX_LENGTH).optional(),
  }),
  company_data: z.object({
    name: z
      .string()
      .trim()
      .min(
        REGISTRATION_CONFIG.COMPANY_NAME_MIN_LENGTH,
        `Company name must be at least ${REGISTRATION_CONFIG.COMPANY_NAME_MIN_LENGTH} characters`,
      )
      .max(REGISTRATION_CONFIG.COMPANY_NAME_MAX_LENGTH),
    legal_name: z.string().trim().max(REGISTRATION_CONFIG.LEGAL_NAME_MAX_LENGTH).optional(),
    tax_code: z
      .string()
      .trim()
      .regex(REGISTRATION_CONFIG.TAX_CODE_REGEX, 'Tax identification code must be 10 to 13 numeric digits'),
    registration_number: z.string().trim().max(REGISTRATION_CONFIG.REGISTRATION_NUMBER_MAX_LENGTH).optional(),
    website: z.string().trim().url('Invalid website URL').optional().or(z.literal('')),
    industry: z
      .string()
      .trim()
      .min(
        REGISTRATION_CONFIG.INDUSTRY_MIN_LENGTH,
        `Industry must be at least ${REGISTRATION_CONFIG.INDUSTRY_MIN_LENGTH} characters`,
      )
      .max(REGISTRATION_CONFIG.INDUSTRY_MAX_LENGTH),
    sub_industries: z.array(z.string().trim()).optional(),
    company_size: z.enum(companySizes),
    company_type: z.enum(companyTypes).optional(),
    founded_year: z.number().int().min(REGISTRATION_CONFIG.MIN_FOUNDED_YEAR).max(new Date().getFullYear()).optional(),
    address: registrationCompanyAddressSchema,
    short_description: z.string().trim().max(REGISTRATION_CONFIG.SHORT_DESC_MAX_LENGTH).optional(),
    description: z.string().trim().max(REGISTRATION_CONFIG.DESCRIPTION_MAX_LENGTH).optional(),
  }),
  legal_documents: z
    .array(legalDocumentInputSchema)
    .min(1, 'At least one legal document is required for submission')
    .refine(
      (docs) => docs.some((doc) => doc.document_type === 'business_license'),
      { message: REGISTRATION_MESSAGES.MISSING_LEGAL_DOCUMENTS },
    ),
  version: z.number().int().positive('Version number must be a positive integer'),
});

export type SubmitRegistrationDTO = z.infer<typeof submitRegistrationBodySchema>;

export const registrationListQuerySchema = z.object({
  ...paginationQueryShape,
  status: z.enum(registrationStatuses).optional(),
  search: z.string().trim().min(REGISTRATION_CONFIG.SEARCH_MIN_LENGTH).max(REGISTRATION_CONFIG.SEARCH_MAX_LENGTH).optional(),
});

export type RegistrationListQuery = z.infer<typeof registrationListQuerySchema>;

export interface EnterpriseRegistrationSummaryDTO {
  id: string;
  registration_code: string;
  corporate_email: string;
  company_name: string | null;
  tax_code: string | null;
  representative_name: string;
  representative_phone: string;
  status: string;
  version: number;
  created_at: string | null;
  submitted_at: string | null;
}

export const registrationChecklistSchema = z.object({
  tax_code_verified: z.boolean(),
  legal_representative_verified: z.boolean(),
  documents_verified: z.boolean(),
});

export type RegistrationChecklistDTO = z.infer<typeof registrationChecklistSchema>;

export const adminDecisionBodySchema = z
  .object({
    decision: z.enum(adminDecisionTypes),
    version: z.number().int().positive('Case version must be a positive integer'),
    rejection_reason: z
      .string()
      .trim()
      .max(
        REGISTRATION_CONFIG.REJECTION_REASON_MAX_LENGTH,
        `Rejection reason cannot exceed ${REGISTRATION_CONFIG.REJECTION_REASON_MAX_LENGTH} characters`,
      )
      .optional(),
    checklist: registrationChecklistSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.decision === 'rejected') {
      if (
        !data.rejection_reason ||
        data.rejection_reason.trim().length < REGISTRATION_CONFIG.REJECTION_REASON_MIN_LENGTH
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rejection_reason'],
          message: REGISTRATION_MESSAGES.REJECTION_REASON_REQUIRED,
        });
      }
    }

    if (data.decision === 'approved') {
      if (
        !data.checklist ||
        !data.checklist.tax_code_verified ||
        !data.checklist.legal_representative_verified ||
        !data.checklist.documents_verified
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['checklist'],
          message: REGISTRATION_MESSAGES.CHECKLIST_INCOMPLETE,
        });
      }
    }
  });

export type AdminDecisionDTO = z.infer<typeof adminDecisionBodySchema>;

export const acceptInvitationBodySchema = z.object({
  token: z.string().trim().min(1, 'Invitation token is required'),
  password: passwordSchema,
  username: z
    .string()
    .min(
      AUTH_CONFIG.USERNAME_MIN_LENGTH,
      `Username must be at least ${AUTH_CONFIG.USERNAME_MIN_LENGTH} characters`,
    )
    .max(
      AUTH_CONFIG.USERNAME_MAX_LENGTH,
      `Username cannot exceed ${AUTH_CONFIG.USERNAME_MAX_LENGTH} characters`,
    )
    .regex(USERNAME_REGEX, 'Username may only contain letters, numbers, and underscores')
    .trim()
    .toLowerCase()
    .optional(),
});

export type AcceptInvitationDTO = z.infer<typeof acceptInvitationBodySchema>;

export interface AcceptInvitationResult {
  message: string;
  user: UserDTO;
  tokens: AuthTokens;
}

export const startRegistrationResponseSchema = z.object({
  message: z.string(),
  email: z.string().email(),
});
export type StartRegistrationResponseDTO = z.infer<typeof startRegistrationResponseSchema>;

export const verifyEmailResponseSchema = z.object({
  message: z.string(),
  registration_id: z.string(),
  registration_code: z.string(),
  status: z.string(),
  version: z.number(),
  corporate_email: z.string().email(),
  representative: z.object({
    full_name: z.string(),
    phone: z.string(),
    position: z.string().optional(),
  }),
});
export type VerifyEmailResponseDTO = z.infer<typeof verifyEmailResponseSchema>;

export const legalDocumentResponseSchema = z.object({
  document_type: z.enum(legalDocumentTypes),
  file_name: z.string(),
  file_url: z.string(),
  file_size: z.number().optional(),
  uploaded_at: z.string().or(z.date()).optional(),
});
export type LegalDocumentResponseDTO = z.infer<typeof legalDocumentResponseSchema>;

export const uploadLegalDocumentFormSchema = z.object({
  document_type: z.enum(legalDocumentTypes),
  file: z.string().openapi({
    type: 'string',
    format: 'binary',
    description: 'Legal registration PDF document (business license, tax registration, power of attorney)',
  }),
});
export type UploadLegalDocumentFormDTO = z.infer<typeof uploadLegalDocumentFormSchema>;

export const submissionReceiptResponseSchema = z.object({
  registration_code: z.string(),
  status: z.string(),
  version: z.number(),
  submitted_at: z.string(),
  estimated_sla_days: z.number(),
});
export type SubmissionReceiptResponseDTO = z.infer<typeof submissionReceiptResponseSchema>;

export const enterpriseRegistrationSummarySchema = z.object({
  id: z.string(),
  registration_code: z.string(),
  corporate_email: z.string().email(),
  company_name: z.string().nullable(),
  tax_code: z.string().nullable(),
  representative_name: z.string(),
  representative_phone: z.string(),
  status: z.string(),
  version: z.number(),
  created_at: z.string().nullable(),
  submitted_at: z.string().nullable(),
});

export const paginatedRegistrationSummarySchema = z.object({
  items: z.array(enterpriseRegistrationSummarySchema),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
});
export type PaginatedRegistrationSummaryDTO = z.infer<typeof paginatedRegistrationSummarySchema>;

export const registrationDetailSchema = z.object({
  _id: z.string().optional(),
  registration_code: z.string(),
  version: z.number(),
  corporate_email: z.string(),
  representative: z.object({
    full_name: z.string(),
    phone: z.string(),
    position: z.string().optional(),
  }),
  company_data: z.record(z.string(), z.unknown()).optional(),
  legal_documents: z.array(legalDocumentResponseSchema).optional(),
  status: z.enum(registrationStatuses),
  claim_locks: z
    .object({
      tax_code: z.string().optional(),
      corporate_email: z.string().optional(),
      locked_at: z.string().or(z.date()).optional(),
    })
    .optional(),
  review: z
    .object({
      reviewed_by: z.string().optional(),
      reviewed_at: z.string().or(z.date()).optional(),
      decision: z.enum(adminDecisionTypes).optional(),
      rejection_reason: z.string().optional(),
      checklist: z
        .object({
          tax_code_verified: z.boolean().optional(),
          legal_representative_verified: z.boolean().optional(),
          documents_verified: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
  created_enterprise_id: z.string().optional(),
  createdAt: z.string().or(z.date()).optional(),
  updatedAt: z.string().or(z.date()).optional(),
});
export type RegistrationDetailDTO = z.infer<typeof registrationDetailSchema>;

export const adminDecisionResponseSchema = z.object({
  message: z.string(),
  registration_code: z.string(),
  status: z.string(),
  version: z.number(),
  enterprise_id: z.string().optional(),
});
export type AdminDecisionResponseDTO = z.infer<typeof adminDecisionResponseSchema>;

export const acceptInvitationResponseSchema = z.object({
  message: z.string(),
  user: userDtoSchema,
  tokens: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
  }),
});
export type AcceptInvitationResponseDTO = z.infer<typeof acceptInvitationResponseSchema>;
