import type { ClientSession, QueryFilter, Types, UpdateQuery } from 'mongoose';

import {
  EnterpriseRegistration,
  type EnterpriseRegistrationData,
  type EnterpriseRegistrationDoc,
} from '../../models/enterprise-registration.model.js';
import { REGISTRATION_CONFIG } from './enterprise-registrations.constants.js';
import type { RegistrationListQuery } from './enterprise-registrations.schemas.js';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsRegex(value: string): RegExp {
  return new RegExp(escapeRegex(value), 'i');
}

export class EnterpriseRegistrationsRepository {
  async hasIncompleteOnboarding(email: string, enterpriseId: Types.ObjectId | null, session?: ClientSession): Promise<boolean> {
    const query = EnterpriseRegistration.exists({
      $or: [
        { corporate_email: email.toLowerCase(), status: { $in: ['draft', 'pending_review', 'under_review'] } },
        {
          status: 'approved',
          'invitation_token.expires_at': { $gt: new Date() },
          'invitation_token.accepted_at': null,
          $or: [{ corporate_email: email.toLowerCase() }, ...(enterpriseId ? [{ created_enterprise_id: enterpriseId }] : [])],
        },
      ],
    });
    if (session) query.session(session);
    return Boolean(await query.exec());
  }

  async create(data: Partial<EnterpriseRegistrationData>): Promise<EnterpriseRegistrationDoc> {
    const registration = new EnterpriseRegistration(data);
    return registration.save();
  }

  async findById(id: string | Types.ObjectId): Promise<EnterpriseRegistrationDoc | null> {
    return EnterpriseRegistration.findById(id)
      .select('+verification_token.token_hash')
      .exec();
  }

  async findByCode(code: string): Promise<EnterpriseRegistrationDoc | null> {
    return EnterpriseRegistration.findOne({ registration_code: code })
      .select('+verification_token.token_hash')
      .exec();
  }

  async findByIdOrCode(identifier: string): Promise<EnterpriseRegistrationDoc | null> {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(identifier);
    if (isObjectId) {
      const doc = await this.findById(identifier);
      if (doc) {
        return doc;
      }
    }
    return this.findByCode(identifier);
  }

  async findByEmail(email: string): Promise<EnterpriseRegistrationDoc | null> {
    return EnterpriseRegistration.findOne({ corporate_email: email.toLowerCase() })
      .select('+verification_token.token_hash')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findDraftByEmail(email: string): Promise<EnterpriseRegistrationDoc | null> {
    return EnterpriseRegistration.findOne({
      corporate_email: email.toLowerCase(),
      status: 'draft',
    })
      .select('+verification_token.token_hash')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByTokenHash(tokenHash: string): Promise<EnterpriseRegistrationDoc | null> {
    return EnterpriseRegistration.findOne({
      'verification_token.token_hash': tokenHash,
    })
      .select('+verification_token.token_hash')
      .exec();
  }

  async findByInvitationTokenHash(tokenHash: string): Promise<EnterpriseRegistrationDoc | null> {
    return EnterpriseRegistration.findOne({
      'invitation_token.token_hash': tokenHash,
    })
      .select('+invitation_token.token_hash')
      .exec();
  }

  async updateById(
    id: string | Types.ObjectId,
    update: UpdateQuery<EnterpriseRegistrationData>,
  ): Promise<EnterpriseRegistrationDoc | null> {
    return EnterpriseRegistration.findByIdAndUpdate(id, update, { returnDocument: 'after' })
      .select('+verification_token.token_hash')
      .exec();
  }

  async hasPendingRegistrationByEmail(email: string): Promise<boolean> {
    const count = await EnterpriseRegistration.countDocuments({
      corporate_email: email.toLowerCase(),
      status: { $in: ['pending_review', 'under_review'] },
    }).exec();

    return count > 0;
  }

  async hasActiveClaim(
    email: string,
    taxCode?: string,
    excludeId?: string | Types.ObjectId,
  ): Promise<boolean> {
    const queryConditions: Array<Record<string, unknown>> = [
      { 'claim_locks.corporate_email': email.toLowerCase() },
    ];

    if (taxCode) {
      queryConditions.push({ 'claim_locks.tax_code': taxCode });
    }

    const filter: Record<string, unknown> = {
      status: { $in: ['pending_review', 'under_review'] },
      $or: queryConditions,
    };

    if (excludeId) {
      filter._id = { $ne: excludeId };
    }

    const count = await EnterpriseRegistration.countDocuments(filter).exec();

    return count > 0;
  }

  async findPage(
    params: Partial<RegistrationListQuery> = {},
  ): Promise<{ items: EnterpriseRegistrationDoc[]; total: number }> {
    const filter: QueryFilter<EnterpriseRegistrationData> = {};

    if (params.status) {
      filter.status = params.status;
    }

    if (params.search) {
      const searchRegex = containsRegex(params.search);
      filter.$or = [
        { registration_code: searchRegex },
        { corporate_email: searchRegex },
        { 'representative.full_name': searchRegex },
        { 'company_data.name': searchRegex },
        { 'company_data.tax_code': searchRegex },
      ];
    }

    const page = params.page ?? REGISTRATION_CONFIG.DEFAULT_PAGE;
    const limit = params.limit ?? REGISTRATION_CONFIG.DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      EnterpriseRegistration.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      EnterpriseRegistration.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }
}

export const enterpriseRegistrationsRepository = new EnterpriseRegistrationsRepository();
