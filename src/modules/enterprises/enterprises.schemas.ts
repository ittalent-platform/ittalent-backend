import { z } from 'zod';

import { companySizes, companyTypes, enterpriseStatuses } from '../../models/enterprise.model.js';
import { objectIdSchema } from '../../shared/schemas/object-id.schemas.js';
import { paginatedResponseSchema, paginationQueryShape } from '../../shared/schemas/pagination.schemas.js';
import { ENTERPRISE_CONFIG, ENTERPRISE_MESSAGES } from './enterprises.constants.js';

export const enterpriseIdParamSchema = z.object({
  enterpriseId: objectIdSchema('enterprise ID'),
});

export type EnterpriseIdParam = z.infer<typeof enterpriseIdParamSchema>;

export const enterpriseAddressSchema = z.object({
  street: z
    .string()
    .trim()
    .min(1, 'Street address is required')
    .max(ENTERPRISE_CONFIG.STREET_MAX_LENGTH),
  city: z
    .string()
    .trim()
    .min(1, 'City is required')
    .max(ENTERPRISE_CONFIG.CITY_MAX_LENGTH),
  district: z.string().trim().max(ENTERPRISE_CONFIG.DISTRICT_MAX_LENGTH).optional(),
  state_province: z.string().trim().max(ENTERPRISE_CONFIG.STATE_PROVINCE_MAX_LENGTH).optional(),
  country: z
    .string()
    .trim()
    .min(1, 'Country is required')
    .max(ENTERPRISE_CONFIG.COUNTRY_MAX_LENGTH),
  postal_code: z.string().trim().max(ENTERPRISE_CONFIG.POSTAL_CODE_MAX_LENGTH).optional(),
});

export type EnterpriseAddressDTO = z.infer<typeof enterpriseAddressSchema>;

export const enterpriseSocialLinksSchema = z.object({
  linkedin: z.string().url('Invalid LinkedIn URL').optional().or(z.literal('')),
  facebook: z.string().url('Invalid Facebook URL').optional().or(z.literal('')),
  github: z.string().url('Invalid GitHub URL').optional().or(z.literal('')),
  twitter: z.string().url('Invalid Twitter/X URL').optional().or(z.literal('')),
});

export type EnterpriseSocialLinksDTO = z.infer<typeof enterpriseSocialLinksSchema>;

export const createEnterpriseBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(ENTERPRISE_CONFIG.NAME_MIN_LENGTH, `Company name must be at least ${ENTERPRISE_CONFIG.NAME_MIN_LENGTH} characters`)
    .max(ENTERPRISE_CONFIG.NAME_MAX_LENGTH, `Company name cannot exceed ${ENTERPRISE_CONFIG.NAME_MAX_LENGTH} characters`),
  legal_name: z.string().trim().max(ENTERPRISE_CONFIG.LEGAL_NAME_MAX_LENGTH).optional(),
  tax_code: z
    .string()
    .trim()
    .regex(ENTERPRISE_CONFIG.TAX_CODE_REGEX, 'Tax code must be 10 to 13 numeric digits'),
  registration_number: z.string().trim().max(ENTERPRISE_CONFIG.REGISTRATION_NUMBER_MAX_LENGTH).optional(),
  email: z.string().trim().toLowerCase().email('Invalid corporate email address'),
  phone: z
    .string()
    .trim()
    .regex(ENTERPRISE_CONFIG.PHONE_REGEX, 'Phone number format is invalid'),
  website: z.string().url('Invalid website URL').optional().or(z.literal('')),
  industry: z
    .string()
    .trim()
    .min(ENTERPRISE_CONFIG.INDUSTRY_MIN_LENGTH, `Industry must be at least ${ENTERPRISE_CONFIG.INDUSTRY_MIN_LENGTH} characters`)
    .max(ENTERPRISE_CONFIG.INDUSTRY_MAX_LENGTH),
  sub_industries: z.array(z.string().trim().min(1).max(ENTERPRISE_CONFIG.SUB_INDUSTRY_MAX_LENGTH)).optional(),
  company_size: z.enum(companySizes, {
    error: () => ({ message: 'Invalid company size' }),
  }),
  company_type: z.enum(companyTypes).optional(),
  founded_year: z
    .number()
    .int()
    .min(ENTERPRISE_CONFIG.MIN_FOUNDED_YEAR, `Founded year must be after ${ENTERPRISE_CONFIG.MIN_FOUNDED_YEAR}`)
    .max(new Date().getFullYear(), 'Founded year cannot be in the future')
    .optional(),
  address: enterpriseAddressSchema,
  branches: z.array(enterpriseAddressSchema).optional(),
  logo_url: z.string().url('Invalid logo URL').optional().or(z.literal('')),
  cover_url: z.string().url('Invalid cover URL').optional().or(z.literal('')),
  short_description: z.string().trim().max(ENTERPRISE_CONFIG.SHORT_DESC_MAX_LENGTH).optional(),
  description: z.string().trim().optional(),
  culture_summary: z.string().trim().optional(),
  benefits: z.array(z.string().trim().min(1)).optional(),
  tech_stack: z.array(z.string().trim().min(1)).optional(),
  social_links: enterpriseSocialLinksSchema.optional(),
  working_days: z.string().trim().max(ENTERPRISE_CONFIG.WORKING_DAYS_MAX_LENGTH).optional(),
  media_gallery: z.array(z.string().url('Invalid media URL')).optional(),
});

export type CreateEnterpriseDTO = z.infer<typeof createEnterpriseBodySchema>;

export const updateEnterpriseBodySchema = createEnterpriseBodySchema
  .partial()
  .extend({
    tax_code: z
      .string()
      .trim()
      .regex(ENTERPRISE_CONFIG.TAX_CODE_REGEX, 'Tax code must be 10 to 13 numeric digits')
      .optional(),
  });

export type UpdateEnterpriseDTO = z.infer<typeof updateEnterpriseBodySchema>;

export const updateEnterpriseStatusBodySchema = z
  .object({
    status: z.enum(['pending', 'active', 'suspended', 'rejected', 'inactive'], {
      error: () => ({ message: 'Invalid enterprise status' }),
    }),
    reason: z.string().trim().max(ENTERPRISE_CONFIG.REASON_MAX_LENGTH).optional(),
  })
  .superRefine((data, ctx) => {
    if (['suspended', 'rejected'].includes(data.status)) {
      if (!data.reason || data.reason.trim().length < ENTERPRISE_CONFIG.REASON_MIN_LENGTH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: ENTERPRISE_MESSAGES.REASON_REQUIRED,
          path: ['reason'],
        });
      }
    }
  });

export type UpdateEnterpriseStatusDTO = z.infer<typeof updateEnterpriseStatusBodySchema>;

const searchTextSchema = z
  .string()
  .trim()
  .min(ENTERPRISE_CONFIG.KEYWORD_MIN_LENGTH, 'Search value must not be empty')
  .max(ENTERPRISE_CONFIG.KEYWORD_MAX_LENGTH, `Search value cannot exceed ${ENTERPRISE_CONFIG.KEYWORD_MAX_LENGTH} characters`);

export const enterpriseListQuerySchema = z.strictObject({
  ...paginationQueryShape,
  keyword: searchTextSchema.optional(),
  industry: searchTextSchema.optional(),
  location: searchTextSchema.optional(),
  company_size: z.enum(companySizes).optional(),
  status: z.enum(enterpriseStatuses).optional(),
});

export type EnterpriseListQuery = z.infer<typeof enterpriseListQuerySchema>;

export const enterpriseSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
  industry: z.string().nullable(),
  location: z.string().nullable(),
  shortDescription: z.string().nullable(),
  companySize: z.string().nullable(),
  companyType: z.string().nullable(),
  techStack: z.array(z.string()).default([]),
  openRoleCount: z.number().default(0),
  status: z.string(),
});

export type EnterpriseSummaryDTO = z.infer<typeof enterpriseSummarySchema>;

export const enterpriseDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  legalName: z.string().nullable(),
  taxCode: z.string().nullable(),
  registrationNumber: z.string().nullable(),
  email: z.string(),
  phone: z.string(),
  website: z.string().nullable(),
  industry: z.string(),
  subIndustries: z.array(z.string()).default([]),
  companySize: z.string(),
  companyType: z.string().nullable(),
  foundedYear: z.number().nullable(),
  address: enterpriseAddressSchema,
  branches: z.array(enterpriseAddressSchema).default([]),
  logoUrl: z.string().nullable(),
  coverUrl: z.string().nullable(),
  shortDescription: z.string().nullable(),
  description: z.string().nullable(),
  cultureSummary: z.string().nullable(),
  benefits: z.array(z.string()).default([]),
  techStack: z.array(z.string()).default([]),
  socialLinks: enterpriseSocialLinksSchema.nullable(),
  workingDays: z.string().nullable(),
  mediaGallery: z.array(z.string()).default([]),
  status: z.string(),
  statusReason: z.string().nullable(),
  creatorAccountId: z.string(),
  activeJobsCount: z.number().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type EnterpriseDetailDTO = z.infer<typeof enterpriseDetailSchema>;

export const enterpriseListResponseSchema = paginatedResponseSchema(enterpriseSummarySchema);
export type EnterpriseListResponse = z.infer<typeof enterpriseListResponseSchema>;