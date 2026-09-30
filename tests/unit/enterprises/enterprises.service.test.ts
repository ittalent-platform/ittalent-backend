import mongoose from 'mongoose';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { EnterpriseDoc } from '../../../src/models/enterprise.model.js';
import type { EnterprisesRepository } from '../../../src/modules/enterprises/enterprises.repository.js';
import { EnterprisesService } from '../../../src/modules/enterprises/enterprises.service.js';
import type { UsersService } from '../../../src/modules/users/users.service.js';

describe('EnterprisesService', () => {
  let mockRepo: Partial<EnterprisesRepository>;
  let mockUsersService: Partial<UsersService>;
  let service: EnterprisesService;

  const sampleEnterpriseId = new mongoose.Types.ObjectId();
  const sampleCreatorId = new mongoose.Types.ObjectId();
  const sampleAdminId = new mongoose.Types.ObjectId();

  const mockEnterpriseDoc: Partial<EnterpriseDoc> = {
    _id: sampleEnterpriseId,
    name: 'Tech Alpha Inc',
    legal_name: 'Tech Alpha Joint Stock Company',
    tax_code: '0109988776',
    email: 'contact@techalpha.io',
    phone: '+84988112233',
    website: 'https://techalpha.io',
    industry: 'Software Development',
    company_size: '51-200',
    company_type: 'Product',
    founded_year: 2020,
    address: {
      street: '100 Nguyen Van Linh',
      city: 'Da Nang',
      district: 'Hai Chau',
      state_province: 'Da Nang',
      country: 'Vietnam',
      postal_code: '550000',
    },
    branches: [],
    logo_url: 'https://cdn.example.com/logo.png',
    cover_url: 'https://cdn.example.com/cover.png',
    short_description: 'Building high scalability cloud products',
    description: 'Tech Alpha is an engineering-first technology firm.',
    culture_summary: 'Remote-first, transparent compensation.',
    benefits: ['13th month salary', 'Yearly performance bonus'],
    tech_stack: ['Node.js', 'TypeScript', 'Kubernetes'],
    social_links: {
      linkedin: 'https://linkedin.com/company/techalpha',
    },
    working_days: 'Monday - Friday',
    media_gallery: [],
    status: 'active',
    creator_account_id: sampleCreatorId,
    is_deleted: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };

  beforeEach(() => {
    mockRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByTaxCode: vi.fn(),
      findByEmail: vi.fn(),
      findByCreatorId: vi.fn(),
      findPage: vi.fn(),
      updateById: vi.fn(),
      softDelete: vi.fn(),
      countActiveJobs: vi.fn(),
    };
    mockUsersService = {
      getEnterpriseId: vi.fn().mockResolvedValue(null),
      assignEnterprise: vi.fn().mockResolvedValue({ _id: sampleCreatorId }),
    };
    service = new EnterprisesService(mockRepo as EnterprisesRepository, mockUsersService as UsersService);
  });

  describe('createEnterprise', () => {
    const createDto = {
      name: 'Tech Alpha Inc',
      tax_code: '0109988776',
      email: 'contact@techalpha.io',
      phone: '+84988112233',
      industry: 'Software Development',
      company_size: '51-200' as const,
      address: {
        street: '100 Nguyen Van Linh',
        city: 'Da Nang',
        country: 'Vietnam',
      },
    };

    it('creates an enterprise with status "pending" when role is recruiter', async () => {
      mockRepo.findByTaxCode = vi.fn().mockResolvedValue(null);
      mockRepo.findByEmail = vi.fn().mockResolvedValue(null);
      mockRepo.findByCreatorId = vi.fn().mockResolvedValue(null);
      mockRepo.create = vi.fn().mockResolvedValue({
        ...mockEnterpriseDoc,
        status: 'pending',
      } as EnterpriseDoc);

      const result = await service.createEnterprise(createDto, sampleCreatorId.toString(), 'recruiter');

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'pending',
          email: 'contact@techalpha.io',
        }),
      );
      expect(result.status).toBe('pending');
      expect(result.name).toBe('Tech Alpha Inc');
      expect(mockUsersService.assignEnterprise).toHaveBeenCalledWith(sampleCreatorId.toString(), sampleEnterpriseId.toString());
    });

    it('creates an enterprise with status "active" when role is admin', async () => {
      mockRepo.findByTaxCode = vi.fn().mockResolvedValue(null);
      mockRepo.findByEmail = vi.fn().mockResolvedValue(null);
      mockRepo.create = vi.fn().mockResolvedValue({
        ...mockEnterpriseDoc,
        status: 'active',
      } as EnterpriseDoc);

      const result = await service.createEnterprise(createDto, sampleAdminId.toString(), 'admin');

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
        }),
      );
      expect(result.status).toBe('active');
    });

    it('throws 409 conflict when tax_code already exists', async () => {
      mockRepo.findByTaxCode = vi.fn().mockResolvedValue(mockEnterpriseDoc as EnterpriseDoc);

      await expect(
        service.createEnterprise(createDto, sampleCreatorId.toString(), 'recruiter'),
      ).rejects.toThrow('This tax identification code is already registered');
    });

    it('throws 409 conflict when corporate email already exists', async () => {
      mockRepo.findByTaxCode = vi.fn().mockResolvedValue(null);
      mockRepo.findByEmail = vi.fn().mockResolvedValue(mockEnterpriseDoc as EnterpriseDoc);

      await expect(
        service.createEnterprise(createDto, sampleCreatorId.toString(), 'recruiter'),
      ).rejects.toThrow('This corporate email address is already registered');
    });

    it('throws 409 conflict when recruiter already owns an enterprise (1:1 constraint)', async () => {
      mockRepo.findByTaxCode = vi.fn().mockResolvedValue(null);
      mockRepo.findByEmail = vi.fn().mockResolvedValue(null);
      mockRepo.findByCreatorId = vi.fn().mockResolvedValue(mockEnterpriseDoc as EnterpriseDoc);

      await expect(
        service.createEnterprise(createDto, sampleCreatorId.toString(), 'recruiter'),
      ).rejects.toThrow('Your account is already associated with a registered enterprise profile');
    });

    it('throws 409 when recruiter is already assigned through enterprise_id', async () => {
      mockRepo.findByTaxCode = vi.fn().mockResolvedValue(null);
      mockRepo.findByEmail = vi.fn().mockResolvedValue(null);
      mockRepo.findByCreatorId = vi.fn().mockResolvedValue(null);
      mockUsersService.getEnterpriseId = vi.fn().mockResolvedValue(sampleEnterpriseId.toString());

      await expect(
        service.createEnterprise(createDto, sampleCreatorId.toString(), 'recruiter'),
      ).rejects.toThrow('Your account is already associated with a registered enterprise profile');
    });
  });

  describe('updateEnterprise', () => {
    it('allows owner recruiter to update enterprise information', async () => {
      mockUsersService.getEnterpriseId = vi.fn().mockResolvedValue(sampleEnterpriseId.toString());
      mockRepo.findById = vi.fn().mockResolvedValue(mockEnterpriseDoc as EnterpriseDoc);
      mockRepo.updateById = vi.fn().mockResolvedValue({
        ...mockEnterpriseDoc,
        phone: '+84999888777',
      } as EnterpriseDoc);
      mockRepo.countActiveJobs = vi.fn().mockResolvedValue(3);

      const result = await service.updateEnterprise(
        sampleEnterpriseId.toString(),
        { phone: '+84999888777' },
        sampleCreatorId.toString(),
        'recruiter',
      );

      expect(result.phone).toBe('+84999888777');
      expect(result.activeJobsCount).toBe(3);
    });

    it('allows admin to update any enterprise', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue(mockEnterpriseDoc as EnterpriseDoc);
      mockRepo.updateById = vi.fn().mockResolvedValue({
        ...mockEnterpriseDoc,
        name: 'Updated by Admin',
      } as EnterpriseDoc);
      mockRepo.countActiveJobs = vi.fn().mockResolvedValue(0);

      const result = await service.updateEnterprise(
        sampleEnterpriseId.toString(),
        { name: 'Updated by Admin' },
        sampleAdminId.toString(),
        'admin',
      );

      expect(result.name).toBe('Updated by Admin');
    });

    it('throws 403 forbidden when a non-owner recruiter attempts to update', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue(mockEnterpriseDoc as EnterpriseDoc);

      const otherUserId = new mongoose.Types.ObjectId().toString();
      mockUsersService.getEnterpriseId = vi.fn().mockResolvedValue(new mongoose.Types.ObjectId().toString());

      await expect(
        service.updateEnterprise(
          sampleEnterpriseId.toString(),
          { name: 'Hacked Name' },
          otherUserId,
          'recruiter',
        ),
      ).rejects.toThrow('You do not have permission to modify this enterprise profile');
    });

    it('throws 403 when recruiter attempts to modify tax_code on an active enterprise', async () => {
      mockUsersService.getEnterpriseId = vi.fn().mockResolvedValue(sampleEnterpriseId.toString());
      mockRepo.findById = vi.fn().mockResolvedValue({
        ...mockEnterpriseDoc,
        status: 'active',
      } as EnterpriseDoc);

      await expect(
        service.updateEnterprise(
          sampleEnterpriseId.toString(),
          { tax_code: '0987654321' },
          sampleCreatorId.toString(),
          'recruiter',
        ),
      ).rejects.toThrow('Tax identification code cannot be modified once approved');
    });

    it('throws 404 when target enterprise does not exist', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue(null);

      await expect(
        service.updateEnterprise(
          sampleEnterpriseId.toString(),
          { phone: '0123456789' },
          sampleCreatorId.toString(),
          'recruiter',
        ),
      ).rejects.toThrow('Enterprise not found');
    });
  });

  describe('updateEnterpriseStatus', () => {
    it('successfully transitions from pending to active', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue({
        ...mockEnterpriseDoc,
        status: 'pending',
      } as EnterpriseDoc);
      mockRepo.updateById = vi.fn().mockResolvedValue({
        ...mockEnterpriseDoc,
        status: 'active',
      } as EnterpriseDoc);
      mockRepo.countActiveJobs = vi.fn().mockResolvedValue(0);

      const result = await service.updateEnterpriseStatus(
        sampleEnterpriseId.toString(),
        { status: 'active' },
        sampleAdminId.toString(),
      );

      expect(result.status).toBe('active');
    });

    it('successfully transitions from active to suspended with reason', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue({
        ...mockEnterpriseDoc,
        status: 'active',
      } as EnterpriseDoc);
      mockRepo.updateById = vi.fn().mockResolvedValue({
        ...mockEnterpriseDoc,
        status: 'suspended',
        status_reason: 'Reported for fraudulent recruitment posts',
      } as EnterpriseDoc);
      mockRepo.countActiveJobs = vi.fn().mockResolvedValue(0);

      const result = await service.updateEnterpriseStatus(
        sampleEnterpriseId.toString(),
        {
          status: 'suspended',
          reason: 'Reported for fraudulent recruitment posts',
        },
        sampleAdminId.toString(),
      );

      expect(result.status).toBe('suspended');
    });

    it('throws 400 bad request on invalid status transition', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue({
        ...mockEnterpriseDoc,
        status: 'pending',
      } as EnterpriseDoc);

      await expect(
        service.updateEnterpriseStatus(
          sampleEnterpriseId.toString(),
          { status: 'suspended', reason: 'Invalid direct jump' },
          sampleAdminId.toString(),
        ),
      ).rejects.toThrow('The requested status transition violates platform lifecycle rules');
    });
  });

  describe('deleteEnterprise', () => {
    it('successfully soft-deletes enterprise when active jobs count is 0', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue(mockEnterpriseDoc as EnterpriseDoc);
      mockRepo.countActiveJobs = vi.fn().mockResolvedValue(0);
      mockRepo.softDelete = vi.fn().mockResolvedValue(mockEnterpriseDoc as EnterpriseDoc);

      await expect(
        service.deleteEnterprise(sampleEnterpriseId.toString(), sampleAdminId.toString()),
      ).resolves.toBeUndefined();

      expect(mockRepo.softDelete).toHaveBeenCalledWith(
        sampleEnterpriseId.toString(),
        sampleAdminId.toString(),
      );
    });

    it('throws 400 when enterprise currently has active job postings', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue(mockEnterpriseDoc as EnterpriseDoc);
      mockRepo.countActiveJobs = vi.fn().mockResolvedValue(2);

      await expect(
        service.deleteEnterprise(sampleEnterpriseId.toString(), sampleAdminId.toString()),
      ).rejects.toThrow('Cannot delete enterprise with active job postings');
    });

    it('throws 404 when enterprise to delete is not found', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue(null);

      await expect(
        service.deleteEnterprise(sampleEnterpriseId.toString(), sampleAdminId.toString()),
      ).rejects.toThrow('Enterprise not found');
    });
  });

  describe('listEnterprises', () => {
    it('returns paginated active enterprises for public requests', async () => {
      mockRepo.findPage = vi.fn().mockResolvedValue({
        items: [mockEnterpriseDoc as EnterpriseDoc],
        total: 1,
      });
      mockRepo.countOpenRolesByEnterpriseIds = vi
        .fn()
        .mockResolvedValue(new Map([[sampleEnterpriseId.toString(), 3]]));

      const result = await service.listEnterprises({ page: 1, limit: 10 });

      expect(mockRepo.findPage).toHaveBeenCalledWith({ page: 1, limit: 10 }, false);
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.items[0]?.name).toBe('Tech Alpha Inc');
      expect(mockRepo.countOpenRolesByEnterpriseIds).toHaveBeenCalledWith([sampleEnterpriseId.toString()]);
    });

    it('passes isAdmin true when role is admin', async () => {
      mockRepo.findPage = vi.fn().mockResolvedValue({
        items: [mockEnterpriseDoc as EnterpriseDoc],
        total: 1,
      });
      mockRepo.countOpenRolesByEnterpriseIds = vi.fn().mockResolvedValue(new Map());

      await service.listEnterprises({ page: 1, limit: 10, status: 'pending' }, 'admin');

      expect(mockRepo.findPage).toHaveBeenCalledWith(
        { page: 1, limit: 10, status: 'pending' },
        true,
      );
    });
  });

  describe('getEnterpriseById', () => {
    it('returns detail of active enterprise to unauthenticated guest', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue(mockEnterpriseDoc as EnterpriseDoc);
      mockRepo.countActiveJobs = vi.fn().mockResolvedValue(5);

      const result = await service.getEnterpriseById(sampleEnterpriseId.toString());

      expect(result.id).toBe(sampleEnterpriseId.toString());
      expect(result.activeJobsCount).toBe(5);
    });

    it('allows owner recruiter to view pending enterprise', async () => {
      mockUsersService.getEnterpriseId = vi.fn().mockResolvedValue(sampleEnterpriseId.toString());
      mockRepo.findById = vi.fn().mockResolvedValue({
        ...mockEnterpriseDoc,
        status: 'pending',
      } as EnterpriseDoc);
      mockRepo.countActiveJobs = vi.fn().mockResolvedValue(0);

      const result = await service.getEnterpriseById(
        sampleEnterpriseId.toString(),
        'recruiter',
        sampleCreatorId.toString(),
      );

      expect(result.status).toBe('pending');
    });

    it('throws 404 when non-owner guest requests pending enterprise', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue({
        ...mockEnterpriseDoc,
        status: 'pending',
      } as EnterpriseDoc);

      await expect(
        service.getEnterpriseById(sampleEnterpriseId.toString(), undefined, undefined),
      ).rejects.toThrow('Enterprise not found');
    });
  });
});
