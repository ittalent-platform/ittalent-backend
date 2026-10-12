import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  createInterviewBodySchema,
  interviewDetailDtoSchema,
  interviewIdParamSchema,
  updateInterviewBodySchema,
} from './interviews.schemas.js';

export function registerInterviewsOpenApi(registry: OpenAPIRegistry): void {
  const registeredCreate = registry.register('CreateInterviewRequest', createInterviewBodySchema);
  const registeredUpdate = registry.register('UpdateInterviewRequest', updateInterviewBodySchema);
  const registeredDetail = registry.register('InterviewDetailDTO', interviewDetailDtoSchema);

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
