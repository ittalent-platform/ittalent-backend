import { z } from 'zod';

import { PAGINATION } from '../../shared/constants/pagination.js';
import { jobPostingStatuses } from '../../models/job-posting.model.js';

const TITLE_MIN_LENGTH = 5;
const TITLE_MAX_LENGTH = 150;
const LOCATION_MAX_LENGTH = 200;
const SHORT_TEXT_MAX_LENGTH = 100;
const CURRENCY_MAX_LENGTH = 10;
const PUBLISHED_DESCRIPTION_MIN_LENGTH = 20;

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid job posting ID');
const fields = z.object({
  title: z.string().trim().min(TITLE_MIN_LENGTH).max(TITLE_MAX_LENGTH),
  location: z.string().trim().min(1).max(LOCATION_MAX_LENGTH).optional(),
  employment_type: z.string().trim().min(1).max(SHORT_TEXT_MAX_LENGTH).optional(),
  salary_min: z.number().min(0).optional(),
  salary_max: z.number().min(0).optional(),
  salary_negotiable: z.boolean().optional(),
  currency: z.string().trim().min(1).max(CURRENCY_MAX_LENGTH).optional(),
  level: z.string().trim().min(1).max(SHORT_TEXT_MAX_LENGTH).optional(),
  description: z.string().trim().optional(),
  requirements: z.string().trim().optional(),
  benefits: z.string().trim().optional(),
  openings: z.number().int().min(1).optional(),
  status: z.enum(jobPostingStatuses).optional(),
  expires_at: z.iso.datetime().optional(),
});

function validSalary(input: { salary_min?: number | undefined; salary_max?: number | undefined; salary_negotiable?: boolean | undefined }): boolean {
  return input.salary_negotiable === true || input.salary_min === undefined || input.salary_max === undefined || input.salary_min <= input.salary_max;
}

function publishComplete(input: z.infer<typeof fields>): boolean {
  return input.status !== 'published' || Boolean(input.description && input.description.length >= PUBLISHED_DESCRIPTION_MIN_LENGTH && input.requirements && input.benefits && input.location && input.employment_type && input.expires_at);
}

export const createJobPostingSchema = fields.refine(validSalary, { path: ['salary_min'], message: 'Salary range is invalid' }).refine(publishComplete, { path: ['status'], message: 'Description, requirements, benefits, location, employment type, and expiry are required to publish' });
const nullableUpdateFields = fields.extend({
  location: fields.shape.location.nullable(),
  employment_type: fields.shape.employment_type.nullable(),
  salary_min: fields.shape.salary_min.nullable(),
  salary_max: fields.shape.salary_max.nullable(),
  level: fields.shape.level.nullable(),
  description: fields.shape.description.nullable(),
  requirements: fields.shape.requirements.nullable(),
  benefits: fields.shape.benefits.nullable(),
  openings: fields.shape.openings.nullable(),
  expires_at: fields.shape.expires_at.nullable(),
});

export const updateJobPostingSchema = nullableUpdateFields.partial()
  .refine((input) => Object.values(input).some((value) => value !== undefined), 'At least one field must be provided')
  .refine(
    (input) => input.salary_negotiable === true || input.salary_min === undefined || input.salary_min === null || input.salary_max === undefined || input.salary_max === null || input.salary_min <= input.salary_max,
    { path: ['salary_min'], message: 'Salary range is invalid' },
  );
export const jobPostingIdParamSchema = z.object({ id: objectId });
export const jobPostingListQuerySchema = z.object({
  search: z.string().trim().min(1).max(SHORT_TEXT_MAX_LENGTH).optional(),
  status: z.enum(jobPostingStatuses).optional(),
  location: z.string().trim().min(1).max(LOCATION_MAX_LENGTH).optional(),
  employment_type: z.string().trim().min(1).max(SHORT_TEXT_MAX_LENGTH).optional(),
  level: z.string().trim().min(1).max(SHORT_TEXT_MAX_LENGTH).optional(),
  sort_by: z.enum(['created_at', 'title', 'expires_at']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
});
export type CreateJobPosting = z.infer<typeof createJobPostingSchema>;
export type UpdateJobPosting = z.infer<typeof updateJobPostingSchema>;
export type JobPostingIdParam = z.infer<typeof jobPostingIdParamSchema>;
export type JobPostingListQuery = z.infer<typeof jobPostingListQuerySchema>;
export const jobPostingEnterpriseSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
});
export type JobPostingEnterpriseSummary = z.infer<typeof jobPostingEnterpriseSummarySchema>;
export const jobPostingResponseSchema = z.object({ id: z.string(), enterpriseId: z.string(), enterprise: jobPostingEnterpriseSummarySchema, postedByUserId: z.string(), title: z.string(), slug: z.string(), location: z.string().optional(), employmentType: z.string().optional(), salaryMin: z.number().optional(), salaryMax: z.number().optional(), salaryNegotiable: z.boolean(), currency: z.string(), level: z.string().optional(), description: z.string().optional(), requirements: z.string().optional(), benefits: z.string().optional(), openings: z.number().optional(), status: z.enum(jobPostingStatuses), expiresAt: z.string().optional(), createdAt: z.string(), updatedAt: z.string() });
export type JobPostingResponse = z.infer<typeof jobPostingResponseSchema>;

export const jobPostingListResponseSchema = z.object({
  items: z.array(jobPostingResponseSchema),
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export type JobPostingListResponse = z.infer<typeof jobPostingListResponseSchema>;
