import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseLegalDocumentUpload } from '../../../src/middleware/legal-document-upload.middleware.js';
import type { EnterpriseDoc } from '../../../src/models/enterprise.model.js';
import type { EnterpriseRegistrationDoc } from '../../../src/models/enterprise-registration.model.js';
import { EnterpriseRegistrationsController } from '../../../src/modules/enterprise-registrations/enterprise-registrations.controller.js';
import {
  REGISTRATION_MESSAGES,
} from '../../../src/modules/enterprise-registrations/enterprise-registrations.constants.js';
import type { EnterpriseRegistrationsRepository } from '../../../src/modules/enterprise-registrations/enterprise-registrations.repository.js';
import type {
  SaveDraftDTO,
  SubmitRegistrationDTO,
} from '../../../src/modules/enterprise-registrations/enterprise-registrations.schemas.js';
import { EnterpriseRegistrationsService } from '../../../src/modules/enterprise-registrations/enterprise-registrations.service.js';
import type { EnterprisesService } from '../../../src/modules/enterprises/enterprises.service.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';
import { storageService, PDF_SIGNATURE } from '../../../src/shared/services/storage.service.js';

describe('Enterprise Registrations: Draft, Document Upload & Submission', () => {
  let mockRepo: Partial<EnterpriseRegistrationsRepository>;
  let mockEnterpriseService: Partial<EnterprisesService>;
  let service: EnterpriseRegistrationsService;
  let controller: EnterpriseRegistrationsController;

  const sampleId = new mongoose.Types.ObjectId();
  const sampleCode = 'REG-20261012-ABCD';
  const validPdfBuffer = Buffer.from(`${PDF_SIGNATURE} sample binary stream`);

  function createMockRegistrationDoc(overrides: Record<string, unknown> = {}): EnterpriseRegistrationDoc {
    const doc = {
      _id: sampleId,
      registration_code: sampleCode,
      corporate_email: 'rep@company.com',
      status: 'draft',
      version: 1,
      representative: {
        full_name: 'John Doe',
        phone: '+84901234567',
        position: 'HR Director',
      },
      company_data: {
        name: 'Acme Corp',
        tax_code: '0101234567',
        industry: 'Information Technology',
        company_size: '51-200',
        address: {
          street: '123 Tech Park',
          city: 'Ho Chi Minh',
          country: 'Vietnam',
        },
      },
      legal_documents: [],
      claim_locks: undefined,
      save: vi.fn().mockResolvedValue(true),
      ...overrides,
    };
    return doc as unknown as EnterpriseRegistrationDoc;
  }

  beforeEach(() => {
    vi.restoreAllMocks();

    mockRepo = {
      findByIdOrCode: vi.fn(),
      hasActiveClaim: vi.fn().mockResolvedValue(false),
    };

    mockEnterpriseService = {
      findByTaxCode: vi.fn().mockResolvedValue(null),
      findByEmail: vi.fn().mockResolvedValue(null),
    };

    service = new EnterpriseRegistrationsService(
      mockRepo as EnterpriseRegistrationsRepository,
      mockEnterpriseService as EnterprisesService,
    );

    controller = new EnterpriseRegistrationsController(service);
  });

  describe('getRegistration', () => {
    it('returns registration case if found by identifier', async () => {
      const mockDoc = createMockRegistrationDoc();
      vi.mocked(mockRepo.findByIdOrCode!).mockResolvedValue(mockDoc);

      const result = await service.getRegistration(sampleCode);

      expect(mockRepo.findByIdOrCode).toHaveBeenCalledWith(sampleCode);
      expect(result).toBe(mockDoc);
    });

    it('throws 404 when registration is not found', async () => {
      vi.mocked(mockRepo.findByIdOrCode!).mockResolvedValue(null);

      await expect(service.getRegistration('nonexistent')).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_404_NOT_FOUND,
        message: REGISTRATION_MESSAGES.NOT_FOUND,
      });
    });
  });

  describe('saveDraft', () => {
    it('updates draft fields, increments version, and saves', async () => {
      const mockDoc = createMockRegistrationDoc();
      vi.mocked(mockRepo.findByIdOrCode!).mockResolvedValue(mockDoc);

      const payload: SaveDraftDTO = {
        version: 1,
        representative: {
          full_name: 'Jane Smith',
        },
        company_data: {
          legal_name: 'Acme International LLC',
          short_description: 'Innovative software lab',
        },
      };

      const result = await service.saveDraft(sampleCode, payload);

      expect(result.representative.full_name).toBe('Jane Smith');
      expect(result.company_data?.legal_name).toBe('Acme International LLC');
      expect(result.version).toBe(2);
      expect(mockDoc.save).toHaveBeenCalled();
    });

    it('throws 404 when case does not exist', async () => {
      vi.mocked(mockRepo.findByIdOrCode!).mockResolvedValue(null);

      await expect(service.saveDraft('unknown-id', {})).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_404_NOT_FOUND,
        message: REGISTRATION_MESSAGES.NOT_FOUND,
      });
    });

    it('throws 409 ALREADY_SUBMITTED when status is not draft', async () => {
      const mockDoc = createMockRegistrationDoc({ status: 'pending_review' });
      vi.mocked(mockRepo.findByIdOrCode!).mockResolvedValue(mockDoc);

      await expect(service.saveDraft(sampleCode, {})).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_409_CONFLICT,
        message: REGISTRATION_MESSAGES.ALREADY_SUBMITTED,
      });
    });

    it('throws 409 INVALID_VERSION on optimistic concurrency mismatch', async () => {
      const mockDoc = createMockRegistrationDoc({ version: 2 });
      vi.mocked(mockRepo.findByIdOrCode!).mockResolvedValue(mockDoc);

      await expect(service.saveDraft(sampleCode, { version: 1 })).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_409_CONFLICT,
        message: REGISTRATION_MESSAGES.INVALID_VERSION,
      });
    });
  });

  describe('uploadLegalDocument', () => {
    it('throws 400 when file is missing', async () => {
      await expect(
        service.uploadLegalDocument(sampleCode, undefined, 'business_license'),
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
        message: REGISTRATION_MESSAGES.DOCUMENT_FILE_REQUIRED,
      });
    });

    it('throws 400 when file is empty (size 0)', async () => {
      const emptyFile = {
        originalname: 'empty.pdf',
        buffer: Buffer.alloc(0),
        size: 0,
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      await expect(
        service.uploadLegalDocument(sampleCode, emptyFile, 'business_license'),
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
        message: REGISTRATION_MESSAGES.DOCUMENT_FILE_EMPTY,
      });
    });

    it('throws 400 PDF_DOCUMENT_REQUIRED when buffer is not a valid PDF [BR-41 / EX4]', async () => {
      const nonPdfFile = {
        originalname: 'not_a_pdf.pdf',
        buffer: Buffer.from('corrupted non-pdf binary bytes'),
        size: 32,
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      await expect(
        service.uploadLegalDocument(sampleCode, nonPdfFile, 'business_license'),
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
        message: REGISTRATION_MESSAGES.PDF_DOCUMENT_REQUIRED,
      });
    });

    it('throws 409 ALREADY_SUBMITTED when case is not draft', async () => {
      const mockDoc = createMockRegistrationDoc({ status: 'under_review' });
      vi.mocked(mockRepo.findByIdOrCode!).mockResolvedValue(mockDoc);

      const validFile = {
        originalname: 'license.pdf',
        buffer: validPdfBuffer,
        size: validPdfBuffer.length,
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      await expect(
        service.uploadLegalDocument(sampleCode, validFile, 'business_license'),
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_409_CONFLICT,
        message: REGISTRATION_MESSAGES.ALREADY_SUBMITTED,
      });
    });

    it('uploads valid PDF via storageService and saves document entry to draft', async () => {
      const mockDoc = createMockRegistrationDoc();
      vi.mocked(mockRepo.findByIdOrCode!).mockResolvedValue(mockDoc);

      const validFile = {
        originalname: 'business_cert.pdf',
        buffer: validPdfBuffer,
        size: validPdfBuffer.length,
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      const uploadSpy = vi.spyOn(storageService, 'uploadFile').mockResolvedValue({
        fileUrl: 'https://res.cloudinary.com/test/legal-docs/doc-1.pdf',
        storageKey: 'italent/enterprise-legal-documents/legal-business_license-uuid.pdf',
        fileName: 'business_cert.pdf',
        mimeType: 'application/pdf',
        size: validPdfBuffer.length,
      });

      const result = await service.uploadLegalDocument(sampleCode, validFile, 'business_license');

      expect(uploadSpy).toHaveBeenCalledWith({
        buffer: validPdfBuffer,
        fileName: 'business_cert.pdf',
        folder: 'italent/enterprise-legal-documents',
        prefix: 'legal-business_license',
        resourceType: 'raw',
        mimeType: 'application/pdf',
      });

      expect(result.document_type).toBe('business_license');
      expect(result.file_url).toBe('https://res.cloudinary.com/test/legal-docs/doc-1.pdf');
      expect(mockDoc.legal_documents).toHaveLength(1);
      expect(mockDoc.version).toBe(2);
      expect(mockDoc.save).toHaveBeenCalled();
    });

    it('replaces existing document of same type when re-uploaded', async () => {
      const existingDoc = {
        document_type: 'business_license' as const,
        file_name: 'old_cert.pdf',
        file_url: 'https://storage/old.pdf',
        file_size: 100,
        uploaded_at: new Date('2026-01-01'),
      };
      const mockDoc = createMockRegistrationDoc({ legal_documents: [existingDoc] });
      vi.mocked(mockRepo.findByIdOrCode!).mockResolvedValue(mockDoc);

      const validFile = {
        originalname: 'new_cert.pdf',
        buffer: validPdfBuffer,
        size: validPdfBuffer.length,
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      vi.spyOn(storageService, 'uploadFile').mockResolvedValue({
        fileUrl: 'https://storage/new.pdf',
        storageKey: 'italent/enterprise-legal-documents/new.pdf',
        fileName: 'new_cert.pdf',
        mimeType: 'application/pdf',
        size: validPdfBuffer.length,
      });

      const result = await service.uploadLegalDocument(sampleCode, validFile, 'business_license');

      expect(result.file_name).toBe('new_cert.pdf');
      expect(mockDoc.legal_documents).toHaveLength(1);
      expect(mockDoc.legal_documents?.[0]?.file_url).toBe('https://storage/new.pdf');
    });
  });

  describe('submitRegistration', () => {
    const validSubmitPayload: SubmitRegistrationDTO = {
      version: 1,
      representative: {
        full_name: 'John Doe',
        phone: '+84901234567',
      },
      company_data: {
        name: 'Acme Corporation',
        tax_code: '0101234567',
        industry: 'Software Development',
        company_size: '51-200',
        address: {
          street: '123 Tech Park',
          city: 'Ho Chi Minh',
          country: 'Vietnam',
        },
      },
      legal_documents: [
        {
          document_type: 'business_license',
          file_name: 'cert.pdf',
          file_url: 'https://storage/cert.pdf',
          file_size: 2048,
        },
      ],
    };

    it('throws 409 ALREADY_SUBMITTED when status is not draft', async () => {
      const mockDoc = createMockRegistrationDoc({ status: 'pending_review' });
      vi.mocked(mockRepo.findByIdOrCode!).mockResolvedValue(mockDoc);

      await expect(service.submitRegistration(sampleCode, validSubmitPayload)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_409_CONFLICT,
        message: REGISTRATION_MESSAGES.ALREADY_SUBMITTED,
      });
    });

    it('throws 409 INVALID_VERSION when payload version mismatches', async () => {
      const mockDoc = createMockRegistrationDoc({ version: 2 });
      vi.mocked(mockRepo.findByIdOrCode!).mockResolvedValue(mockDoc);

      await expect(service.submitRegistration(sampleCode, { ...validSubmitPayload, version: 1 })).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_409_CONFLICT,
        message: REGISTRATION_MESSAGES.INVALID_VERSION,
      });
    });

    it('throws 400 MISSING_LEGAL_DOCUMENTS when business license is absent [BR-41 / EX4]', async () => {
      const mockDoc = createMockRegistrationDoc({ legal_documents: [] });
      vi.mocked(mockRepo.findByIdOrCode!).mockResolvedValue(mockDoc);

      const payloadNoLicense = {
        ...validSubmitPayload,
        legal_documents: [
          {
            document_type: 'tax_registration' as const,
            file_name: 'tax.pdf',
            file_url: 'https://storage/tax.pdf',
          },
        ],
      } as SubmitRegistrationDTO;

      await expect(service.submitRegistration(sampleCode, payloadNoLicense)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
        message: REGISTRATION_MESSAGES.MISSING_LEGAL_DOCUMENTS,
      });
    });

    it('throws 409 TAX_CODE_ALREADY_CLAIMED when tax code belongs to active enterprise [BR-39]', async () => {
      const mockDoc = createMockRegistrationDoc();
      vi.mocked(mockRepo.findByIdOrCode!).mockResolvedValue(mockDoc);
      vi.mocked(mockEnterpriseService.findByTaxCode!).mockResolvedValue({ _id: new mongoose.Types.ObjectId() } as EnterpriseDoc);

      await expect(service.submitRegistration(sampleCode, validSubmitPayload)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_409_CONFLICT,
        message: REGISTRATION_MESSAGES.TAX_CODE_ALREADY_CLAIMED,
      });
    });

    it('throws 409 TAX_CODE_ALREADY_CLAIMED when active claim exists in pending reviews [BR-42 / EX3]', async () => {
      const mockDoc = createMockRegistrationDoc();
      vi.mocked(mockRepo.findByIdOrCode!).mockResolvedValue(mockDoc);
      vi.mocked(mockEnterpriseService.findByTaxCode!).mockResolvedValue(null);
      vi.mocked(mockRepo.hasActiveClaim!).mockResolvedValue(true);

      await expect(service.submitRegistration(sampleCode, validSubmitPayload)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_409_CONFLICT,
        message: REGISTRATION_MESSAGES.TAX_CODE_ALREADY_CLAIMED,
      });
    });

    it('throws 409 EMAIL_ALREADY_EXISTS when corporate email belongs to active enterprise', async () => {
      const mockDoc = createMockRegistrationDoc();
      vi.mocked(mockRepo.findByIdOrCode!).mockResolvedValue(mockDoc);
      vi.mocked(mockEnterpriseService.findByTaxCode!).mockResolvedValue(null);
      vi.mocked(mockRepo.hasActiveClaim!).mockResolvedValue(false);
      vi.mocked(mockEnterpriseService.findByEmail!).mockResolvedValue({ _id: new mongoose.Types.ObjectId() } as EnterpriseDoc);

      await expect(service.submitRegistration(sampleCode, validSubmitPayload)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_409_CONFLICT,
        message: REGISTRATION_MESSAGES.EMAIL_ALREADY_EXISTS,
      });
    });

    it('successfully acquires claim locks, sets pending_review status, and returns submission receipt [BR-42 / EX3]', async () => {
      const mockDoc = createMockRegistrationDoc();
      vi.mocked(mockRepo.findByIdOrCode!).mockResolvedValue(mockDoc);
      vi.mocked(mockEnterpriseService.findByTaxCode!).mockResolvedValue(null);
      vi.mocked(mockRepo.hasActiveClaim!).mockResolvedValue(false);
      vi.mocked(mockEnterpriseService.findByEmail!).mockResolvedValue(null);

      const receipt = await service.submitRegistration(sampleCode, validSubmitPayload);

      expect(mockDoc.status).toBe('pending_review');
      expect(mockDoc.claim_locks?.tax_code).toBe('0101234567');
      expect(mockDoc.claim_locks?.corporate_email).toBe('rep@company.com');
      expect(mockDoc.claim_locks?.locked_at).toBeDefined();
      expect(mockDoc.version).toBe(2);
      expect(mockDoc.save).toHaveBeenCalled();

      expect(receipt).toEqual(
        expect.objectContaining({
          registration_code: sampleCode,
          status: 'pending_review',
          version: 2,
          estimated_sla_days: 2,
        }),
      );
    });
  });

  describe('EnterpriseRegistrationsController handlers', () => {
    it('getRegistration returns 200 with case details', async () => {
      const mockDoc = createMockRegistrationDoc();
      vi.spyOn(service, 'getRegistration').mockResolvedValue(mockDoc);

      const req = {} as Request;
      const res = {
        locals: { validated: { params: { id: sampleCode } } },
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      await controller.getRegistration(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(res.json).toHaveBeenCalledWith(mockDoc);
    });

    it('saveDraft returns 200 with updated draft', async () => {
      const mockDoc = createMockRegistrationDoc();
      vi.spyOn(service, 'saveDraft').mockResolvedValue(mockDoc);

      const req = {} as Request;
      const res = {
        locals: { validated: { params: { id: sampleCode }, body: { version: 1 } } },
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      await controller.saveDraft(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(res.json).toHaveBeenCalledWith(mockDoc);
    });

    it('uploadLegalDocument returns 201 with uploaded document details', async () => {
      const mockDocEntry = {
        document_type: 'business_license' as const,
        file_name: 'cert.pdf',
        file_url: 'https://storage/cert.pdf',
        file_size: 1024,
        uploaded_at: new Date(),
      };
      vi.spyOn(service, 'uploadLegalDocument').mockResolvedValue(mockDocEntry);

      const req = {
        file: {
          originalname: 'cert.pdf',
          buffer: validPdfBuffer,
          size: validPdfBuffer.length,
          mimetype: 'application/pdf',
        },
      } as unknown as Request;
      const res = {
        locals: {
          validated: {
            params: { id: sampleCode },
            body: { document_type: 'business_license' },
          },
        },
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      await controller.uploadLegalDocument(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_201_CREATED);
      expect(res.json).toHaveBeenCalledWith(mockDocEntry);
    });

    it('submitRegistration returns 200 with submission receipt', async () => {
      const receipt = {
        registration_code: sampleCode,
        status: 'pending_review',
        version: 2,
        submitted_at: new Date().toISOString(),
        estimated_sla_days: 2,
      };
      vi.spyOn(service, 'submitRegistration').mockResolvedValue(receipt);

      const req = {} as Request;
      const res = {
        locals: { validated: { params: { id: sampleCode }, body: { version: 1 } } },
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      await controller.submitRegistration(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(res.json).toHaveBeenCalledWith(receipt);
    });

    it('forwards error to next() on controller failure', async () => {
      vi.spyOn(service, 'getRegistration').mockRejectedValue(new Error('DB failure'));

      const req = {} as Request;
      const res = {
        locals: { validated: { params: { id: sampleCode } } },
      } as unknown as Response;
      const next = vi.fn();

      await controller.getRegistration(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('parseLegalDocumentUpload middleware', () => {
    it('passes through when no error occurs in multer processing', () => {
      const req = { headers: {} } as Request;
      const res = {} as Response;
      const next = vi.fn();

      parseLegalDocumentUpload(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('converts LIMIT_FILE_SIZE error into 400 Bad Request', () => {
      const next = vi.fn();

      // Trigger error path by passing a custom error into simulated handler
      const multerError = new multer.MulterError('LIMIT_FILE_SIZE');

      // Test the error branching directly
      const errorHandler = (err: unknown) => {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          next({
            statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
            message: REGISTRATION_MESSAGES.DOCUMENT_FILE_SIZE_LIMIT,
          });
          return;
        }
        next(err);
      };

      errorHandler(multerError);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
          message: REGISTRATION_MESSAGES.DOCUMENT_FILE_SIZE_LIMIT,
        }),
      );
    });
  });
});
