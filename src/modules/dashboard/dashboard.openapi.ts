import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { DASHBOARD_ERROR_CODES } from './dashboard.constants.js';
import {
  companyDashboardQuerySchema,
  companyDashboardResponseSchema,
  platformOverviewResponseSchema,
} from './dashboard.schemas.js';

export function registerDashboardOpenApi(registry: OpenAPIRegistry): void {
  const registeredCompany = registry.register('CompanyDashboardResponse', companyDashboardResponseSchema);
  const registeredPlatform = registry.register('PlatformOverviewResponse', platformOverviewResponseSchema);

  registry.registerPath({
    method: 'get',
    path: '/api/v1/dashboard/company',
    tags: ['Dashboard'],
    summary: 'Statistics of the caller\'s company for one period',
    description:
      'HR (`recruiter`) and `enterprise_admin`. The company is always the caller\'s own; there is no company parameter. ' +
      'Every date is a whole calendar day in Vietnam time (UTC+7) and `to` is included. A preset ends yesterday; ' +
      '`custom` needs `from` and `to` (at most 366 days, and it may reach into the future, which counts as zero). ' +
      'Applications are counted by the day they were received, jobs by the day they were created and interviews by the day ' +
      'they start; each is grouped by the status it has now. The response is one document built in a single request: it is ' +
      'complete or it is an error, never partial.',
    security: [{ bearerAuth: [] }],
    request: { query: companyDashboardQuerySchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Statistics of the period', content: { 'application/json': { schema: registeredCompany } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Unknown date, "to" before "from", more than 366 days, or "from"/"to" without a custom range' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required, or the session was revoked' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description:
          `Wrong role; or the account is not a member of a company (${DASHBOARD_ERROR_CODES.NOT_A_MEMBER}); ` +
          `or the company is not active (${DASHBOARD_ERROR_CODES.COMPANY_NOT_ACTIVE})`,
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/dashboard/platform',
    tags: ['Dashboard'],
    summary: 'Overview of the platform',
    description:
      'System admin only. Accounts by role and status, new accounts per week, companies and the sign-ups waiting for review. ' +
      'It never contains a company\'s jobs, applications or interviews.',
    security: [{ bearerAuth: [] }],
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Platform overview', content: { 'application/json': { schema: registeredPlatform } } },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required, or the session was revoked' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Only system admins' },
    },
  });
}
