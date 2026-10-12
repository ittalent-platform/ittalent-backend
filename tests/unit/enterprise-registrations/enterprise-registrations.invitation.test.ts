import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserDoc } from '../../../src/models/user.model.js';
import type { EnterpriseRegistrationDoc } from '../../../src/models/enterprise-registration.model.js';
import { EnterpriseRegistrationsController } from '../../../src/modules/enterprise-registrations/enterprise-registrations.controller.js';
import { REGISTRATION_MESSAGES } from '../../../src/modules/enterprise-registrations/enterprise-registrations.constants.js';
import type { EnterpriseRegistrationsRepository } from '../../../src/modules/enterprise-registrations/enterprise-registrations.repository.js';
import type { AcceptInvitationDTO } from '../../../src/modules/enterprise-registrations/enterprise-registrations.schemas.js';
import { EnterpriseRegistrationsService } from '../../../src/modules/enterprise-registrations/enterprise-registrations.service.js';
import type { EnterprisesService } from '../../../src/modules/enterprises/enterprises.service.js';
import type { UsersService } from '../../../src/modules/users/users.service.js';
import type { AuthService } from '../../../src/modules/auth/auth.service.js';
import { AUTH_MESSAGES } from '../../../src/modules/auth/auth.constants.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';

describe('Enterprise Registrations: Invitation Acceptance Workflow', () => {
  let mockRepo: Partial<EnterpriseRegistrationsRepository>;
  let mockEnterpriseService: Partial<EnterprisesService>;
  let mockUserService: Partial<UsersService>;
  let mockAuthService: Partial<AuthService>;
  let service: EnterpriseRegistrationsService;
  let controller: EnterpriseRegistrationsController;

  const sampleId = new mongoose.Types.ObjectId();
  const sampleEnterpriseId = new mongoose.Types.ObjectId();
  const sampleUserId = new mongoose.Types.ObjectId();
  const rawToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  function createMockApprovedDoc(overrides: Record<string, unknown> = {}): EnterpriseRegistrationDoc {
    const doc = {
      _id: sampleId,
      registration_code: 'REG-20261012-ABCD',
      corporate_email: 'rep@acmecorp.com',
      status: 'approved',
      version: 3,
      created_enterprise_id: sampleEnterpriseId,
      representative: {
        full_name: 'Jane Doe',
        phone: '+84901234567',
        position: 'Managing Director',
      },
      company_data: {
        name: 'Acme Global Corp',
        tax_code: '0101234567',
      },
      invitation_token: {
        token_hash: 'hashed-invitation-token',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        accepted_at: undefined,
      },
      save: vi.fn().mockResolvedValue(true),
      ...overrides,
    };
    return doc as unknown as EnterpriseRegistrationDoc;
  }

  function createMockUserDoc(overrides: Record<string, unknown> = {}): UserDoc {
    const user = {
      _id: sampleUserId,
      email: 'rep@acmecorp.com',
      username: 'janedoe',
      role: 'user',
      status: 'active',
      email_verified: true,
      enterprise_id: null,
      toObject: vi.fn().mockReturnValue({
        _id: sampleUserId,
        email: 'rep@acmecorp.com',
        username: 'janedoe',
        full_name: 'Jane Doe',
        phone: '+84901234567',
        role: 'enterprise_admin',
        status: 'active',
        email_verified: true,
      }),
      ...overrides,
    };
    return user as unknown as UserDoc;
  }

  const sampleTokens = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
  };

  const sampleUserDto = {
    id: sampleUserId.toString(),
    email: 'rep@acmecorp.com',
    username: 'janedoe',
    fullName: 'Jane Doe',
    phone: '+84901234567',
    role: 'enterprise_admin' as const,
    status: 'active' as const,
    emailVerified: true,
    enterpriseId: sampleEnterpriseId.toString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      findByInvitationTokenHash: vi.fn(),
    };

    mockEnterpriseService = {
      getEnterpriseById: vi.fn(),
    };

    mockUserService = {
      findByEmail: vi.fn().mockResolvedValue(null),
      existsByUsername: vi.fn().mockResolvedValue(false),
      createUser: vi.fn().mockResolvedValue(createMockUserDoc()),
      assignEnterprise: vi.fn().mockResolvedValue(createMockUserDoc()),
      assignRole: vi.fn().mockResolvedValue(createMockUserDoc()),
      mapUserDto: vi.fn().mockReturnValue(sampleUserDto),
    };

    mockAuthService = {
      hasLocalAccount: vi.fn().mockResolvedValue(false),
      verifyLocalPassword: vi.fn().mockResolvedValue(true),
      createLocalAccount: vi.fn().mockResolvedValue({} as never),
      issueTokens: vi.fn().mockReturnValue(sampleTokens),
    };

    service = new EnterpriseRegistrationsService(
      mockRepo as EnterpriseRegistrationsRepository,
      mockEnterpriseService as EnterprisesService,
      mockUserService as UsersService,
      mockAuthService as AuthService,
    );

    controller = new EnterpriseRegistrationsController(service);
  });

  describe('Service: acceptInvitation', () => {
    it('successfully provisions new user, sets up password, redeems token, and returns tokens', async () => {
      const mockDoc = createMockApprovedDoc();
      vi.mocked(mockRepo.findByInvitationTokenHash!).mockResolvedValue(mockDoc);

      const payload: AcceptInvitationDTO = {
        token: rawToken,
        password: 'ValidPassword123!',
      };

      const result = await service.acceptInvitation(payload);

      expect(mockRepo.findByInvitationTokenHash).toHaveBeenCalled();
      expect(mockUserService.findByEmail).toHaveBeenCalledWith('rep@acmecorp.com');
      expect(mockUserService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'rep@acmecorp.com',
          role: 'enterprise_admin',
          status: 'active',
          email_verified: true,
          enterprise_id: sampleEnterpriseId,
          full_name: 'Jane Doe',
          phone: '+84901234567',
        }),
      );
      expect(mockAuthService.createLocalAccount).toHaveBeenCalledWith(sampleUserId, 'ValidPassword123!');
      expect(mockDoc.invitation_token?.accepted_at).toBeInstanceOf(Date);
      expect(mockDoc.version).toBe(4);
      expect(mockDoc.save).toHaveBeenCalled();
      expect(result).toEqual({
        message: REGISTRATION_MESSAGES.INVITATION_ACCEPTED,
        user: sampleUserDto,
        tokens: sampleTokens,
      });
    });

    it('uses provided username when accepting invitation for new user', async () => {
      const mockDoc = createMockApprovedDoc();
      vi.mocked(mockRepo.findByInvitationTokenHash!).mockResolvedValue(mockDoc);
      vi.mocked(mockUserService.existsByUsername!).mockResolvedValue(false);

      const payload: AcceptInvitationDTO = {
        token: rawToken,
        password: 'ValidPassword123!',
        username: 'custom_admin_handle',
      };

      await service.acceptInvitation(payload);

      expect(mockUserService.existsByUsername).toHaveBeenCalledWith('custom_admin_handle');
      expect(mockUserService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'custom_admin_handle',
        }),
      );
    });

    it('rejects with 409 Conflict if custom username already exists', async () => {
      const mockDoc = createMockApprovedDoc();
      vi.mocked(mockRepo.findByInvitationTokenHash!).mockResolvedValue(mockDoc);
      vi.mocked(mockUserService.existsByUsername!).mockResolvedValue(true);

      const payload: AcceptInvitationDTO = {
        token: rawToken,
        password: 'ValidPassword123!',
        username: 'existing_username',
      };

      await expect(service.acceptInvitation(payload)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_409_CONFLICT,
        message: REGISTRATION_MESSAGES.USERNAME_ALREADY_EXISTS,
      });
    });

    it('handles existing user with valid local credentials, elevates role, and assigns enterprise', async () => {
      const mockDoc = createMockApprovedDoc();
      vi.mocked(mockRepo.findByInvitationTokenHash!).mockResolvedValue(mockDoc);

      const existingUser = createMockUserDoc({ role: 'user' });
      vi.mocked(mockUserService.findByEmail!).mockResolvedValue(existingUser);
      vi.mocked(mockAuthService.hasLocalAccount!).mockResolvedValue(true);
      vi.mocked(mockAuthService.verifyLocalPassword!).mockResolvedValue(true);

      const payload: AcceptInvitationDTO = {
        token: rawToken,
        password: 'ValidPassword123!',
      };

      const result = await service.acceptInvitation(payload);

      expect(mockAuthService.verifyLocalPassword).toHaveBeenCalledWith(sampleUserId, 'ValidPassword123!');
      expect(mockUserService.assignRole).toHaveBeenCalledWith(sampleUserId.toString(), 'enterprise_admin');
      expect(mockUserService.assignEnterprise).toHaveBeenCalledWith(
        sampleUserId.toString(),
        sampleEnterpriseId.toString(),
      );
      expect(mockUserService.createUser).not.toHaveBeenCalled();
      expect(mockDoc.invitation_token?.accepted_at).toBeInstanceOf(Date);
      expect(result.tokens).toEqual(sampleTokens);
    });

    it('creates local account for existing user who only has OAuth authentication', async () => {
      const mockDoc = createMockApprovedDoc();
      vi.mocked(mockRepo.findByInvitationTokenHash!).mockResolvedValue(mockDoc);

      const existingUser = createMockUserDoc({ role: 'applicant' });
      vi.mocked(mockUserService.findByEmail!).mockResolvedValue(existingUser);
      vi.mocked(mockAuthService.hasLocalAccount!).mockResolvedValue(false);

      const payload: AcceptInvitationDTO = {
        token: rawToken,
        password: 'ValidPassword123!',
      };

      await service.acceptInvitation(payload);

      expect(mockAuthService.createLocalAccount).toHaveBeenCalledWith(sampleUserId, 'ValidPassword123!');
      expect(mockUserService.assignRole).toHaveBeenCalledWith(sampleUserId.toString(), 'enterprise_admin');
      expect(mockUserService.assignEnterprise).toHaveBeenCalledWith(
        sampleUserId.toString(),
        sampleEnterpriseId.toString(),
      );
    });

    it('rejects with 401 Unauthorized if existing user supplies wrong password', async () => {
      const mockDoc = createMockApprovedDoc();
      vi.mocked(mockRepo.findByInvitationTokenHash!).mockResolvedValue(mockDoc);

      const existingUser = createMockUserDoc({ role: 'user' });
      vi.mocked(mockUserService.findByEmail!).mockResolvedValue(existingUser);
      vi.mocked(mockAuthService.hasLocalAccount!).mockResolvedValue(true);
      vi.mocked(mockAuthService.verifyLocalPassword!).mockResolvedValue(false);

      const payload: AcceptInvitationDTO = {
        token: rawToken,
        password: 'WrongPassword123!',
      };

      await expect(service.acceptInvitation(payload)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_401_UNAUTHORIZED,
        message: AUTH_MESSAGES.INVALID_CREDENTIALS,
      });
      expect(mockDoc.save).not.toHaveBeenCalled();
    });

    it('rejects if invitation token is non-existent', async () => {
      vi.mocked(mockRepo.findByInvitationTokenHash!).mockResolvedValue(null);

      const payload: AcceptInvitationDTO = {
        token: rawToken,
        password: 'ValidPassword123!',
      };

      await expect(service.acceptInvitation(payload)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
        message: REGISTRATION_MESSAGES.INVITATION_INVALID_OR_EXPIRED,
      });
    });

    it('rejects if registration status is not approved', async () => {
      const mockDoc = createMockApprovedDoc({ status: 'pending_review' });
      vi.mocked(mockRepo.findByInvitationTokenHash!).mockResolvedValue(mockDoc);

      const payload: AcceptInvitationDTO = {
        token: rawToken,
        password: 'ValidPassword123!',
      };

      await expect(service.acceptInvitation(payload)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
        message: REGISTRATION_MESSAGES.INVITATION_INVALID_OR_EXPIRED,
      });
    });

    it('rejects if enterprise entity is not linked to registration', async () => {
      const mockDoc = createMockApprovedDoc({ created_enterprise_id: undefined });
      vi.mocked(mockRepo.findByInvitationTokenHash!).mockResolvedValue(mockDoc);

      const payload: AcceptInvitationDTO = {
        token: rawToken,
        password: 'ValidPassword123!',
      };

      await expect(service.acceptInvitation(payload)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
        message: REGISTRATION_MESSAGES.ENTERPRISE_NOT_LINKED,
      });
    });

    it('rejects if invitation token has already been accepted', async () => {
      const mockDoc = createMockApprovedDoc({
        invitation_token: {
          token_hash: 'hashed-invitation-token',
          expires_at: new Date(Date.now() + 86400000),
          accepted_at: new Date(Date.now() - 3600000), // Accepted 1 hour ago
        },
      });
      vi.mocked(mockRepo.findByInvitationTokenHash!).mockResolvedValue(mockDoc);

      const payload: AcceptInvitationDTO = {
        token: rawToken,
        password: 'ValidPassword123!',
      };

      await expect(service.acceptInvitation(payload)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
        message: REGISTRATION_MESSAGES.INVITATION_ALREADY_ACCEPTED,
      });
    });

    it('rejects if invitation token has expired', async () => {
      const mockDoc = createMockApprovedDoc({
        invitation_token: {
          token_hash: 'hashed-invitation-token',
          expires_at: new Date(Date.now() - 1000), // Expired 1 second ago
          accepted_at: undefined,
        },
      });
      vi.mocked(mockRepo.findByInvitationTokenHash!).mockResolvedValue(mockDoc);

      const payload: AcceptInvitationDTO = {
        token: rawToken,
        password: 'ValidPassword123!',
      };

      await expect(service.acceptInvitation(payload)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
        message: REGISTRATION_MESSAGES.INVITATION_INVALID_OR_EXPIRED,
      });
    });
  });

  describe('Controller: acceptInvitation', () => {
    it('dispatches request to service and responds with 200 OK', async () => {
      const payload: AcceptInvitationDTO = {
        token: rawToken,
        password: 'ValidPassword123!',
      };

      const mockResult = {
        message: REGISTRATION_MESSAGES.INVITATION_ACCEPTED,
        user: sampleUserDto,
        tokens: sampleTokens,
      };

      vi.spyOn(service, 'acceptInvitation').mockResolvedValue(mockResult);

      const req = {} as Request;
      const res = {
        locals: {
          validated: {
            body: payload,
          },
        },
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      await controller.acceptInvitation(req, res, next);

      expect(service.acceptInvitation).toHaveBeenCalledWith(payload);
      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(next).not.toHaveBeenCalled();
    });

    it('forwards error to error handling middleware', async () => {
      const error = new Error('Unexpected error');
      vi.spyOn(service, 'acceptInvitation').mockRejectedValue(error);

      const req = {} as Request;
      const res = {
        locals: {
          validated: {
            body: { token: rawToken, password: 'Pass' },
          },
        },
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      await controller.acceptInvitation(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
