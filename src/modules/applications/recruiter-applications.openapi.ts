import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { applicationIdParamSchema } from './applications.schemas.js';
import {
  recruiterApplicationCvMetadataDtoSchema,
  recruiterApplicationDetailDtoSchema,
  recruiterApplicationListQuerySchema,
  recruiterApplicationListResponseSchema,
  recruiterApplicationSummaryDtoSchema,
  recruiterAttachmentDtoSchema,
  recruiterInterviewTimelineEntrySchema,
  recruiterNextInterviewDtoSchema,
  recruiterNoteEntryDtoSchema,
  recruiterStatusHistoryEntryDtoSchema,
} from './recruiter-applications.schemas.js';

export function registerRecruiterApplicationsOpenApi(
  registry: OpenAPIRegistry,
): void {
  registry.register('RecruiterNextInterviewDTO', recruiterNextInterviewDtoSchema);
  registry.register(
    'RecruiterApplicationSummaryDTO',
    recruiterApplicationSummaryDtoSchema,
  );
  const registeredListResponse = registry.register(
    'RecruiterApplicationListResponse',
    recruiterApplicationListResponseSchema,
  );

  registry.register('RecruiterAttachmentDTO', recruiterAttachmentDtoSchema);
  registry.register(
    'RecruiterInterviewTimelineEntryDTO',
    recruiterInterviewTimelineEntrySchema,
  );
  registry.register('RecruiterNoteEntryDTO', recruiterNoteEntryDtoSchema);
  registry.register(
    'RecruiterStatusHistoryEntryDTO',
    recruiterStatusHistoryEntryDtoSchema,
  );

  const registeredDetailResponse = registry.register(
    'RecruiterApplicationDetailDTO',
    recruiterApplicationDetailDtoSchema,
  );

  const registeredCvMetadata = registry.register(
    'RecruiterApplicationCvMetadataDTO',
    recruiterApplicationCvMetadataDtoSchema,
  );

  registry.registerPath({
    method: 'get',
    path: '/api/v1/recruiter/applications',
    tags: ['Recruiter Applications'],
    summary: 'View applicant application list (with search, filter, and board counts)',
    description:
      'Recruiter and Enterprise Admin only. Returns paginated applicant applications submitted ' +
      'to job postings owned by the caller\'s enterprise. Supports keyword search across applicant name/email, ' +
      'job title, or application ID, multi-status filters, document type filters, and submission date ranges.',
    security: [{ bearerAuth: [] }],
    request: {
      query: recruiterApplicationListQuerySchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Paginated recruiter applications list with status counts',
        content: { 'application/json': { schema: registeredListResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Validation failed (e.g. invalid status name, malformed ObjectId, or invalid date range)',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description:
          'Caller is not a recruiter/enterprise administrator or lacks active enterprise assignment',
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/recruiter/applications/{id}',
    tags: ['Recruiter Applications'],
    summary: 'View applicant application detail',
    description:
      'Recruiter and Enterprise Admin only. Returns comprehensive candidate application details ' +
      'including job context snapshot, candidate profile, submitted documents, interview history, notes, ' +
      'and full status audit timeline. Returns opaque 404 if application not found or belongs to another company.',
    security: [{ bearerAuth: [] }],
    request: {
      params: applicationIdParamSchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Complete recruiter application details',
        content: { 'application/json': { schema: registeredDetailResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Malformed application ID parameter',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description:
          'Caller is not a recruiter/enterprise administrator or lacks active enterprise assignment',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Application not found or inaccessible (opaque 404)',
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/recruiter/applications/{id}/cv',
    tags: ['Recruiter Applications'],
    summary: 'Download applicant CV',
    description:
      'Recruiter and Enterprise Admin only. Delivers the attached CV file stream or metadata for candidate evaluation. ' +
      'Returns opaque 404 if application not found, belongs to another company, or CV deleted.',
    security: [{ bearerAuth: [] }],
    request: {
      params: applicationIdParamSchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Binary CV file stream or metadata object',
        content: {
          'application/pdf': { schema: { type: 'string', format: 'binary' } },
          'application/json': { schema: registeredCvMetadata },
        },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Malformed application ID parameter',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description:
          'Caller is not a recruiter/enterprise administrator or lacks active enterprise assignment',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Application or CV not found (opaque 404)',
      },
    },
  });
}
