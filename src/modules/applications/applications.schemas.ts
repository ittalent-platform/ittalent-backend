import { z } from 'zod';

import { objectIdSchema } from '../../shared/schemas/object-id.schema.js';
import { APPLICATION_CONFIG } from './applications.constants.js';

// strictObject: the client cannot smuggle in fields such as applicant_id or status (BR-7).
export const createApplicationBodySchema = z.strictObject({
  jobPostingId: objectIdSchema('job posting ID'),
  cvId: objectIdSchema('CV ID'),
  coverLetterId: objectIdSchema('cover letter ID').optional(),
  message: z
    .string()
    .trim()
    .max(APPLICATION_CONFIG.MESSAGE_MAX_LENGTH, `Message cannot exceed ${APPLICATION_CONFIG.MESSAGE_MAX_LENGTH} characters`)
    .optional(),
});

export type CreateApplicationBody = z.infer<typeof createApplicationBodySchema>;

export const applicationDtoSchema = z.object({
  id: z.string(),
  jobPostingId: z.string(),
  status: z.string(),
  cvId: z.string(),
  coverLetterId: z.string().nullable(),
  message: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ApplicationDTO = z.infer<typeof applicationDtoSchema>;