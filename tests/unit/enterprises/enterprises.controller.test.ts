import { describe, expect, it, vi, beforeEach } from 'vitest';

import { EnterprisesController } from '../../../src/modules/enterprises/enterprises.controller.js';
import type { EnterprisesService } from '../../../src/modules/enterprises/enterprises.service.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';

describe('EnterprisesController', () => {
  let mockService: Partial<EnterprisesService>;
  let controller: EnterprisesController;

  const mockDetail = {
    id: '507f1f77bcf86cd799439011',
    name: 'Tech Alpha Inc',
    legalName: 'Tech Alpha JSC',
    taxCode: '0101234567',
    registrationNumber: 'REG-1234',
    email: 'contact@techalpha.io',
    phone: '+84988112233',
    website: 'https://techalpha.io',
    industry: 'Software Development',
    subIndustries: ['AI'],
    companySize: '51-200',
    companyType: 'Product',
    foundedYear: 2021,
    address: {
      street: '123 Tech Way',
      city: 'Hanoi',
      country: 'Vietnam',
    },
    branches: [],
    logoUrl: null,
    coverUrl: null,
    shortDescription: 'AI Solutions',
    description: 'Leading AI provider',
    cultureSummary: 'Agile & Collaborative',
    benefits: ['Bonus', 'Insurance'],
    techStack: ['Python', 'FastAPI', 'React'],
    socialLinks: null,
    workingDays: 'Mon-Fri',
    mediaGallery: [],
    status: 'active',
    statusReason: null,
    creatorAccountId: 'user-recruiter-1',
    activeJobsCount: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };

  beforeEach(() => {
    mockService = {
      createEnterprise: vi.fn(),
      updateEnterprise: vi.fn(),
      updateEnterpriseStatus: vi.fn(),
      deleteEnterprise: vi.fn(),
      listEnterprises: vi.fn(),
      getEnterpriseById: vi.fn(),
    };
    controller = new EnterprisesController(mockService as EnterprisesService);
  });

  describe('createEnterprise', () => {
    it('returns 201 Created with enterprise detail on success', async () => {
      mockService.createEnterprise = vi.fn().mockResolvedValue(mockDetail);

      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const req = {
        user: { id: 'user-1', email: 'recruiter@example.com', role: 'recruiter' },
      } as never;
      const res = {
        status,
        locals: {
          validated: {
            body: {
              name: 'Tech Alpha Inc',
              tax_code: '0101234567',
              email: 'contact@techalpha.io',
              phone: '+84988112233',
              industry: 'Software Development',
              company_size: '51-200',
              address: { street: '123 Tech Way', city: 'Hanoi', country: 'Vietnam' },
            },
          },
        },
      } as never;
      const next = vi.fn();

      await controller.createEnterprise(req, res, next);

      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_201_CREATED);
      expect(json).toHaveBeenCalledWith(mockDetail);
      expect(next).not.toHaveBeenCalled();
    });

    it('forwards error to next when service throws', async () => {
      const error = new Error('Conflict');
      mockService.createEnterprise = vi.fn().mockRejectedValue(error);

      const req = {
        user: { id: 'user-1', email: 'recruiter@example.com', role: 'recruiter' },
      } as never;
      const res = {
        status: vi.fn(),
        locals: { validated: { body: {} } },
      } as never;
      const next = vi.fn();

      await controller.createEnterprise(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('updateEnterprise', () => {
    it('returns 200 OK with updated enterprise data', async () => {
      const updated = { ...mockDetail, name: 'Renamed Inc' };
      mockService.updateEnterprise = vi.fn().mockResolvedValue(updated);

      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const req = {
        user: { id: 'user-1', email: 'recruiter@example.com', role: 'recruiter' },
      } as never;
      const res = {
        status,
        locals: {
          validated: {
            params: { enterpriseId: '507f1f77bcf86cd799439011' },
            body: { name: 'Renamed Inc' },
          },
        },
      } as never;
      const next = vi.fn();

      await controller.updateEnterprise(req, res, next);

      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(json).toHaveBeenCalledWith(updated);
    });
  });

  describe('updateEnterpriseStatus', () => {
    it('returns 200 OK with updated status', async () => {
      const suspended = { ...mockDetail, status: 'suspended', statusReason: 'Policy violation' };
      mockService.updateEnterpriseStatus = vi.fn().mockResolvedValue(suspended);

      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const req = {
        user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      } as never;
      const res = {
        status,
        locals: {
          validated: {
            params: { enterpriseId: '507f1f77bcf86cd799439011' },
            body: { status: 'suspended', reason: 'Policy violation' },
          },
        },
      } as never;
      const next = vi.fn();

      await controller.updateEnterpriseStatus(req, res, next);

      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(json).toHaveBeenCalledWith(suspended);
    });
  });

  describe('deleteEnterprise', () => {
    it('returns 200 OK with success deletion message', async () => {
      mockService.deleteEnterprise = vi.fn().mockResolvedValue(undefined);

      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const req = {
        user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      } as never;
      const res = {
        status,
        locals: {
          validated: {
            params: { enterpriseId: '507f1f77bcf86cd799439011' },
          },
        },
      } as never;
      const next = vi.fn();

      await controller.deleteEnterprise(req, res, next);

      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.any(String),
        }),
      );
    });
  });

  describe('listEnterprises', () => {
    it('returns 200 OK with paginated result', async () => {
      const paginatedResult = {
        items: [],
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      };
      mockService.listEnterprises = vi.fn().mockResolvedValue(paginatedResult);

      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const req = {} as never;
      const res = {
        status,
        locals: {
          validated: {
            query: { page: 1, limit: 10 },
          },
        },
      } as never;
      const next = vi.fn();

      await controller.listEnterprises(req, res, next);

      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(json).toHaveBeenCalledWith(paginatedResult);
    });
  });

  describe('getEnterpriseById', () => {
    it('returns 200 OK with enterprise detail', async () => {
      mockService.getEnterpriseById = vi.fn().mockResolvedValue(mockDetail);

      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const req = {} as never;
      const res = {
        status,
        locals: {
          validated: {
            params: { enterpriseId: '507f1f77bcf86cd799439011' },
          },
        },
      } as never;
      const next = vi.fn();

      await controller.getEnterpriseById(req, res, next);

      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(json).toHaveBeenCalledWith(mockDetail);
    });
  });
});
