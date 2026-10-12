import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnterpriseDoc } from '../../../src/models/enterprise.model.js';
import type { EnterpriseRegistrationDoc } from '../../../src/models/enterprise-registration.model.js';
import type { UserDoc } from '../../../src/models/user.model.js';
import { EnterpriseRegistrationsController } from '../../../src/modules/enterprise-registrations/enterprise-registrations.controller.js';
import type { EnterpriseRegistrationsRepository } from '../../../src/modules/enterprise-registrations/enterprise-registrations.repository.js';
import { EnterpriseRegistrationsService } from '../../../src/modules/enterprise-registrations/enterprise-registrations.service.js';
import type { EnterprisesService } from '../../../src/modules/enterprises/enterprises.service.js';
import type { UsersService } from '../../../src/modules/users/users.service.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';
import * as emailService from '../../../src/shared/services/email.service.js';

describe('Enterprise Registrations Intake & Verification', () => {
  let mockRepo: Partial<EnterpriseRegistrationsRepository>;
  let mockEnterpriseService: Partial<EnterprisesService>;
  let mockUserService: Partial<UsersService>;
  let service: EnterpriseRegistrationsService;
  let controller: EnterpriseRegistrationsController;

  const sampleId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    vi.restoreAllMocks();

    mockRepo = {
      create: vi.fn(),
      findByTokenHash: vi.fn(),
      findByEmail: vi.fn(),
      findDraftByEmail: vi.fn(),
      hasPendingRegistrationByEmail: vi.fn().mockResolvedValue(false),
    };

    mockEnterpriseService = {
      findByEmail: vi.fn().mockResolvedValue(null),
    };

    mockUserService = {
      findByEmail: vi.fn().mockResolvedValue(null),
    };

    vi.spyOn(emailService, 'sendEnterpriseRegistrationMagicLink').mockResolvedValue();

    service = new EnterpriseRegistrationsService(
      mockRepo as EnterpriseRegistrationsRepository,
      mockEnterpriseService as EnterprisesService,
      mockUserService as UsersService,
    );

    controller = new EnterpriseRegistrationsController(service);
  });

  describe('startRegistration', () => {
    const validInput = {
      corporate_email: 'recruiter@fpt.com',
      representative_name: 'John Doe',
      representative_phone: '+84901234567',
    };

    it('rejects personal or webmail email addresses', async () => {
      await expect(
        service.startRegistration({
          ...validInput,
          corporate_email: 'applicant@gmail.com',
        }),
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
      });
    });

    it('rejects email associated with an applicant candidate account', async () => {
      mockUserService.findByEmail = vi.fn().mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        email: validInput.corporate_email,
        role: 'applicant',
      } as unknown as UserDoc);

      await expect(service.startRegistration(validInput)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_409_CONFLICT,
      });
    });

    it('rejects email associated with a user already belonging to an enterprise', async () => {
      mockUserService.findByEmail = vi.fn().mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        email: validInput.corporate_email,
        role: 'recruiter',
        enterprise_id: new mongoose.Types.ObjectId(),
      } as unknown as UserDoc);

      await expect(service.startRegistration(validInput)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_409_CONFLICT,
      });
    });

    it('rejects email already claimed by an active enterprise profile', async () => {
      mockEnterpriseService.findByEmail = vi.fn().mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        email: validInput.corporate_email,
      } as unknown as EnterpriseDoc);

      await expect(service.startRegistration(validInput)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_409_CONFLICT,
      });
    });

    it('rejects email already locked in pending or under review registration', async () => {
      mockRepo.hasPendingRegistrationByEmail = vi.fn().mockResolvedValue(true);

      await expect(service.startRegistration(validInput)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_409_CONFLICT,
      });
    });

    it('creates a new draft and sends magic link when no draft exists', async () => {
      mockRepo.findDraftByEmail = vi.fn().mockResolvedValue(null);
      mockRepo.create = vi.fn().mockResolvedValue({
        _id: sampleId,
        registration_code: 'REG-20261011-ABCD',
      } as unknown as EnterpriseRegistrationDoc);

      const result = await service.startRegistration(validInput);

      expect(result).toEqual({
        message: expect.any(String),
        email: 'recruiter@fpt.com',
      });
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          corporate_email: 'recruiter@fpt.com',
          status: 'draft',
          version: 1,
          representative: {
            full_name: 'John Doe',
            phone: '+84901234567',
          },
          verification_token: expect.objectContaining({
            token_hash: expect.any(String),
            expires_at: expect.any(Date),
          }),
        }),
      );
      expect(emailService.sendEnterpriseRegistrationMagicLink).toHaveBeenCalledWith(
        'recruiter@fpt.com',
        'John Doe',
        expect.stringContaining('/enterprise-registration/verify?token='),
      );
    });

    it('updates existing draft and regenerates magic link token', async () => {
      const mockDraftSave = vi.fn().mockResolvedValue(true);
      const existingDraft = {
        _id: sampleId,
        corporate_email: 'recruiter@fpt.com',
        status: 'draft',
        representative: {
          full_name: 'Old Name',
          phone: '+84900000000',
        },
        verification_token: {
          token_hash: 'oldhash',
          expires_at: new Date(),
        },
        save: mockDraftSave,
      };

      mockRepo.findDraftByEmail = vi.fn().mockResolvedValue(existingDraft);

      const result = await service.startRegistration(validInput);

      expect(result.email).toBe('recruiter@fpt.com');
      expect(mockDraftSave).toHaveBeenCalled();
      expect(emailService.sendEnterpriseRegistrationMagicLink).toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    it('throws 400 when token hash is not found', async () => {
      mockRepo.findByTokenHash = vi.fn().mockResolvedValue(null);

      await expect(service.verifyEmail('invalidtoken123456789')).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
      });
    });

    it('throws 400 when verification token is expired', async () => {
      const expiredDate = new Date(Date.now() - 3600000); // 1 hour ago
      mockRepo.findByTokenHash = vi.fn().mockResolvedValue({
        _id: sampleId,
        verification_token: {
          token_hash: 'somehash',
          expires_at: expiredDate,
        },
      } as unknown as EnterpriseRegistrationDoc);

      await expect(service.verifyEmail('expiredtoken123456789')).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
      });
    });

    it('successfully verifies email and initializes draft session', async () => {
      const futureDate = new Date(Date.now() + 86400000); // in 24 hours
      const mockSave = vi.fn().mockResolvedValue(true);
      const mockDoc = {
        _id: sampleId,
        registration_code: 'REG-20261011-A1B2C3',
        status: 'draft',
        version: 1,
        corporate_email: 'rep@fpt.com',
        representative: {
          full_name: 'Jane Doe',
          phone: '+84901234567',
          position: 'Director',
        },
        verification_token: {
          token_hash: 'validhash',
          expires_at: futureDate,
        },
        save: mockSave,
      };

      mockRepo.findByTokenHash = vi.fn().mockResolvedValue(mockDoc);

      const result = await service.verifyEmail('validtoken123456789');

      expect(mockSave).toHaveBeenCalled();
      expect(result).toEqual({
        message: expect.any(String),
        registration_id: sampleId.toString(),
        registration_code: 'REG-20261011-A1B2C3',
        status: 'draft',
        version: 1,
        corporate_email: 'rep@fpt.com',
        representative: {
          full_name: 'Jane Doe',
          phone: '+84901234567',
          position: 'Director',
        },
      });
    });
  });

  describe('EnterpriseRegistrationsController', () => {
    it('startRegistration returns 201 Created', async () => {
      const req = {} as unknown as Request;
      const res = {
        locals: {
          validated: {
            body: {
              corporate_email: 'rep@fpt.com',
              representative_name: 'Jane Doe',
              representative_phone: '+84901234567',
            },
          },
        },
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      vi.spyOn(service, 'startRegistration').mockResolvedValue({
        message: 'Dispatched',
        email: 'rep@fpt.com',
      });

      await controller.startRegistration(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_201_CREATED);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Dispatched',
        email: 'rep@fpt.com',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('verifyEmail returns 200 OK', async () => {
      const req = {} as unknown as Request;
      const res = {
        locals: {
          validated: {
            query: {
              token: 'testtoken123456789',
            },
          },
        },
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      vi.spyOn(service, 'verifyEmail').mockResolvedValue({
        message: 'Verified',
        registration_id: sampleId.toString(),
        registration_code: 'REG-20261011-A1B2C3',
        status: 'draft',
        version: 1,
        corporate_email: 'rep@fpt.com',
        representative: {
          full_name: 'Jane Doe',
          phone: '+84901234567',
        },
      });

      await controller.verifyEmail(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          registration_code: 'REG-20261011-A1B2C3',
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });
  });
});
