import type { QueryFilter } from 'mongoose';

import { Enterprise, type EnterpriseDoc, type EnterpriseData } from '../../models/enterprise.model.js';
import { PUBLIC_ENTERPRISE_STATUS } from './enterprises.constants.js';

// BR-12/BR-16: only publicly viewable fields are ever loaded from the database.
const PUBLIC_FIELDS = 'name logo_url industry location short_description description website';

export type PublicEnterpriseDoc = Pick<
  EnterpriseDoc,
  '_id' | 'name' | 'logo_url' | 'industry' | 'location' | 'short_description' | 'description' | 'website'
>;

export interface FindEnterprisesParams {
  page: number;
  limit: number;
  keyword?: string | undefined;
  industry?: string | undefined;
  location?: string | undefined;
}

// User input is escaped so it is always matched literally (no regex injection).
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsRegex(value: string): RegExp {
  return new RegExp(escapeRegex(value), 'i');
}

function equalsRegex(value: string): RegExp {
  return new RegExp(`^${escapeRegex(value)}$`, 'i');
}

function buildFilter(params: FindEnterprisesParams): QueryFilter<EnterpriseData> {
  // The status condition is a top-level AND, so keyword/criteria can never widen visibility (BR-22).
  const filter: QueryFilter<EnterpriseData> = { status: PUBLIC_ENTERPRISE_STATUS };

  if (params.keyword) {
    const keywordRegex = containsRegex(params.keyword);
    filter.$or = [{ name: keywordRegex }, { industry: keywordRegex }, { location: keywordRegex }];
  }
  if (params.industry) {
    filter.industry = equalsRegex(params.industry);
  }
  if (params.location) {
    filter.location = equalsRegex(params.location);
  }

  return filter;
}

export class EnterprisesRepository {
  async findActivePage(
    params: FindEnterprisesParams,
  ): Promise<{ items: PublicEnterpriseDoc[]; total: number }> {
    const filter = buildFilter(params);
    const skip = (params.page - 1) * params.limit;

    const [items, total] = await Promise.all([
      Enterprise.find(filter)
        .select(PUBLIC_FIELDS)
        // Deterministic order so pages never overlap or skip records (NFR-3).
        .sort({ name: 1, _id: 1 })
        .skip(skip)
        .limit(params.limit)
        .lean<PublicEnterpriseDoc[]>()
        .exec(),
      Enterprise.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async findActiveById(id: string): Promise<PublicEnterpriseDoc | null> {
    return Enterprise.findOne({ _id: id, status: PUBLIC_ENTERPRISE_STATUS })
      .select(PUBLIC_FIELDS)
      .lean<PublicEnterpriseDoc>()
      .exec();
  }
}

export const enterprisesRepository = new EnterprisesRepository();