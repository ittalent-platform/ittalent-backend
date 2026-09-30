import mongoose from 'mongoose';

import type { EnterpriseData, EnterpriseDoc } from '../../models/enterprise.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import type { PaginatedResult } from '../../shared/schemas/pagination.schemas.js';
import { usersService, type UsersService } from '../users/users.service.js';
import {
  ENTERPRISE_MESSAGES,
  VALID_STATUS_TRANSITIONS,
} from './enterprises.constants.js';
import {
  enterprisesRepository,
  type EnterprisesRepository,
} from './enterprises.repository.js';
import type {
  CreateEnterpriseDTO,
  EnterpriseDetailDTO,
  EnterpriseListQuery,
  EnterpriseSummaryDTO,
  UpdateEnterpriseDTO,
  UpdateEnterpriseStatusDTO,
} from './enterprises.schemas.js';

export class EnterprisesService {
  constructor(
    private readonly repository: EnterprisesRepository = enterprisesRepository,
    private readonly userService: UsersService = usersService,
  ) {}

  private mapSummary(enterprise: EnterpriseDoc): EnterpriseSummaryDTO {
    return {
      id: String(enterprise._id),
      name: enterprise.name,
      logoUrl: enterprise.logo_url ?? null,
      industry: enterprise.industry ?? null,
      location: enterprise.address ? `${enterprise.address.city}, ${enterprise.address.country}` : null,
      shortDescription: enterprise.short_description ?? null,
      companySize: enterprise.company_size ?? null,
      companyType: enterprise.company_type ?? null,
      techStack: enterprise.tech_stack ?? [],
      status: enterprise.status,
      email: enterprise.email ?? null,
      phone: enterprise.phone ?? null,
      createdAt: enterprise.createdAt ? enterprise.createdAt.toISOString() : null,
      creatorAccountId: enterprise.creator_account_id ? String(enterprise.creator_account_id) : null,
    };
  }

  private mapDetail(enterprise: EnterpriseDoc, activeJobsCount = 0): EnterpriseDetailDTO {
    return {
      id: String(enterprise._id),
      name: enterprise.name,
      legalName: enterprise.legal_name ?? null,
      taxCode: enterprise.tax_code ?? null,
      registrationNumber: enterprise.registration_number ?? null,
      email: enterprise.email,
      phone: enterprise.phone,
      website: enterprise.website ?? null,
      industry: enterprise.industry,
      subIndustries: enterprise.sub_industries ?? [],
      companySize: enterprise.company_size,
      companyType: enterprise.company_type ?? null,
      foundedYear: enterprise.founded_year ?? null,
      address: {
        street: enterprise.address.street,
        city: enterprise.address.city,
        district: enterprise.address.district,
        state_province: enterprise.address.state_province,
        country: enterprise.address.country,
        postal_code: enterprise.address.postal_code,
      },
      branches: (enterprise.branches ?? []).map((branch) => ({
        street: branch.street,
        city: branch.city,
        district: branch.district,
        state_province: branch.state_province,
        country: branch.country,
        postal_code: branch.postal_code,
      })),
      logoUrl: enterprise.logo_url ?? null,
      coverUrl: enterprise.cover_url ?? null,
      shortDescription: enterprise.short_description ?? null,
      description: enterprise.description ?? null,
      cultureSummary: enterprise.culture_summary ?? null,
      benefits: enterprise.benefits ?? [],
      techStack: enterprise.tech_stack ?? [],
      socialLinks: enterprise.social_links
        ? {
            linkedin: enterprise.social_links.linkedin,
            facebook: enterprise.social_links.facebook,
            github: enterprise.social_links.github,
            twitter: enterprise.social_links.twitter,
          }
        : null,
      workingDays: enterprise.working_days ?? null,
      mediaGallery: enterprise.media_gallery ?? [],
      status: enterprise.status,
      statusReason: enterprise.status_reason ?? null,
      creatorAccountId: String(enterprise.creator_account_id),
      activeJobsCount,
      createdAt: enterprise.createdAt ? enterprise.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: enterprise.updatedAt ? enterprise.updatedAt.toISOString() : new Date().toISOString(),
    };
  }

  async createEnterprise(
    data: CreateEnterpriseDTO,
    creatorId: string,
    role: string,
  ): Promise<EnterpriseDetailDTO> {
    const existingTax = await this.repository.findByTaxCode(data.tax_code);
    if (existingTax) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, ENTERPRISE_MESSAGES.TAX_CODE_ALREADY_EXISTS);
    }

    const existingEmail = await this.repository.findByEmail(data.email);
    if (existingEmail) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, ENTERPRISE_MESSAGES.EMAIL_ALREADY_EXISTS);
    }

    if (role !== 'admin') {
      const existingOwned = await this.repository.findByCreatorId(creatorId);
      if (existingOwned) {
        throw createHttpError(
          HTTP_STATUS.HTTP_409_CONFLICT,
          ENTERPRISE_MESSAGES.CREATOR_ALREADY_OWNS_ENTERPRISE,
        );
      }
    }

    if (role === 'recruiter' && await this.userService.getEnterpriseId(creatorId)) {
      throw createHttpError(
        HTTP_STATUS.HTTP_409_CONFLICT,
        ENTERPRISE_MESSAGES.CREATOR_ALREADY_OWNS_ENTERPRISE,
      );
    }

    const initialStatus = role === 'admin' ? 'active' : 'pending';

    const entityPayload: Partial<EnterpriseData> = {
      ...data,
      email: data.email.toLowerCase(),
      status: initialStatus,
      creator_account_id: new mongoose.Types.ObjectId(creatorId),
      is_deleted: false,
    };

    const created = await this.repository.create(entityPayload);
    if (role === 'recruiter') {
      const assignedUser = await this.userService.assignEnterprise(creatorId, String(created._id));
      if (!assignedUser) {
        throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, 'Recruiter not found');
      }
    }
    return this.mapDetail(created, 0);
  }

  async getRecruiterEnterpriseId(recruiterId: string): Promise<string | null> {
    return this.userService.getEnterpriseId(recruiterId);
  }

  async updateEnterprise(
    id: string,
    data: UpdateEnterpriseDTO,
    actorId: string,
    role: string,
  ): Promise<EnterpriseDetailDTO> {
    const enterprise = await this.repository.findById(id);
    if (!enterprise) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, ENTERPRISE_MESSAGES.NOT_FOUND);
    }

    const recruiterEnterpriseId = role === 'recruiter'
      ? await this.getRecruiterEnterpriseId(actorId)
      : null;
    const canManage = role === 'admin'
      || (role === 'recruiter' && recruiterEnterpriseId === String(enterprise._id))
      || (role !== 'recruiter' && String(enterprise.creator_account_id) === actorId);
    if (!canManage) {
      throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, ENTERPRISE_MESSAGES.UNAUTHORIZED_UPDATE);
    }

    if (data.tax_code && data.tax_code !== enterprise.tax_code) {
      if (role !== 'admin' && enterprise.status === 'active') {
        throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, ENTERPRISE_MESSAGES.TAX_CODE_IMMUTABLE);
      }

      const conflictTax = await this.repository.findByTaxCode(data.tax_code);
      if (conflictTax && String(conflictTax._id) !== id) {
        throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, ENTERPRISE_MESSAGES.TAX_CODE_ALREADY_EXISTS);
      }
    }

    if (data.email && data.email.toLowerCase() !== enterprise.email.toLowerCase()) {
      const conflictEmail = await this.repository.findByEmail(data.email);
      if (conflictEmail && String(conflictEmail._id) !== id) {
        throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, ENTERPRISE_MESSAGES.EMAIL_ALREADY_EXISTS);
      }
    }

    const updatePayload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        updatePayload[key] = value;
      }
    }
    if (typeof data.email === 'string') {
      updatePayload.email = data.email.toLowerCase();
    }

    const updated = await this.repository.updateById(id, { $set: updatePayload });
    if (!updated) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, ENTERPRISE_MESSAGES.NOT_FOUND);
    }

    const activeJobsCount = await this.repository.countActiveJobs(id);
    return this.mapDetail(updated, activeJobsCount);
  }

  async updateEnterpriseStatus(
    id: string,
    data: UpdateEnterpriseStatusDTO,
    adminId: string,
  ): Promise<EnterpriseDetailDTO> {
    const enterprise = await this.repository.findById(id);
    if (!enterprise) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, ENTERPRISE_MESSAGES.NOT_FOUND);
    }

    const allowedTransitions = VALID_STATUS_TRANSITIONS[enterprise.status] ?? [];
    if (!allowedTransitions.includes(data.status)) {
      throw createHttpError(
        HTTP_STATUS.HTTP_400_BAD_REQUEST,
        ENTERPRISE_MESSAGES.INVALID_STATUS_TRANSITION,
      );
    }

    const updatePayload = {
      status: data.status,
      status_reason: data.reason ?? undefined,
      status_updated_by: new mongoose.Types.ObjectId(adminId),
      status_updated_at: new Date(),
    };

    const updated = await this.repository.updateById(id, { $set: updatePayload });
    if (!updated) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, ENTERPRISE_MESSAGES.NOT_FOUND);
    }

    const activeJobsCount = await this.repository.countActiveJobs(id);
    return this.mapDetail(updated, activeJobsCount);
  }

  async deleteEnterprise(id: string, adminId: string): Promise<void> {
    const enterprise = await this.repository.findById(id);
    if (!enterprise) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, ENTERPRISE_MESSAGES.NOT_FOUND);
    }

    const activeJobs = await this.repository.countActiveJobs(id);
    if (activeJobs > 0) {
      throw createHttpError(
        HTTP_STATUS.HTTP_400_BAD_REQUEST,
        ENTERPRISE_MESSAGES.CANNOT_DELETE_WITH_ACTIVE_JOBS,
      );
    }

    await this.repository.softDelete(id, adminId);
  }

  async listEnterprises(
    query: EnterpriseListQuery,
    role?: string,
  ): Promise<PaginatedResult<EnterpriseSummaryDTO>> {
    const isAdmin = role === 'admin';
    const { items, total } = await this.repository.findPage(query, isAdmin);

    return {
      items: items.map((enterprise) => this.mapSummary(enterprise)),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  async getEnterpriseById(
    id: string,
    role?: string,
    userId?: string,
  ): Promise<EnterpriseDetailDTO> {
    const enterprise = await this.repository.findById(id);
    if (!enterprise) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, ENTERPRISE_MESSAGES.NOT_FOUND);
    }

    if (enterprise.status !== 'active') {
      const recruiterEnterpriseId = role === 'recruiter' && userId
        ? await this.getRecruiterEnterpriseId(userId)
        : null;
      const isOwner = userId && (
        (role === 'recruiter' && recruiterEnterpriseId === String(enterprise._id))
        || (role !== 'recruiter' && String(enterprise.creator_account_id) === userId)
      );
      const isAdmin = role === 'admin';

      if (!isAdmin && !isOwner) {
        throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, ENTERPRISE_MESSAGES.NOT_FOUND);
      }
    }

    const activeJobsCount = await this.repository.countActiveJobs(id);
    return this.mapDetail(enterprise, activeJobsCount);
  }
}

export const enterprisesService = new EnterprisesService();
