import mongoose, { type QueryFilter, type Types, type UpdateQuery } from 'mongoose';

import {
  Enterprise,
  type CompanySize,
  type EnterpriseData,
  type EnterpriseDoc,
  type EnterpriseStatus,
} from '../../models/enterprise.model.js';
import { JobPosting } from '../../models/job-posting.model.js';
import { PUBLIC_ENTERPRISE_STATUS } from './enterprises.constants.js';

export interface FindEnterprisesParams {
  page: number;
  limit: number;
  keyword?: string | undefined;
  industry?: string | undefined;
  location?: string | undefined;
  company_size?: CompanySize | undefined;
  status?: EnterpriseStatus | undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsRegex(value: string): RegExp {
  return new RegExp(escapeRegex(value), 'i');
}

function equalsRegex(value: string): RegExp {
  return new RegExp(`^${escapeRegex(value)}$`, 'i');
}

export class EnterprisesRepository {
  async create(data: Partial<EnterpriseData>): Promise<EnterpriseDoc> {
    const enterprise = new Enterprise(data);
    return enterprise.save();
  }

  async findById(id: string | Types.ObjectId): Promise<EnterpriseDoc | null> {
    return Enterprise.findOne({ _id: id, is_deleted: false }).exec();
  }

  async findByIdIncludeDeleted(id: string | Types.ObjectId): Promise<EnterpriseDoc | null> {
    return Enterprise.findById(id).exec();
  }

  async findByTaxCode(taxCode: string): Promise<EnterpriseDoc | null> {
    return Enterprise.findOne({ tax_code: taxCode, is_deleted: false }).exec();
  }

  async findByEmail(email: string): Promise<EnterpriseDoc | null> {
    return Enterprise.findOne({ email: email.toLowerCase(), is_deleted: false }).exec();
  }

  async findByCreatorId(creatorId: string | Types.ObjectId): Promise<EnterpriseDoc | null> {
    return Enterprise.findOne({
      creator_account_id: creatorId,
      is_deleted: false,
    }).exec();
  }

  async findPage(
    params: FindEnterprisesParams,
    isAdmin = false,
  ): Promise<{ items: EnterpriseDoc[]; total: number }> {
    const filter: QueryFilter<EnterpriseData> = {};

    if (isAdmin) {
      if (params.status) {
        filter.status = params.status;
        if (params.status === 'deleted') {
          filter.is_deleted = true;
        } else {
          filter.is_deleted = false;
        }
      } else {
        filter.is_deleted = false;
      }
    } else {
      filter.status = PUBLIC_ENTERPRISE_STATUS;
      filter.is_deleted = false;
    }

    if (params.keyword) {
      const keywordRegex = containsRegex(params.keyword);
      filter.$or = [
        { name: keywordRegex },
        { industry: keywordRegex },
        { 'address.city': keywordRegex },
        { 'address.country': keywordRegex },
        { tech_stack: keywordRegex },
      ];
    }

    if (params.industry) {
      filter.industry = equalsRegex(params.industry);
    }

    if (params.company_size) {
      filter.company_size = params.company_size;
    }

    if (params.location) {
      const locRegex = containsRegex(params.location);
      const locFilter = [
        { 'address.city': locRegex },
        { 'address.country': locRegex },
        { 'address.state_province': locRegex },
        { 'address.district': locRegex },
      ];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: locFilter }];
        delete filter.$or;
      } else {
        filter.$or = locFilter;
      }
    }

    const skip = (params.page - 1) * params.limit;

    const [items, total] = await Promise.all([
      Enterprise.find(filter)
        .sort({ name: 1, _id: 1 })
        .skip(skip)
        .limit(params.limit)
        .exec(),
      Enterprise.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async updateById(
    id: string | Types.ObjectId,
    updateData: UpdateQuery<EnterpriseData>,
  ): Promise<EnterpriseDoc | null> {
    return Enterprise.findOneAndUpdate(
      { _id: id, is_deleted: false },
      updateData,
      { returnDocument: 'after' },
    ).exec();
  }

  async softDelete(
    id: string | Types.ObjectId,
    adminId: string | Types.ObjectId,
  ): Promise<EnterpriseDoc | null> {
    return Enterprise.findOneAndUpdate(
      { _id: id, is_deleted: false },
      {
        $set: {
          is_deleted: true,
          status: 'deleted',
          deleted_at: new Date(),
          deleted_by: new mongoose.Types.ObjectId(adminId),
        },
      },
      { returnDocument: 'after' },
    ).exec();
  }

  // Published, not-yet-expired job postings per enterprise, for the public company list.
  async countOpenRolesByEnterpriseIds(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) {
      return new Map();
    }
    const now = new Date();
    const rows = await JobPosting.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      {
        $match: {
          enterprise_id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
          status: 'published',
          deleting: { $ne: true },
          $or: [{ expires_at: { $exists: false } }, { expires_at: null }, { expires_at: { $gt: now } }],
        },
      },
      { $group: { _id: '$enterprise_id', count: { $sum: 1 } } },
    ]).exec();
    return new Map(rows.map((row) => [String(row._id), row.count]));
  }

  async countActiveJobs(enterpriseId: string | Types.ObjectId): Promise<number> {
    const jobModel = mongoose.models.JobPosting || mongoose.models.Job;
    if (!jobModel) {
      return 0;
    }

    try {
      const count = await jobModel
        .countDocuments({
          enterprise_id: new mongoose.Types.ObjectId(enterpriseId),
          status: { $in: ['active', 'published', 'open'] },
        })
        .exec();
      return count;
    } catch {
      return 0;
    }
  }
}

export const enterprisesRepository = new EnterprisesRepository();