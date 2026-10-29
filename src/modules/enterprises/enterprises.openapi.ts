import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  createEnterpriseBodySchema,
  enterpriseDetailSchema,
  enterpriseIdParamSchema,
  enterpriseListQuerySchema,
  enterpriseListResponseSchema,
  publicEnterpriseDetailSchema,
  publicEnterpriseListQuerySchema,
  publicEnterpriseListResponseSchema,
  publicIndustryListSchema,
  updateEnterpriseBodySchema,
  updateEnterpriseStatusBodySchema,
} from './enterprises.schemas.js';

export function registerEnterprisesOpenApi(registry: OpenAPIRegistry): void {
  const registeredListResponse = registry.register('EnterpriseListResponse', enterpriseListResponseSchema);
  const registeredDetail = registry.register('EnterpriseDetailDTO', enterpriseDetailSchema);
  const registeredCreate = registry.register('CreateEnterpriseDTO', createEnterpriseBodySchema);
  const registeredUpdate = registry.register('UpdateEnterpriseDTO', updateEnterpriseBodySchema);
  const registeredUpdateStatus = registry.register('UpdateEnterpriseStatusDTO', updateEnterpriseStatusBodySchema);

  const messageResponseSchema = registry.register(
    'EnterpriseMessageResponse',
    z.object({
      message: z.string(),
    }),
  );

  // UC-ENT-01: Create an enterprise profile
  registry.registerPath({
    method: 'post',
    path: '/api/v1/enterprises',
    tags: ['Enterprises'],
    summary: 'Create an enterprise profile',
    description:
      'Creates a new enterprise profile. Authenticated recruiter or admin required. Default status is pending for recruiters and active for admins.',
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': { schema: registeredCreate },
        },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_201_CREATED]: {
        description: 'Enterprise profile created successfully',
        content: { 'application/json': { schema: registeredDetail } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Validation failed on input fields',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description: 'Forbidden: insufficient permissions',
      },
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description: 'Conflict: Tax code or email already registered, or account already owns an enterprise',
      },
    },
  });

  // UC-ENT-04: View enterprise list
  registry.registerPath({
    method: 'get',
    path: '/api/v1/enterprises',
    tags: ['Enterprises'],
    summary: 'View enterprise list / search enterprises',
    description:
      'Public for Active enterprises. Administrators can filter by any status or query all enterprises.',
    request: {
      query: enterpriseListQuerySchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Paginated list of enterprise summaries',
        content: { 'application/json': { schema: registeredListResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid or unsupported query parameters',
      },
    },
  });

  // UC-BENT-01/03: company list for applicants
  registry.registerPath({
    method: 'get',
    path: '/api/v1/enterprises/public',
    tags: ['Enterprises'],
    summary: 'Browse, search and filter companies (public)',
    description:
      'No sign-in needed. Only Active enterprises, each with card fields only (no contact or tax data) and the number of open roles. ' +
      '`keyword` matches the name, industry, city (head office or a branch), country or tech stack. `industry` and `company_size` take one value or a comma-separated list ' +
      '("Fintech,Gaming"), and an enterprise matches any of them. `location` matches a city, district or province of the head office or a branch. ' +
      'Sorted by name; `total` is the live count for the chosen filters.',
    request: { query: publicEnterpriseListQuerySchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Paginated company cards',
        content: { 'application/json': { schema: registry.register('PublicEnterpriseListResponse', publicEnterpriseListResponseSchema) } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid or unsupported query parameters' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/enterprises/public/industries',
    tags: ['Enterprises'],
    summary: 'Industries of the companies on the platform (public)',
    description: 'Active enterprises per industry, most companies first, for the Industry filter. At most 100 industries.',
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Industries with their company counts',
        content: { 'application/json': { schema: registry.register('PublicIndustryList', publicIndustryListSchema) } },
      },
    },
  });

  // UC-BENT-02: company page for applicants
  registry.registerPath({
    method: 'get',
    path: '/api/v1/enterprises/{enterpriseId}/public',
    tags: ['Enterprises'],
    summary: 'View a company page (public)',
    description:
      'No sign-in needed. Profile content only (about, tech stack, benefits, offices, website, open role count); no contact, tax or registration data. ' +
      'A company that is not Active answers 404, like one that does not exist. Its open jobs are listed by `GET /api/v1/job-postings?enterprise_id=`.',
    request: { params: enterpriseIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Public company profile',
        content: { 'application/json': { schema: registry.register('PublicEnterpriseDetail', publicEnterpriseDetailSchema) } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid enterprise ID format' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Company not found or not available' },
    },
  });

  // UC-ENT-05: View an enterprise detail
  registry.registerPath({
    method: 'get',
    path: '/api/v1/enterprises/{enterpriseId}',
    tags: ['Enterprises'],
    summary: 'View an enterprise profile detail',
    description:
      'Returns complete enterprise information. Non-active enterprises are accessible only to the owner or admins.',
    request: {
      params: enterpriseIdParamSchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Enterprise detailed profile',
        content: { 'application/json': { schema: registeredDetail } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid enterprise ID format',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Enterprise not found or not accessible',
      },
    },
  });

  // UC-17 / UC-ME-ENT-01: View my enterprise profile (direct endpoint)
  registry.registerPath({
    method: 'get',
    path: '/api/v1/enterprises/my-profile',
    tags: ['Enterprises'],
    summary: 'View authenticated user enterprise profile',
    description: 'Returns the full enterprise profile for the authenticated recruiter or owner (UC-17).',
    security: [{ bearerAuth: [] }],
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Enterprise detailed profile',
        content: { 'application/json': { schema: registeredDetail } },
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Enterprise not found or user is not affiliated with an enterprise',
      },
    },
  });

  // UC-ENT-02: Update an enterprise profile information
  registry.registerPath({
    method: 'patch',
    path: '/api/v1/enterprises/{enterpriseId}',
    tags: ['Enterprises'],
    summary: 'Update an enterprise profile information',
    description:
      'Updates company details. Accessible only by the enterprise owner (Recruiter) or a System Administrator.',
    security: [{ bearerAuth: [] }],
    request: {
      params: enterpriseIdParamSchema,
      body: {
        content: {
          'application/json': { schema: registeredUpdate },
        },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Enterprise profile updated successfully',
        content: { 'application/json': { schema: registeredDetail } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Validation failed on updated fields',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description: 'Forbidden: not authorized to modify this enterprise profile',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Enterprise not found',
      },
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description: 'Conflict: Email or tax code already registered by another enterprise',
      },
    },
  });

  // UC-ENT-03: Update an enterprise status
  registry.registerPath({
    method: 'patch',
    path: '/api/v1/enterprises/{enterpriseId}/status',
    tags: ['Enterprises'],
    summary: "Update an enterprise's lifecycle status",
    description:
      'Transitions enterprise status (pending, active, suspended, rejected, inactive). Exclusive to System Administrator. Justification reason mandatory for suspended and rejected statuses.',
    security: [{ bearerAuth: [] }],
    request: {
      params: enterpriseIdParamSchema,
      body: {
        content: {
          'application/json': { schema: registeredUpdateStatus },
        },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Enterprise status updated successfully',
        content: { 'application/json': { schema: registeredDetail } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid status transition or missing mandatory reason',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description: 'Forbidden: System Administrator access required',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Enterprise not found',
      },
    },
  });

  // UC-ENT-06: Delete enterprise profile
  registry.registerPath({
    method: 'delete',
    path: '/api/v1/enterprises/{enterpriseId}',
    tags: ['Enterprises'],
    summary: 'Delete enterprise profile (Soft delete)',
    description:
      'Soft-deletes an enterprise profile. Exclusive to System Administrator. Fails if the enterprise currently has published active jobs.',
    security: [{ bearerAuth: [] }],
    request: {
      params: enterpriseIdParamSchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Enterprise profile deleted successfully',
        content: { 'application/json': { schema: messageResponseSchema } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Cannot delete enterprise with active job postings',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description: 'Forbidden: System Administrator access required',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Enterprise not found',
      },
    },
  });
}