import { z } from 'zod';

import { PAGINATION } from '../../shared/constants/pagination.js';
import { jobPostingStatuses } from '../../models/job-posting.model.js';

import { JOB_EMPLOYMENT_TYPES, JOB_LIMITS, RECRUITMENT_STATUSES } from './job-postings.constants.js';
import { isValidDeadlineInput } from './job-postings.deadline.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid job posting ID');
const content = z.string().trim().min(JOB_LIMITS.CONTENT_MIN).max(JOB_LIMITS.CONTENT_MAX);
const deadline = z.string().trim().refine(isValidDeadlineInput, 'Deadline must be a valid date (YYYY-MM-DD)');

// Fields HR/Recruiter may set. Publication status, enterprise ownership and application data are deliberately
// absent: both schemas are strict, so sending them is rejected (UC-JOB-01, UC-JOB-02.EX.2). Sprint 1 has no Draft or
// status change: saving always publishes, and the stored status is read-only.
const editable = {
  title: z.string().trim().min(JOB_LIMITS.TITLE_MIN).max(JOB_LIMITS.TITLE_MAX),
  location: z.string().trim().min(JOB_LIMITS.LOCATION_MIN).max(JOB_LIMITS.LOCATION_MAX),
  employment_type: z.enum(JOB_EMPLOYMENT_TYPES),
  description: content,
  requirements: content,
  benefits: content,
  expires_at: deadline,
  salary_min: z.number().min(0),
  salary_max: z.number().min(0),
  salary_negotiable: z.boolean(),
  currency: z.string().trim().min(1).max(JOB_LIMITS.CURRENCY_MAX),
  level: z.string().trim().min(1).max(JOB_LIMITS.SHORT_TEXT_MAX),
  openings: z.number().int().min(1),
};

function validSalary(input: { salary_min?: number | null | undefined; salary_max?: number | null | undefined; salary_negotiable?: boolean | undefined }): boolean {
  return (
    input.salary_negotiable === true ||
    input.salary_min === undefined ||
    input.salary_min === null ||
    input.salary_max === undefined ||
    input.salary_max === null ||
    input.salary_min <= input.salary_max
  );
}

// Saving always publishes, so every Published-field is required on create (BR-JOB-003).
export const createJobPostingSchema = z
  .object({
    title: editable.title,
    location: editable.location,
    employment_type: editable.employment_type,
    description: editable.description,
    requirements: editable.requirements,
    benefits: editable.benefits,
    expires_at: editable.expires_at,
    salary_min: editable.salary_min.optional(),
    salary_max: editable.salary_max.optional(),
    salary_negotiable: editable.salary_negotiable.optional(),
    currency: editable.currency.optional(),
    level: editable.level.optional(),
    openings: editable.openings.optional(),
  })
  .strict()
  .refine(validSalary, { path: ['salary_min'], message: 'Salary range is invalid' });

// Required Published-fields can be changed but never cleared; only optional fields accept null.
export const updateJobPostingSchema = z
  .object({
    title: editable.title,
    location: editable.location,
    employment_type: editable.employment_type,
    description: editable.description,
    requirements: editable.requirements,
    benefits: editable.benefits,
    expires_at: editable.expires_at,
    salary_min: editable.salary_min.nullable(),
    salary_max: editable.salary_max.nullable(),
    salary_negotiable: editable.salary_negotiable,
    currency: editable.currency,
    level: editable.level.nullable(),
    openings: editable.openings.nullable(),
  })
  .partial()
  .strict()
  .refine((input) => Object.values(input).some((value) => value !== undefined), 'At least one field must be provided')
  .refine(validSalary, { path: ['salary_min'], message: 'Salary range is invalid' });

export const jobPostingIdParamSchema = z.object({ id: objectId });
export const jobPostingListQuerySchema = z.object({
  search: z.string().trim().min(1).max(JOB_LIMITS.SHORT_TEXT_MAX).optional(),
  location: z.string().trim().min(1).max(JOB_LIMITS.LOCATION_MAX).optional(),
  employment_type: z.string().trim().min(1).max(JOB_LIMITS.SHORT_TEXT_MAX).optional(),
  level: z.string().trim().min(1).max(JOB_LIMITS.SHORT_TEXT_MAX).optional(),
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
export const jobPostingResponseSchema = z.object({ id: z.string(), enterpriseId: z.string(), enterprise: jobPostingEnterpriseSummarySchema, postedByUserId: z.string(), title: z.string(), slug: z.string(), location: z.string().optional(), employmentType: z.string().optional(), salaryMin: z.number().optional(), salaryMax: z.number().optional(), salaryNegotiable: z.boolean(), currency: z.string(), level: z.string().optional(), description: z.string().optional(), requirements: z.string().optional(), benefits: z.string().optional(), openings: z.number().optional(), status: z.enum(jobPostingStatuses), recruitmentStatus: z.enum(RECRUITMENT_STATUSES), applicationCount: z.number().int().optional(), expiresAt: z.string().optional(), createdAt: z.string(), updatedAt: z.string() });
export type JobPostingResponse = z.infer<typeof jobPostingResponseSchema>;

export const jobPostingListResponseSchema = z.object({
  items: z.array(jobPostingResponseSchema),
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export type JobPostingListResponse = z.infer<typeof jobPostingListResponseSchema>;
