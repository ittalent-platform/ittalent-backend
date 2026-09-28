import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import type { PaginatedResult } from '../../shared/schemas/pagination.schemas.js';
import { ENTERPRISE_MESSAGES } from './enterprises.constants.js';
import {
  enterprisesRepository,
  type EnterprisesRepository,
  type PublicEnterpriseDoc,
} from './enterprises.repository.js';
import type { EnterpriseDetailDTO, EnterpriseListQuery, EnterpriseSummaryDTO } from './enterprises.schemas.js';

export class EnterprisesService {
  constructor(private readonly repository: EnterprisesRepository = enterprisesRepository) {}

  private mapSummary(enterprise: PublicEnterpriseDoc): EnterpriseSummaryDTO {
    return {
      id: String(enterprise._id),
      name: enterprise.name,
      logoUrl: enterprise.logo_url ?? null,
      industry: enterprise.industry ?? null,
      location: enterprise.location ?? null,
      shortDescription: enterprise.short_description ?? null,
    };
  }

  private mapDetail(enterprise: PublicEnterpriseDoc): EnterpriseDetailDTO {
    return {
      ...this.mapSummary(enterprise),
      description: enterprise.description ?? null,
      website: enterprise.website ?? null,
    };
  }

  async listEnterprises(query: EnterpriseListQuery): Promise<PaginatedResult<EnterpriseSummaryDTO>> {
    const { items, total } = await this.repository.findActivePage(query);

    return {
      items: items.map((enterprise) => this.mapSummary(enterprise)),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  async getEnterpriseById(id: string): Promise<EnterpriseDetailDTO> {
    const enterprise = await this.repository.findActiveById(id);

    // Missing and non-Active enterprises look identical to the public (BR-15).
    if (!enterprise) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, ENTERPRISE_MESSAGES.NOT_FOUND);
    }

    return this.mapDetail(enterprise);
  }
}

export const enterprisesService = new EnterprisesService();