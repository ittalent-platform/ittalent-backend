import { z } from 'zod';

import { objectIdSchema } from '../../shared/schemas/object-id.schema.js';
import { paginatedResponseSchema, paginationQuerySchema } from '../../shared/schemas/pagination.schema.js';

export const jobPostingIdParamSchema = z.object({
  jobPostingId: objectIdSchema('job posting ID'),
});

export type JobPostingIdParam = z.infer<typeof jobPostingIdParamSchema>;

// Only pagination for now. Search/filter keys are intentionally rejected until they are implemented (BR-2).
export const jobPostingListQuerySchema = paginationQuerySchema;

export type JobPostingListQuery = z.infer<typeof jobPostingListQuerySchema>;

export const jobPostingSummarySchema = z.object({
  id: z.string(),
  enterpriseId: z.string(),
  title: z.string(),
  location: z.string().nullable(),
  employmentType: z.string().nullable(),
  level: z.string().nullable(),
  salaryMin: z.number().nullable(),
  salaryMax: z.number().nullable(),
  currency: z.string().nullable(),
  postedAt: z.string(),
});

export type JobPostingSummaryDTO = z.infer<typeof jobPostingSummarySchema>;

export const jobPostingDetailSchema = jobPostingSummarySchema.extend({
  description: z.string().nullable(),
  requirements: z.string().nullable(),
  benefits: z.string().nullable(),
  openings: z.number(),
  deadline: z.string().nullable(),
});

export type JobPostingDetailDTO = z.infer<typeof jobPostingDetailSchema>;

export const jobPostingListResponseSchema = paginatedResponseSchema(jobPostingSummarySchema);

export type JobPostingListResponse = z.infer<typeof jobPostingListResponseSchema>;