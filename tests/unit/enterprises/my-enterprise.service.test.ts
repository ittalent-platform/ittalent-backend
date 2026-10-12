import mongoose from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnterpriseDoc } from '../../../src/models/enterprise.model.js';
import { ENTERPRISE_MESSAGES } from '../../../src/modules/enterprises/enterprises.constants.js';
import type { EnterprisesRepository } from '../../../src/modules/enterprises/enterprises.repository.js';
import { EnterprisesService } from '../../../src/modules/enterprises/enterprises.service.js';
import type { UsersService } from '../../../src/modules/users/users.service.js';

describe('EnterprisesService - Manage My Enterprise Profile (UC 17 - UC 19)', () => {
  let mockRepo: Partial<EnterprisesRepository>;
  let mockUsersService: Partial<UsersService>;
  let service: EnterprisesService;

  const sampleEnterpriseId = new mongoose.Types.ObjectId();
  const sampleCreatorId = new mongoose.Types.ObjectId();

  const mockEnterpriseDoc: Partial<EnterpriseDoc> = {
    _id: sampleEnterpriseId,
    name: 'FPT Software',
    legal_name: 'FPT Software JSC',
    tax_code: '0101234567',
    email: 'contact@fpt.com',
    phone: '+84901234567',
    website: 'https://fptsoftware.com',
    industry: 'Information Technology',
    company_size: '501-1000',
    company_type: 'Product',
    address: {
      street: '17 Duy Tan',
      city: 'Ha Noi',
      country: 'Vietnam',
    },
    branches: [],
    logo_url: 'https://cdn.example.com/fpt-logo.png',
    cover_url: 'https://cdn.example.com/fpt-cover.png',
    status: 'active',
    creator_account_id: sampleCreatorId,
    is_deleted: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  };

  beforeEach(() => {
    mockRepo = {
      findById: vi.fn(),
      findByCreatorId: vi.fn(),
      findByTaxCode: vi.fn().mockResolvedValue(null),
      findByEmail: vi.fn().mockResolvedValue(null),
      updateById: vi.fn(),
      countActiveJobs: vi.fn().mockResolvedValue(5),
    };
    mockUsersService = {
      getEnterpriseId: vi.fn(),
      assignEnterprise: vi.fn(),
    };
    service = new EnterprisesService(
      mockRepo as EnterprisesRepository,
      mockUsersService as UsersService,
    );
  });

  describe('getMyEnterpriseProfile (UC-17 / UC-ME-ENT-01)', () => {
    it('retrieves enterprise profile via recruiter affiliation', async () => {
      mockUsersService.getEnterpriseId = vi.fn().mockResolvedValue(String(sampleEnterpriseId));
      mockRepo.findById = vi.fn().mockResolvedValue(mockEnterpriseDoc as never);

      const result = await service.getMyEnterpriseProfile(String(sampleCreatorId), 'recruiter');

      expect(result.id).toBe(String(sampleEnterpriseId));
      expect(result.name).toBe('FPT Software');
      expect(result.activeJobsCount).toBe(5);
    });

    it('retrieves enterprise profile via creator ownership if not recruiter-linked', async () => {
      mockUsersService.getEnterpriseId = vi.fn().mockResolvedValue(null);
      mockRepo.findByCreatorId = vi.fn().mockResolvedValue(mockEnterpriseDoc as never);
      mockRepo.findById = vi.fn().mockResolvedValue(mockEnterpriseDoc as never);

      const result = await service.getMyEnterpriseProfile(String(sampleCreatorId), 'user');

      expect(result.id).toBe(String(sampleEnterpriseId));
      expect(result.taxCode).toBe('0101234567');
    });

    it('throws 404 when authenticated user is not affiliated with any enterprise', async () => {
      mockUsersService.getEnterpriseId = vi.fn().mockResolvedValue(null);
      mockRepo.findByCreatorId = vi.fn().mockResolvedValue(null);

      await expect(
        service.getMyEnterpriseProfile('unknown-user', 'recruiter'),
      ).rejects.toThrow(ENTERPRISE_MESSAGES.NOT_FOUND);
    });
  });

  describe('Update My Enterprise Information & Avatar (UC-18 & UC-19)', () => {
    it('updates logo_url with data URL or new asset URL (UC-19)', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue(mockEnterpriseDoc as never);
      const updatedDoc = {
        ...mockEnterpriseDoc,
        logo_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      };
      mockRepo.updateById = vi.fn().mockResolvedValue(updatedDoc as never);

      const result = await service.updateEnterprise(
        String(sampleEnterpriseId),
        { logo_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' },
        String(sampleCreatorId),
        'admin',
      );

      expect(result.logoUrl).toContain('data:image/png');
      expect(mockRepo.updateById).toHaveBeenCalled();
    });

    it('allows clearing logo_url by setting to null (UC-19 Alternative Flow A3)', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue(mockEnterpriseDoc as never);
      const updatedDoc = {
        ...mockEnterpriseDoc,
        logo_url: null,
      };
      mockRepo.updateById = vi.fn().mockResolvedValue(updatedDoc as never);

      const result = await service.updateEnterprise(
        String(sampleEnterpriseId),
        { logo_url: null },
        String(sampleCreatorId),
        'admin',
      );

      expect(result.logoUrl).toBeNull();
      expect(mockRepo.updateById).toHaveBeenCalledWith(
        String(sampleEnterpriseId),
        { $set: { logo_url: null } },
      );
    });

    it('rejects modifying tax code on active enterprise by recruiter (BR-ME-04)', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue(mockEnterpriseDoc as never);
      mockUsersService.getEnterpriseId = vi.fn().mockResolvedValue(String(sampleEnterpriseId));

      await expect(
        service.updateEnterprise(
          String(sampleEnterpriseId),
          { tax_code: '0999999999' },
          String(sampleCreatorId),
          'recruiter',
        ),
      ).rejects.toThrow(ENTERPRISE_MESSAGES.TAX_CODE_IMMUTABLE);
    });

    it('rejects unauthorized update by non-owner recruiter (BR-ME-05)', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue(mockEnterpriseDoc as never);
      mockUsersService.getEnterpriseId = vi.fn().mockResolvedValue('507f1f77bcf86cd799439999'); // different enterprise

      await expect(
        service.updateEnterprise(
          String(sampleEnterpriseId),
          { name: 'Hijacked Enterprise' },
          'foreign-recruiter',
          'recruiter',
        ),
      ).rejects.toThrow(ENTERPRISE_MESSAGES.UNAUTHORIZED_UPDATE);
    });
  });
});
