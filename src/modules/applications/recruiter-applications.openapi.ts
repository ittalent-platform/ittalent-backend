import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { applicationIdParamSchema } from './applications.schemas.js';
import {
  createRecruiterNoteBodySchema,
  recruiterApplicationCvMetadataDtoSchema,
  recruiterApplicationDetailDtoSchema,
  recruiterApplicationListQuerySchema,
  recruiterApplicationListResponseSchema,
  recruiterApplicationSummaryDtoSchema,
  recruiterAttachmentDtoSchema,
  recruiterInterviewTimelineEntrySchema,
  recruiterApplicantCompanyHistoryResponseSchema,
  recruiterCompanyApplicationHistoryItemDtoSchema,
  recruiterNextInterviewDtoSchema,
  recruiterNoteEntryDtoSchema,
  recruiterNotesListResponseSchema,
  recruiterStatusHistoryEntryDtoSchema,
  updateRecruiterApplicationStatusBodySchema,
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
  const registeredNoteEntry = registry.register(
    'RecruiterNoteEntryDTO',
    recruiterNoteEntryDtoSchema,
  );
  registry.register(
    'RecruiterStatusHistoryEntryDTO',
    recruiterStatusHistoryEntryDtoSchema,
  );

  const registeredCreateNoteBody = registry.register(
    'CreateRecruiterNoteBody',
    createRecruiterNoteBodySchema,
  );

  const registeredNotesListResponse = registry.register(
    'RecruiterNotesListResponse',
    recruiterNotesListResponseSchema,
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

  registry.registerPath({
    method: 'post',
    path: '/api/v1/recruiter/applications/{id}/notes',
    tags: ['Recruiter Applications'],
    summary: 'Add internal recruiter note to application',
    description:
      'Recruiter and Enterprise Admin only. Appends an internal note visible to hiring team members for the specified application. ' +
      'Author attribution is securely derived from the authenticated recruiter session. ' +
      'Enforces strict enterprise data isolation (opaque 404).',
    security: [{ bearerAuth: [] }],
    request: {
      params: applicationIdParamSchema,
      body: {
        content: {
          'application/json': { schema: registeredCreateNoteBody },
        },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_201_CREATED]: {
        description: 'Internal note successfully appended',
        content: { 'application/json': { schema: registeredNoteEntry } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Validation failed (e.g. malformed ObjectId, empty or >2000 characters note content)',
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
    path: '/api/v1/recruiter/applications/{id}/notes',
    tags: ['Recruiter Applications'],
    summary: 'List internal recruiter notes for application',
    description:
      'Recruiter and Enterprise Admin only. Returns chronological internal notes recorded by hiring team members for this candidate application. ' +
      'Enforces strict enterprise data isolation (opaque 404).',
    security: [{ bearerAuth: [] }],
    request: {
      params: applicationIdParamSchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Chronological list of internal notes',
        content: { 'application/json': { schema: registeredNotesListResponse } },
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

  const registeredUpdateStatusBody = registry.register(
    'UpdateRecruiterApplicationStatusBody',
    updateRecruiterApplicationStatusBodySchema,
  );

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/recruiter/applications/{id}/status',
    tags: ['Recruiter Applications'],
    summary: 'Update applicant application status workflow',
    description:
      'Recruiter and Enterprise Admin only. Advances application through hiring stages (under_review, interviewing, offered, hired) ' +
      'or rejects (rejected). Enforces forward progression (BR-17), interview prerequisites (BR-37), vacancy limit checks (BR-18, EX5), ' +
      'auto-closing job posting and cascading position_filled when final opening is filled, and logs audit history (BR-24). ' +
      'Enforces strict enterprise data isolation (opaque 404).',
    security: [{ bearerAuth: [] }],
    request: {
      params: applicationIdParamSchema,
      body: {
        content: {
          'application/json': { schema: registeredUpdateStatusBody },
        },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Application status successfully updated',
        content: { 'application/json': { schema: registeredDetailResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description:
          'Validation failed (e.g. invalid target status, non-permitted transition, missing interview prerequisite, or rejection reason out of bounds)',
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
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description:
          'Vacancy limit reached (cannot hire more applicants than job openings) or optimistic concurrency conflict',
      },
    },
  });

  registry.register(
    'RecruiterCompanyApplicationHistoryItemDTO',
    recruiterCompanyApplicationHistoryItemDtoSchema,
  );
  const registeredCompanyHistoryResponse = registry.register(
    'RecruiterApplicantCompanyHistoryResponse',
    recruiterApplicantCompanyHistoryResponseSchema,
  );

  registry.registerPath({
    method: 'get',
    path: '/api/v1/recruiter/applications/{id}/company-history',
    tags: ['Recruiter Applications'],
    summary: 'View candidate cross-job application history for company',
    description:
      'Recruiter and Enterprise Admin only. Returns chronological history of all applications submitted by the candidate ' +
      'across all job postings published by the caller\'s enterprise. Enforces strict multi-tenant candidate data privacy ' +
      '(submissions to competitor companies remain hidden). Indicates if candidate is a first-time applicant (UC-S2-AA-07, BR-06).',
    security: [{ bearerAuth: [] }],
    request: {
      params: applicationIdParamSchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Candidate cross-job company application history',
        content: { 'application/json': { schema: registeredCompanyHistoryResponse } },
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
}

