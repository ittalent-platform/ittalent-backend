import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  interviewIdParamSchema,
  interviewResponseBodySchema,
  interviewResponseSchema,
} from './interviews.schemas.js';

export function registerInterviewsOpenApi(registry: OpenAPIRegistry): void {
  const body = registry.register(
    'InterviewResponseRequest',
    interviewResponseBodySchema,
  );
  const response = registry.register(
    'InterviewResponse',
    interviewResponseSchema,
  );
  registry.registerPath({
    method: 'patch',
    path: '/api/v1/interviews/{id}/respond',
    tags: ['Interviews'],
    summary: 'Respond to an owned interview schedule',
    description:
      'A candidate may accept, decline, or request rescheduling exactly once while the interview is scheduled and awaiting a response.',
    security: [{ bearerAuth: [] }],
    request: {
      params: interviewIdParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: body } },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Interview response recorded',
        content: { 'application/json': { schema: response } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid response payload',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description: 'Candidate role required',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Owned interview not found',
      },
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description: 'Interview is not awaiting a response',
      },
    },
  });
}
