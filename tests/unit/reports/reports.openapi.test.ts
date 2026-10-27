import { describe, expect, it } from 'vitest';

import { createOpenApiDocument } from '../../../src/openapi/document.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';

describe('Reports OpenAPI Contract', () => {
  it('registers all candidate report endpoints in OpenAPI specification', () => {
    const document = createOpenApiDocument();
    const paths = document.paths;

    expect(paths['/api/v1/me/reports']?.post).toBeDefined();
    expect(paths['/api/v1/me/reports']?.get).toBeDefined();
    expect(paths['/api/v1/me/reports/{id}']?.get).toBeDefined();
    expect(paths['/api/v1/me/reports/{id}/withdraw']?.post).toBeDefined();
    expect(paths['/api/v1/me/reports/{id}/hide']?.post).toBeDefined();

    const postReport = paths['/api/v1/me/reports']?.post;
    expect(postReport?.responses[HTTP_STATUS.HTTP_201_CREATED]).toBeDefined();

    const getReports = paths['/api/v1/me/reports']?.get;
    expect(getReports?.responses[HTTP_STATUS.HTTP_200_OK]).toBeDefined();

    const getDetail = paths['/api/v1/me/reports/{id}']?.get;
    expect(getDetail?.responses[HTTP_STATUS.HTTP_200_OK]).toBeDefined();

    const withdrawReport = paths['/api/v1/me/reports/{id}/withdraw']?.post;
    expect(withdrawReport?.responses[HTTP_STATUS.HTTP_200_OK]).toBeDefined();
    expect(withdrawReport?.responses[HTTP_STATUS.HTTP_409_CONFLICT]).toBeDefined();

    const hideReport = paths['/api/v1/me/reports/{id}/hide']?.post;
    expect(hideReport?.responses[HTTP_STATUS.HTTP_200_OK]).toBeDefined();
    expect(hideReport?.responses[HTTP_STATUS.HTTP_400_BAD_REQUEST]).toBeDefined();
  });
});
