import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  createInterviewBodySchema,
  interviewCalendarQuerySchema,
  interviewCalendarResponseSchema,
  interviewDetailDtoSchema,
  interviewIdParamSchema,
  interviewListQuerySchema,
  interviewListResponseSchema,
  interviewLookupQuerySchema,
  interviewerListResponseSchema,
  schedulableApplicationListResponseSchema,
  updateInterviewBodySchema,
  updateInterviewStatusBodySchema,
} from './interviews.schemas.js';

export function registerInterviewsOpenApi(registry: OpenAPIRegistry): void {
  const registeredCreate = registry.register('CreateInterviewRequest', createInterviewBodySchema);
  const registeredUpdate = registry.register('UpdateInterviewRequest', updateInterviewBodySchema);
  const registeredStatus = registry.register('UpdateInterviewStatusRequest', updateInterviewStatusBodySchema);
  const registeredDetail = registry.register('InterviewDetailDTO', interviewDetailDtoSchema);
  const registeredList = registry.register('InterviewListResponse', interviewListResponseSchema);
  const registeredCalendar = registry.register('InterviewCalendarResponse', interviewCalendarResponseSchema);
  const registeredApplications = registry.register('SchedulableApplicationListResponse', schedulableApplicationListResponseSchema);
  const registeredInterviewers = registry.register('InterviewerListResponse', interviewerListResponseSchema);

  const authErrors = {
    [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
    [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Forbidden: wrong role, or the account is not assigned to an enterprise' },
  };
  const notFound = {
    [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
      description: 'Interview not found, or it belongs to another enterprise',
    },
  };

  registry.registerPath({
    method: 'post',
    path: '/api/v1/interviews',
    tags: ['Interviews'],
    summary: 'Schedule an interview',
    description:
      'Recruiter only. Schedules an interview between the applicant of one application and one or more interviewers (active ' +
      'recruiters of the same enterprise), then emails the applicant and every interviewer. The time must be in the future and ' +
      'must not overlap another scheduled interview of the applicant or of any interviewer. An online interview needs ' +
      'a https `meetingLink`, an onsite one a `location`. The application status is not changed.',
    security: [{ bearerAuth: [] }],
    request: { body: { required: true, content: { 'application/json': { schema: registeredCreate } } } },
    responses: {
      [HTTP_STATUS.HTTP_201_CREATED]: { description: 'Interview scheduled', content: { 'application/json': { schema: registeredDetail } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Validation failed, time in the past, or an interviewer is not eligible' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Application not found or not part of the recruiter\'s enterprise' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description: 'APPLICATION_NOT_SCHEDULABLE, APPLICANT_UNAVAILABLE, INTERVIEWER_CONFLICT or APPLICANT_CONFLICT',
      },
      ...authErrors,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/interviews',
    tags: ['Interviews'],
    summary: 'List interviews (List view) with search, filters, sorting and pagination',
    description:
      'Recruiter only: every interview of the recruiter\'s enterprise. ' +
      'Filters: `status` (one value or a comma-separated list), `mode`, `jobId`, `applicationId`, `interviewerId`, ' +
      '`from`/`to` on the start time, and `search` on the applicant or interviewer name/email and the job title. ' +
      'Sorted by start time, earliest first, by default.',
    security: [{ bearerAuth: [] }],
    request: { query: interviewListQuerySchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Paginated interviews', content: { 'application/json': { schema: registeredList } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid or contradictory filter, sort or paging values' },
      ...authErrors,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/interviews/calendar',
    tags: ['Interviews'],
    summary: 'List interviews for a date window (Calendar view)',
    description:
      'Same access and filters as the list, but `from` and `to` are required (at most 62 days apart) and every interview ' +
      'overlapping that window is returned, earliest first, without paging. `truncated` is true when more interviews ' +
      'matched than the response holds.',
    security: [{ bearerAuth: [] }],
    request: { query: interviewCalendarQuerySchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Interviews in the window', content: { 'application/json': { schema: registeredCalendar } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Missing window, from after to, or a window longer than 62 days' },
      ...authErrors,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/interviews/applications',
    tags: ['Interviews'],
    summary: 'Find the applications an interview can be scheduled for',
    description:
      'Recruiter only. The submitted, under review and interviewing applications for the jobs of the recruiter\'s ' +
      'enterprise, newest first. `search` matches the applicant name/email and the job title; `limit` defaults to 20 (max 50). ' +
      'Feeds the "Select application" field of the Schedule interview dialog.',
    security: [{ bearerAuth: [] }],
    request: { query: interviewLookupQuerySchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Matching applications', content: { 'application/json': { schema: registeredApplications } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid search or limit' },
      ...authErrors,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/interviews/interviewers',
    tags: ['Interviews'],
    summary: 'Find the recruiters who can be added as interviewers',
    description:
      'Recruiter only. The active recruiters of the recruiter\'s enterprise (the caller included), sorted by name. ' +
      '`search` matches the name, email and username; `limit` defaults to 20 (max 50). ' +
      'Resolves the interviewer emails of the Schedule interview dialog to the ids the create and update endpoints take.',
    security: [{ bearerAuth: [] }],
    request: { query: interviewLookupQuerySchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Matching recruiters', content: { 'application/json': { schema: registeredInterviewers } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid search or limit' },
      ...authErrors,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/interviews/{id}',
    tags: ['Interviews'],
    summary: 'View an interview',
    description: 'Recruiter only. Includes the applicant, the interviewers, the job and the status history.',
    security: [{ bearerAuth: [] }],
    request: { params: interviewIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Interview detail', content: { 'application/json': { schema: registeredDetail } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid interview ID' },
      ...notFound,
      ...authErrors,
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/interviews/{id}',
    tags: ['Interviews'],
    summary: 'Update the information of a scheduled interview',
    description:
      'Recruiter only, and only while the interview is `scheduled`. Send only the fields to change; `null` clears ' +
      '`meetingLink`, `location` or `notes`. A new time must be in the future and overlap nothing else. ' +
      'The participants are emailed the new details, and interviewers who were removed are told it no longer involves them.',
    security: [{ bearerAuth: [] }],
    request: {
      params: interviewIdParamSchema,
      body: { required: true, content: { 'application/json': { schema: registeredUpdate } } },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Interview updated', content: { 'application/json': { schema: registeredDetail } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Validation failed, time in the past, or an interviewer is not eligible' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description: 'INTERVIEW_NOT_EDITABLE, INTERVIEWER_CONFLICT, APPLICANT_CONFLICT or INTERVIEW_STATE_CHANGED',
      },
      ...notFound,
      ...authErrors,
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/interviews/{id}/status',
    tags: ['Interviews'],
    summary: 'Update the status of a scheduled interview',
    description:
      'Recruiter only. A scheduled interview becomes `completed`, `no_show` or `cancelled`; those statuses are final. ' +
      '`completed` and `no_show` are only accepted once the interview has ended (409 INTERVIEW_NOT_ENDED before). ' +
      '`cancelled` is accepted at any time and emails the participants.',
    security: [{ bearerAuth: [] }],
    request: {
      params: interviewIdParamSchema,
      body: { required: true, content: { 'application/json': { schema: registeredStatus } } },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Status updated', content: { 'application/json': { schema: registeredDetail } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Unsupported status or invalid note' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'INTERVIEW_STATUS_FINAL, INTERVIEW_NOT_ENDED or INTERVIEW_STATE_CHANGED' },
      ...notFound,
      ...authErrors,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/interviews/{id}',
    tags: ['Interviews'],
    summary: 'Delete an interview',
    description:
      'Recruiter only. A completed interview cannot be deleted. Deleting an interview that was still scheduled emails ' +
      'the participants that it is cancelled.',
    security: [{ bearerAuth: [] }],
    request: { params: interviewIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_204_NO_CONTENT]: { description: 'Interview deleted' },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid interview ID' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'INTERVIEW_COMPLETED or INTERVIEW_STATE_CHANGED' },
      ...notFound,
      ...authErrors,
    },
  });
}
