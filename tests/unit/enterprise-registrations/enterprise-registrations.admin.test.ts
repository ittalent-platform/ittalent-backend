import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnterpriseDoc } from '../../../src/models/enterprise.model.js';
import type { EnterpriseRegistrationDoc } from '../../../src/models/enterprise-registration.model.js';
import { EnterpriseRegistrationsController } from '../../../src/modules/enterprise-registrations/enterprise-registrations.controller.js';
import {
  REGISTRATION_CONFIG,
  REGISTRATION_MESSAGES,
} from '../../../src/modules/enterprise-registrations/enterprise-registrations.constants.js';
import type { EnterpriseRegistrationsRepository } from '../../../src/modules/enterprise-registrations/enterprise-registrations.repository.js';
import type {
  AdminDecisionDTO,
  RegistrationListQuery,
} from '../../../src/modules/enterprise-registrations/enterprise-registrations.schemas.js';
import { EnterpriseRegistrationsService } from '../../../src/modules/enterprise-registrations/enterprise-registrations.service.js';
import type { EnterprisesService } from '../../../src/modules/enterprises/enterprises.service.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';
import * as emailService from '../../../src/shared/services/email.service.js';

describe('Enterprise Registrations: Admin Review & Decision Workflow', () => {
  let mockRepo: Partial<EnterpriseRegistrationsRepository>;
  let mockEnterpriseService: Partial<EnterprisesService>;
  let service: EnterpriseRegistrationsService;
  let controller: EnterpriseRegistrationsController;

  const sampleId = new mongoose.Types.ObjectId();
  const sampleAdminId = new mongoose.Types.ObjectId().toString();
  const sampleEnterpriseId = new mongoose.Types.ObjectId().toString();
  const sampleCode = 'REG-20261012-ABCD';

  function createMockPendingDoc(overrides: Record<string, unknown> = {}): EnterpriseRegistrationDoc {
    const doc = {
      _id: sampleId,
      registration_code: sampleCode,
      corporate_email: 'rep@company.com',
      status: 'pending_review',
      version: 2,
      representative: {
        full_name: 'Jane Doe',
        phone: '+84901234567',
        position: 'CEO',
      },
      company_data: {
        name: 'Acme Global Corp',
        legal_name: 'Acme Global Corporation JSC',
        tax_code: '0101234567',
        registration_number: 'DN-987654321',
        website: 'https://acmeglobal.com',
        industry: 'Information Technology',
        sub_industries: ['Software Engineering'],
        company_size: '51-200',
        company_type: 'product',
        founded_year: 2020,
        address: {
          street: '123 Innovation Drive',
          city: 'Ho Chi Minh',
          country: 'Vietnam',
        },
        short_description: 'Innovative software platform solutions.',
        description: 'Comprehensive software platform delivery.',
      },
      legal_documents: [
        {
          document_type: 'business_license',
          file_name: 'license.pdf',
          file_url: 'https://storage.example.com/license.pdf',
          uploaded_at: new Date(),
        },
      ],
      claim_locks: {
        tax_code: '0101234567',
        corporate_email: 'rep@company.com',
        locked_at: new Date(),
      },
      createdAt: new Date('2026-10-10T10:00:00.000Z'),
      save: vi.fn().mockResolvedValue(true),
      ...overrides,
    };
    return doc as unknown as EnterpriseRegistrationDoc;
  }

  beforeEach(() => {
    vi.restoreAllMocks();

    mockRepo = {
      findByIdOrCode: vi.fn(),
      findPage: vi.fn(),
    };

    mockEnterpriseService = {
      findByTaxCode: vi.fn().mockResolvedValue(null),
      findByEmail: vi.fn().mockResolvedValue(null),
      createEnterprise: vi.fn().mockResolvedValue({
        id: sampleEnterpriseId,
        name: 'Acme Global Corp',
        status: 'active',
      } as unknown as EnterpriseDoc),
    };

    service = new EnterpriseRegistrationsService(
      mockRepo as EnterpriseRegistrationsRepository,
      mockEnterpriseService as EnterprisesService,
    );

    controller = new EnterpriseRegistrationsController(service);

    vi.spyOn(emailService, 'sendEnterpriseRejectionEmail').mockResolvedValue(undefined);
    vi.spyOn(emailService, 'sendEnterpriseAdminInvitationEmail').mockResolvedValue(undefined);
  });

  describe('listRegistrations', () => {
    it('returns paginated items and calculates totalPages correctly', async () => {
      const mockDoc = createMockPendingDoc();
      vi.mocked(mockRepo.findPage!).mockResolvedValue({
        items: [mockDoc],
        total: 1,
      });

      const query: RegistrationListQuery = {
        page: 1,
        limit: 10,
        status: 'pending_review',
        search: 'Acme',
      };

      const result = await service.listRegistrations(query);

      expect(mockRepo.findPage).toHaveBeenCalledWith(query);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        id: sampleId.toString(),
        registration_code: sampleCode,
        corporate_email: 'rep@company.com',
        company_name: 'Acme Global Corp',
        tax_code: '0101234567',
        representative_name: 'Jane Doe',
        representative_phone: '+84901234567',
        status: 'pending_review',
        version: 2,
        created_at: '2026-10-10T10:00:00.000Z',
        submitted_at: expect.any(String),
      });
    });

    it('uses default pagination values if omitted from query', async () => {
      vi.mocked(mockRepo.findPage!).mockResolvedValue({
        items: [],
        total: 0,
      });

      const result = await service.listRegistrations({});

      expect(result.page).toBe(REGISTRATION_CONFIG.DEFAULT_PAGE);
      expect(result.limit).toBe(REGISTRATION_CONFIG.DEFAULT_LIMIT);
      expect(result.totalPages).toBe(0);
    });
  });

  describe('processAdminDecision - Guards & Concurrency', () => {
    it('throws 404 when registration is not found', async () => {
      vi.mocked(mockRepo.findByIdOrCode!).mockResolvedValue(null);

      const payload: AdminDecisionDTO = {
        decision: 'rejected',
        version: 2,
        rejection_reason: 'Registration document is illegible and invalid',
      };

      await expect(
        service.processAdminDecision(sampleCode, payload, sampleAdminId),
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_404_NOT_FOUND,
        message: REGISTRATION_MESSAGES.NOT_FOUND,
      });
    });

    it('throws 409 when registration is not in pending or under review status', async () => {
      const mockDoc = createMockPendingDoc({ status: 'draft' });
      vi.mocked(mockRepo.findByIdOrCode!).mockResolvedValue(mockDoc);

      const payload: AdminDecisionDTO = {
        decision: 'rejected',
        version: 2,
        rejection_reason: 'Registration document is illegible and invalid',
      };

      await expect(
        service.processAdminDecision(sampleCode, payload, sampleAdminId),
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_409_CONFLICT,
        message: REGISTRATION_MESSAGES.NOT_PENDING_REVIEW,
      });
    });

    it('throws 409 when version mismatch occurs (optimistic concurrency conflict)', async () => {
      const mockDoc = createMockPendingDoc({ version: 3 });
      vi.mocked(mockRepo.findByIdOrCode!).mockResolvedValue(mockDoc);

      const payload: AdminDecisionDTO = {
        decision: 'rejected',
        version: 2,
        rejection_reason: 'Registration document is illegible and invalid',
      };

      await expect(
        service.processAdminDecision(sampleCode, payload, sampleAdminId),
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_409_CONFLICT,
        message: REGISTRATION_MESSAGES.INVALID_VERSION,
      });
    });
  });

  describe('processAdminDecision - Rejection Branch', () => {
    it('throws 400 if rejection reason is shorter than 20 characters', async () => {
      const mockDoc = createMockPendingDoc();
      vi.mocked(mockRepo.findByIdOrCode!).mockResolvedValue(mockDoc);

      const payload: AdminDecisionDTO = {
        decision: 'rejected',
        version: 2,
        rejection_reason: 'Too short',
      };

      await expect(
        service.processAdminDecision(sampleCode, payload, sampleAdminId),
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
        message: REGISTRATION_MESSAGES.REJECTION_REASON_REQUIRED,
      });
    });

    it('releases claim locks, updates status to rejected, and sends rejection email', async () => {
      const mockDoc = createMockPendingDoc();
      vi.mocked(mockRepo.findByIdOrCode!).mockResolvedValue(mockDoc);

      const reason = 'Business registration certificate has expired and is unverified';
      const payload: AdminDecisionDTO = {
        decision: 'rejected',
        version: 2,
        rejection_reason: reason,
      };

      const result = await service.processAdminDecision(sampleCode, payload, sampleAdminId);

      expect(mockDoc.claim_locks).toBeUndefined();
      expect(mockDoc.status).toBe('rejected');
      expect(mockDoc.version).toBe(3);
      expect(mockDoc.review).toMatchObject({
        decision: 'rejected',
        rejection_reason: reason,
        reviewed_by: expect.any(mongoose.Types.ObjectId),
        reviewed_at: expect.any(Date),
      });
      expect(mockDoc.save).toHaveBeenCalledTimes(1);

      expect(emailService.sendEnterpriseRejectionEmail).toHaveBeenCalledWith(
        'rep@company.com',
        'Acme Global Corp',
        reason,
      );

      expect(result).toEqual({
        message: 'Enterprise registration rejected',
        registration_code: sampleCode,
        status: 'rejected',
        version: 3,
      });
    });
  });

  describe('processAdminDecision - Approval Branch', () => {
    const validChecklist = {
      tax_code_verified: true,
      legal_representative_verified: true,
      documents_verified: true,
    };

    it('throws 400 if checklist is incomplete', async () => {
      const mockDoc = createMockPendingDoc();
      vi.mocked(mockRepo.findByIdOrCode!).mockResolvedValue(mockDoc);

      const payload: AdminDecisionDTO = {
        decision: 'approved',
        version: 2,
        checklist: {
          tax_code_verified: true,
          legal_representative_verified: false,
          documents_verified: true,
        },
      };

      await expect(
        service.processAdminDecision(sampleCode, payload, sampleAdminId),
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
        message: REGISTRATION_MESSAGES.CHECKLIST_INCOMPLETE,
      });
    });

    it('throws 409 if claim locks are missing/lost before approval', async () => {
      const mockDoc = createMockPendingDoc({ claim_locks: undefined });
      vi.mocked(mockRepo.findByIdOrCode!).mockResolvedValue(mockDoc);

      const payload: AdminDecisionDTO = {
        decision: 'approved',
        version: 2,
        checklist: validChecklist,
      };

      await expect(
        service.processAdminDecision(sampleCode, payload, sampleAdminId),
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_409_CONFLICT,
        message: 'Claim mismatch: claim lock is not currently held',
      });
    });

    it('creates active Enterprise, generates 7-day token, updates status to approved, and sends invitation email', async () => {
      const mockDoc = createMockPendingDoc();
      vi.mocked(mockRepo.findByIdOrCode!).mockResolvedValue(mockDoc);

      const payload: AdminDecisionDTO = {
        decision: 'approved',
        version: 2,
        checklist: validChecklist,
      };

      const result = await service.processAdminDecision(sampleCode, payload, sampleAdminId);

      expect(mockEnterpriseService.createEnterprise).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Acme Global Corp',
          tax_code: '0101234567',
          email: 'rep@company.com',
          phone: '+84901234567',
        }),
        sampleAdminId,
        'admin',
      );

      expect(mockDoc.status).toBe('approved');
      expect(mockDoc.version).toBe(3);
      expect(mockDoc.created_enterprise_id).toEqual(new mongoose.Types.ObjectId(sampleEnterpriseId));
      expect(mockDoc.invitation_token).toMatchObject({
        token_hash: expect.any(String),
        expires_at: expect.any(Date),
      });
      expect(mockDoc.review).toMatchObject({
        decision: 'approved',
        checklist: validChecklist,
        reviewed_by: expect.any(mongoose.Types.ObjectId),
        reviewed_at: expect.any(Date),
      });
      expect(mockDoc.save).toHaveBeenCalledTimes(1);

      expect(emailService.sendEnterpriseAdminInvitationEmail).toHaveBeenCalledWith(
        'rep@company.com',
        'Jane Doe',
        'Acme Global Corp',
        expect.stringContaining('/enterprise-registration/invitation?token='),
      );

      expect(result).toEqual({
        message: 'Enterprise registration approved and enterprise created',
        registration_code: sampleCode,
        status: 'approved',
        version: 3,
        enterprise_id: sampleEnterpriseId,
      });
    });
  });

  describe('EnterpriseRegistrationsController Admin Handlers', () => {
    it('listRegistrations handles query and returns 200 with result', async () => {
      const mockReq = {} as Request;
      const mockRes = {
        locals: {
          validated: {
            query: { page: 1, limit: 10, status: 'pending_review' },
          },
        },
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const mockNext = vi.fn();

      vi.spyOn(service, 'listRegistrations').mockResolvedValue({
        items: [],
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      });

      await controller.listRegistrations(mockReq, mockRes, mockNext);

      expect(service.listRegistrations).toHaveBeenCalledWith({ page: 1, limit: 10, status: 'pending_review' });
      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ items: [] }));
    });

    it('processAdminDecision passes admin id, params, and body then returns 200', async () => {
      const mockReq = {
        user: { id: sampleAdminId, role: 'admin' },
      } as unknown as Request;
      const mockRes = {
        locals: {
          validated: {
            params: { id: sampleCode },
            body: {
              decision: 'rejected',
              version: 2,
              rejection_reason: 'Legitimate rejection rationale exceeding limit',
            },
          },
        },
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const mockNext = vi.fn();

      vi.spyOn(service, 'processAdminDecision').mockResolvedValue({
        message: 'Enterprise registration rejected',
        registration_code: sampleCode,
        status: 'rejected',
        version: 3,
      });

      await controller.processAdminDecision(mockReq, mockRes, mockNext);

      expect(service.processAdminDecision).toHaveBeenCalledWith(
        sampleCode,
        expect.objectContaining({ decision: 'rejected' }),
        sampleAdminId,
      );
      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
    });
  });
});
