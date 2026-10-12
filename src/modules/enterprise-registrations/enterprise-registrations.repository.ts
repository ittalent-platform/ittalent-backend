import type { Types, UpdateQuery } from 'mongoose';

import {
  EnterpriseRegistration,
  type EnterpriseRegistrationData,
  type EnterpriseRegistrationDoc,
} from '../../models/enterprise-registration.model.js';

export class EnterpriseRegistrationsRepository {
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

  async updateById(
    id: string | Types.ObjectId,
    update: UpdateQuery<EnterpriseRegistrationData>,
  ): Promise<EnterpriseRegistrationDoc | null> {
    return EnterpriseRegistration.findByIdAndUpdate(id, update, { new: true })
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
}

export const enterpriseRegistrationsRepository = new EnterpriseRegistrationsRepository();
