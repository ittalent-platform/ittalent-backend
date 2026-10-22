import { describe, expect, it } from 'vitest';

import { createOpenApiDocument } from '../../../src/openapi/document.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';

describe('Dashboard OpenAPI contract', () => {
  const doc = createOpenApiDocument();

  it('registers both endpoints behind the bearer token', () => {
    const company = doc.paths['/api/v1/dashboard/company']?.get;
    const platform = doc.paths['/api/v1/dashboard/platform']?.get;

    expect(company?.security).toEqual([{ bearerAuth: [] }]);
    expect(platform?.security).toEqual([{ bearerAuth: [] }]);
    expect(company?.responses[HTTP_STATUS.HTTP_200_OK]).toBeDefined();
    expect(company?.responses[HTTP_STATUS.HTTP_403_FORBIDDEN]).toBeDefined();
    expect(platform?.responses[HTTP_STATUS.HTTP_403_FORBIDDEN]).toBeDefined();
  });

  it('takes the time filter as query parameters, and no company parameter', () => {
    const parameters = (doc.paths['/api/v1/dashboard/company']?.get?.parameters ?? []) as { name: string; in: string }[];

    expect(parameters.map((parameter) => parameter.name).sort()).toEqual(['from', 'range', 'to']);
    expect(parameters.every((parameter) => parameter.in === 'query')).toBe(true);
  });

  it('describes both responses as named schemas', () => {
    expect(doc.components?.schemas?.['CompanyDashboardResponse']).toBeDefined();
    expect(doc.components?.schemas?.['PlatformOverviewResponse']).toBeDefined();
  });
});
