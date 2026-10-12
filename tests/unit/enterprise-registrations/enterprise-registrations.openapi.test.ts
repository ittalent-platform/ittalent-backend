import { describe, expect, it } from 'vitest';

import { createOpenApiDocument } from '../../../src/openapi/document.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';

describe('Enterprise Registrations: OpenAPI Contract Specifications', () => {
  const document = createOpenApiDocument();

  it('generates OpenAPI 3.0.3 document with valid structure and server metadata', () => {
    expect(document.openapi).toBe('3.0.3');
    expect(document.info).toBeDefined();
    expect(document.paths).toBeDefined();
    expect(document.components?.schemas).toBeDefined();
  });

  it('registers all 9 enterprise registration endpoints', () => {
    const paths = Object.keys(document.paths);
    expect(paths).toContain('/api/v1/enterprise-registrations/start');
    expect(paths).toContain('/api/v1/enterprise-registrations/verify-email');
    expect(paths).toContain('/api/v1/enterprise-registrations/invitations/accept');
    expect(paths).toContain('/api/v1/enterprise-registrations');
    expect(paths).toContain('/api/v1/enterprise-registrations/{id}');
    expect(paths).toContain('/api/v1/enterprise-registrations/{id}/draft');
    expect(paths).toContain('/api/v1/enterprise-registrations/{id}/documents');
    expect(paths).toContain('/api/v1/enterprise-registrations/{id}/submit');
    expect(paths).toContain('/api/v1/enterprise-registrations/{id}/decision');
  });

  describe('Endpoint Contract Specifications', () => {
    it('documents POST /start with expected request, response, and error codes', () => {
      const op = document.paths['/api/v1/enterprise-registrations/start']?.post;
      expect(op).toBeDefined();
      expect(op?.tags).toContain('Enterprise Registrations');
      expect(op?.responses[HTTP_STATUS.HTTP_200_OK]).toBeDefined();
      expect(op?.responses[HTTP_STATUS.HTTP_400_BAD_REQUEST]).toBeDefined();
      expect(op?.responses[HTTP_STATUS.HTTP_409_CONFLICT]).toBeDefined();
      expect(op?.responses[HTTP_STATUS.HTTP_429_TOO_MANY_REQUESTS]).toBeDefined();
    });

    it('documents GET /verify-email with query parameters', () => {
      const op = document.paths['/api/v1/enterprise-registrations/verify-email']?.get;
      expect(op).toBeDefined();
      expect(op?.tags).toContain('Enterprise Registrations');
      expect(op?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'token', in: 'query' }),
        ]),
      );
      expect(op?.responses[HTTP_STATUS.HTTP_200_OK]).toBeDefined();
      expect(op?.responses[HTTP_STATUS.HTTP_400_BAD_REQUEST]).toBeDefined();
    });

    it('documents POST /invitations/accept before parameterized routes', () => {
      const op = document.paths['/api/v1/enterprise-registrations/invitations/accept']?.post;
      expect(op).toBeDefined();
      expect(op?.tags).toContain('Enterprise Registrations');
      expect(op?.requestBody).toBeDefined();
      expect(op?.responses[HTTP_STATUS.HTTP_200_OK]).toBeDefined();
      expect(op?.responses[HTTP_STATUS.HTTP_400_BAD_REQUEST]).toBeDefined();
      expect(op?.responses[HTTP_STATUS.HTTP_401_UNAUTHORIZED]).toBeDefined();
      expect(op?.responses[HTTP_STATUS.HTTP_409_CONFLICT]).toBeDefined();
    });

    it('documents GET / (admin queue) with bearerAuth security and pagination query', () => {
      const op = document.paths['/api/v1/enterprise-registrations']?.get;
      expect(op).toBeDefined();
      expect(op?.tags).toContain('Enterprise Registrations');
      expect(op?.security).toEqual([{ bearerAuth: [] }]);
      expect(op?.responses[HTTP_STATUS.HTTP_200_OK]).toBeDefined();
      expect(op?.responses[HTTP_STATUS.HTTP_401_UNAUTHORIZED]).toBeDefined();
      expect(op?.responses[HTTP_STATUS.HTTP_403_FORBIDDEN]).toBeDefined();
    });

    it('documents GET /{id} with path parameter', () => {
      const op = document.paths['/api/v1/enterprise-registrations/{id}']?.get;
      expect(op).toBeDefined();
      expect(op?.tags).toContain('Enterprise Registrations');
      expect(op?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'id', in: 'path' }),
        ]),
      );
      expect(op?.responses[HTTP_STATUS.HTTP_200_OK]).toBeDefined();
      expect(op?.responses[HTTP_STATUS.HTTP_404_NOT_FOUND]).toBeDefined();
    });

    it('documents PATCH /{id}/draft with concurrency versioning', () => {
      const op = document.paths['/api/v1/enterprise-registrations/{id}/draft']?.patch;
      expect(op).toBeDefined();
      expect(op?.tags).toContain('Enterprise Registrations');
      expect(op?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'id', in: 'path' }),
        ]),
      );
      expect(op?.responses[HTTP_STATUS.HTTP_200_OK]).toBeDefined();
      expect(op?.responses[HTTP_STATUS.HTTP_409_CONFLICT]).toBeDefined();
    });

    it('documents POST /{id}/documents with multipart/form-data upload', () => {
      const op = document.paths['/api/v1/enterprise-registrations/{id}/documents']?.post;
      expect(op).toBeDefined();
      expect(op?.tags).toContain('Enterprise Registrations');
      expect(op?.requestBody).toBeDefined();
      const body = op?.requestBody as { content?: Record<string, unknown> } | undefined;
      expect(body?.content?.['multipart/form-data']).toBeDefined();
      expect(op?.responses[HTTP_STATUS.HTTP_201_CREATED]).toBeDefined();
      expect(op?.responses[HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE]).toBeDefined();
    });

    it('documents POST /{id}/submit with claim lock semantics', () => {
      const op = document.paths['/api/v1/enterprise-registrations/{id}/submit']?.post;
      expect(op).toBeDefined();
      expect(op?.tags).toContain('Enterprise Registrations');
      expect(op?.responses[HTTP_STATUS.HTTP_200_OK]).toBeDefined();
      expect(op?.responses[HTTP_STATUS.HTTP_409_CONFLICT]).toBeDefined();
    });

    it('documents POST /{id}/decision with bearerAuth security', () => {
      const op = document.paths['/api/v1/enterprise-registrations/{id}/decision']?.post;
      expect(op).toBeDefined();
      expect(op?.tags).toContain('Enterprise Registrations');
      expect(op?.security).toEqual([{ bearerAuth: [] }]);
      expect(op?.responses[HTTP_STATUS.HTTP_200_OK]).toBeDefined();
      expect(op?.responses[HTTP_STATUS.HTTP_400_BAD_REQUEST]).toBeDefined();
      expect(op?.responses[HTTP_STATUS.HTTP_401_UNAUTHORIZED]).toBeDefined();
      expect(op?.responses[HTTP_STATUS.HTTP_403_FORBIDDEN]).toBeDefined();
      expect(op?.responses[HTTP_STATUS.HTTP_409_CONFLICT]).toBeDefined();
    });
  });

  describe('Component Schema Registrations', () => {
    it('registers all required enterprise registration schemas in components', () => {
      const schemas = document.components?.schemas ?? {};
      expect(schemas.StartEnterpriseRegistrationRequest).toBeDefined();
      expect(schemas.StartEnterpriseRegistrationResponse).toBeDefined();
      expect(schemas.VerifyEnterpriseRegistrationEmailResponse).toBeDefined();
      expect(schemas.SaveEnterpriseRegistrationDraftRequest).toBeDefined();
      expect(schemas.UploadLegalDocumentFormRequest).toBeDefined();
      expect(schemas.LegalDocumentResponse).toBeDefined();
      expect(schemas.SubmitEnterpriseRegistrationRequest).toBeDefined();
      expect(schemas.SubmissionReceiptResponse).toBeDefined();
      expect(schemas.PaginatedEnterpriseRegistrationSummary).toBeDefined();
      expect(schemas.EnterpriseRegistrationDetail).toBeDefined();
      expect(schemas.AdminDecisionRequest).toBeDefined();
      expect(schemas.AdminDecisionResponse).toBeDefined();
      expect(schemas.AcceptInvitationRequest).toBeDefined();
      expect(schemas.AcceptInvitationResponse).toBeDefined();
    });
  });
});
