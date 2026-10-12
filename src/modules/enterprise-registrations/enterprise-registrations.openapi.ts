import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  acceptInvitationBodySchema,
  acceptInvitationResponseSchema,
  adminDecisionBodySchema,
  adminDecisionResponseSchema,
  paginatedRegistrationSummarySchema,
  registrationDetailSchema,
  registrationIdParamSchema,
  registrationListQuerySchema,
  saveDraftBodySchema,
  startRegistrationBodySchema,
  startRegistrationResponseSchema,
  submissionReceiptResponseSchema,
  submitRegistrationBodySchema,
  uploadLegalDocumentFormSchema,
  verifyEmailQuerySchema,
  verifyEmailResponseSchema,
  legalDocumentResponseSchema,
} from './enterprise-registrations.schemas.js';

export function registerEnterpriseRegistrationsOpenApi(registry: OpenAPIRegistry): void {
  const registeredStartRequest = registry.register(
    'StartEnterpriseRegistrationRequest',
    startRegistrationBodySchema,
  );
  const registeredStartResponse = registry.register(
    'StartEnterpriseRegistrationResponse',
    startRegistrationResponseSchema,
  );

  const registeredVerifyResponse = registry.register(
    'VerifyEnterpriseRegistrationEmailResponse',
    verifyEmailResponseSchema,
  );

  const registeredSaveDraftRequest = registry.register(
    'SaveEnterpriseRegistrationDraftRequest',
    saveDraftBodySchema,
  );

  const registeredUploadFormRequest = registry.register(
    'UploadLegalDocumentFormRequest',
    uploadLegalDocumentFormSchema,
  );
  const registeredLegalDocResponse = registry.register(
    'LegalDocumentResponse',
    legalDocumentResponseSchema,
  );

  const registeredSubmitRequest = registry.register(
    'SubmitEnterpriseRegistrationRequest',
    submitRegistrationBodySchema,
  );
  const registeredSubmitReceiptResponse = registry.register(
    'SubmissionReceiptResponse',
    submissionReceiptResponseSchema,
  );

  const registeredPaginatedSummary = registry.register(
    'PaginatedEnterpriseRegistrationSummary',
    paginatedRegistrationSummarySchema,
  );
  const registeredDetail = registry.register(
    'EnterpriseRegistrationDetail',
    registrationDetailSchema,
  );

  const registeredAdminDecisionRequest = registry.register(
    'AdminDecisionRequest',
    adminDecisionBodySchema,
  );
  const registeredAdminDecisionResponse = registry.register(
    'AdminDecisionResponse',
    adminDecisionResponseSchema,
  );

  const registeredAcceptInviteRequest = registry.register(
    'AcceptInvitationRequest',
    acceptInvitationBodySchema,
  );
  const registeredAcceptInviteResponse = registry.register(
    'AcceptInvitationResponse',
    acceptInvitationResponseSchema,
  );

  // 1. POST /api/v1/enterprise-registrations/start
  registry.registerPath({
    method: 'post',
    path: '/api/v1/enterprise-registrations/start',
    tags: ['Enterprise Registrations'],
    summary: 'Initiate enterprise registration intake',
    description:
      'Validates corporate email and representative credentials, creates an intake draft, and dispatches a 24-hour verification magic link.',
    request: {
      body: {
        content: {
          'application/json': { schema: registeredStartRequest },
        },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Magic link dispatched successfully',
        content: { 'application/json': { schema: registeredStartResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid corporate email format or blocked personal/public webmail domain',
      },
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description: 'Corporate email or tax code is already registered or currently locked in active review',
      },
      [HTTP_STATUS.HTTP_429_TOO_MANY_REQUESTS]: {
        description: 'Rate limit exceeded for registration initiation attempts',
      },
    },
  });

  // 2. GET /api/v1/enterprise-registrations/verify-email
  registry.registerPath({
    method: 'get',
    path: '/api/v1/enterprise-registrations/verify-email',
    tags: ['Enterprise Registrations'],
    summary: 'Verify corporate email via magic link token',
    description:
      'Validates the single-use 24-hour magic link token, transitions registration status to verified draft, and activates multi-step wizard session.',
    request: {
      query: verifyEmailQuerySchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Corporate email verified successfully',
        content: { 'application/json': { schema: registeredVerifyResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid, expired, or revoked verification token',
      },
    },
  });

  // 3. POST /api/v1/enterprise-registrations/invitations/accept (Registered before /:id to prevent path shadowing)
  registry.registerPath({
    method: 'post',
    path: '/api/v1/enterprise-registrations/invitations/accept',
    tags: ['Enterprise Registrations'],
    summary: 'Accept onboarding invitation and provision enterprise administrator account',
    description:
      'Redeems 7-day single-use onboarding invitation token, provisions active recruiter/enterprise_admin user with password (or links existing account), and issues JWT session tokens.',
    request: {
      body: {
        content: {
          'application/json': { schema: registeredAcceptInviteRequest },
        },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Invitation accepted and account onboarding complete',
        content: { 'application/json': { schema: registeredAcceptInviteResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid, expired, or already redeemed invitation token',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Invalid password for existing representative account',
      },
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description: 'Username already taken',
      },
    },
  });

  // 4. GET /api/v1/enterprise-registrations (Admin queue)
  registry.registerPath({
    method: 'get',
    path: '/api/v1/enterprise-registrations',
    tags: ['Enterprise Registrations'],
    summary: 'List enterprise registrations for administrative review',
    description:
      'Returns a paginated list of enterprise registrations with optional status and search filters. Accessible only to System Administrators.',
    security: [{ bearerAuth: [] }],
    request: {
      query: registrationListQuerySchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Paginated enterprise registration summaries',
        content: { 'application/json': { schema: registeredPaginatedSummary } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid pagination or filter parameters',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description: 'Forbidden: administrative privilege required',
      },
    },
  });

  // 5. GET /api/v1/enterprise-registrations/{id}
  registry.registerPath({
    method: 'get',
    path: '/api/v1/enterprise-registrations/{id}',
    tags: ['Enterprise Registrations'],
    summary: 'Inspect enterprise registration case detail and snapshot',
    description:
      'Retrieves complete registration case document including representative profile, company data, legal documents, claim locks, and review outcome.',
    request: {
      params: registrationIdParamSchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Enterprise registration case details and snapshot',
        content: { 'application/json': { schema: registeredDetail } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid registration identifier format',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Registration case not found',
      },
    },
  });

  // 6. PATCH /api/v1/enterprise-registrations/{id}/draft
  registry.registerPath({
    method: 'patch',
    path: '/api/v1/enterprise-registrations/{id}/draft',
    tags: ['Enterprise Registrations'],
    summary: 'Save enterprise registration wizard draft',
    description:
      'Incrementally persists draft company details, representative information, and legal documents. Enforces optimistic concurrency control via version matching.',
    request: {
      params: registrationIdParamSchema,
      body: {
        content: {
          'application/json': { schema: registeredSaveDraftRequest },
        },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Registration draft updated successfully',
        content: { 'application/json': { schema: registeredDetail } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Validation failed on draft fields',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Registration case not found',
      },
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description: 'Version mismatch or registration case is no longer editable',
      },
    },
  });

  // 7. POST /api/v1/enterprise-registrations/{id}/documents
  registry.registerPath({
    method: 'post',
    path: '/api/v1/enterprise-registrations/{id}/documents',
    tags: ['Enterprise Registrations'],
    summary: 'Upload legal PDF verification document',
    description:
      'Accepts multipart/form-data upload containing a legal document (business license, tax registration, power of attorney). Verifies file size (max 5MB) and PDF magic header bytes.',
    request: {
      params: registrationIdParamSchema,
      body: {
        required: true,
        content: {
          'multipart/form-data': { schema: registeredUploadFormRequest },
        },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_201_CREATED]: {
        description: 'Legal document uploaded and recorded on draft successfully',
        content: { 'application/json': { schema: registeredLegalDocResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Missing document file, non-PDF format, or exceeded 5MB size limit',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Registration case not found',
      },
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description: 'Registration case already submitted and locked against modifications',
      },
      [HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE]: {
        description: 'Cloud storage service unconfigured or unavailable',
      },
    },
  });

  // 8. POST /api/v1/enterprise-registrations/{id}/submit
  registry.registerPath({
    method: 'post',
    path: '/api/v1/enterprise-registrations/{id}/submit',
    tags: ['Enterprise Registrations'],
    summary: 'Submit enterprise registration for administrative review',
    description:
      'Validates full company profile, representative credentials, and mandatory business license document. Locks exclusive claims on tax code and corporate email, advancing case to pending_review.',
    request: {
      params: registrationIdParamSchema,
      body: {
        content: {
          'application/json': { schema: registeredSubmitRequest },
        },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Enterprise registration submitted successfully',
        content: { 'application/json': { schema: registeredSubmitReceiptResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Incomplete company profile or missing mandatory business license document',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Registration case not found',
      },
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description: 'Version mismatch or exclusive tax code/corporate email claim collision',
      },
    },
  });

  // 9. POST /api/v1/enterprise-registrations/{id}/decision
  registry.registerPath({
    method: 'post',
    path: '/api/v1/enterprise-registrations/{id}/decision',
    tags: ['Enterprise Registrations'],
    summary: 'Process administrative review decision',
    description:
      'Admin approves or rejects case. Approval instantiates an active Enterprise entity and emails a 7-day invitation link. Rejection records mandatory explanation (>=20 chars), releases claims, and emails the applicant.',
    security: [{ bearerAuth: [] }],
    request: {
      params: registrationIdParamSchema,
      body: {
        content: {
          'application/json': { schema: registeredAdminDecisionRequest },
        },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Administrative decision processed successfully',
        content: { 'application/json': { schema: registeredAdminDecisionResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Incomplete verification checklist or rejection explanation shorter than 20 characters',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description: 'Forbidden: administrative privilege required',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Registration case not found',
      },
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description: 'Case is not awaiting decision or optimistic concurrency version mismatch',
      },
    },
  });
}
