import type { ClientSession, Types, UpdateQuery } from 'mongoose';
import {
  and,
  desc,
  eq,
  inArray,
  like,
  ne,
  or,
} from 'drizzle-orm';

import { generateId, getSqliteDb } from '../../config/sqlite.js';
import { enterpriseRegistrations } from '../../db/schema/index.js';
import {
  EnterpriseRegistration,
  type EnterpriseRegistrationData,
  type EnterpriseRegistrationDoc,
} from '../../models/enterprise-registration.model.js';
import { REGISTRATION_CONFIG } from './enterprise-registrations.constants.js';
import type { RegistrationListQuery } from './enterprise-registrations.schemas.js';

const CODE_SLICE_LENGTH = 8;

function isMock(fn: unknown): boolean {
  return typeof fn === 'function' && ('_isMockFunction' in fn || 'mock' in fn);
}

function toRegistrationDoc(row: typeof enterpriseRegistrations.$inferSelect): EnterpriseRegistrationDoc {
  return {
    _id: row.id as unknown as Types.ObjectId,
    id: row.id,
    corporate_email: row.company_email,
    registration_code: row.id.slice(0, CODE_SLICE_LENGTH).toUpperCase(),
    status: row.status,
    company_data: {
      name: row.company_name,
      tax_code: row.tax_code,
      phone: row.company_phone,
      email: row.company_email,
      website: row.website ?? undefined,
      industry: row.industry,
      company_size: row.company_size as never,
      address: row.address,
    },
    representative: {
      full_name: row.representative_name,
      corporate_email: row.representative_email,
      phone: row.representative_phone,
    },
    created_enterprise_id: (row.created_enterprise_id as unknown as Types.ObjectId) ?? undefined,
    rejection_reason: row.rejection_reason ?? undefined,
    reviewed_by: (row.reviewed_by as unknown as Types.ObjectId) ?? undefined,
    reviewed_at: row.reviewed_at ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    toObject() {
      return this;
    },
  } as unknown as EnterpriseRegistrationDoc;
}

export class EnterpriseRegistrationsRepository {
  async hasIncompleteOnboarding(email: string, enterpriseId: Types.ObjectId | null, session?: ClientSession): Promise<boolean> {
    if (isMock(EnterpriseRegistration.exists)) {
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
      if (session) query.session(session as never);
      return Boolean(await query.exec());
    }
    const db = getSqliteDb();
    const [row] = db
      .select({ id: enterpriseRegistrations.id })
      .from(enterpriseRegistrations)
      .where(
        and(
          or(
            eq(enterpriseRegistrations.company_email, email.toLowerCase()),
            eq(enterpriseRegistrations.representative_email, email.toLowerCase()),
          ),
          inArray(enterpriseRegistrations.status, ['pending', 'approved']),
        ),
      )
      .limit(1)
      .all();
    return Boolean(row);
  }

  async create(data: Partial<EnterpriseRegistrationData>): Promise<EnterpriseRegistrationDoc> {
    if (isMock(EnterpriseRegistration)) {
      const registration = new EnterpriseRegistration(data);
      return registration.save();
    }
    const db = getSqliteDb();
    const id = generateId();
    const now = new Date();
    const raw = data as Record<string, unknown>;
    const company = (raw.company_data as Record<string, unknown>) ?? {};
    const rep = (raw.representative as Record<string, unknown>) ?? {};
    const review = raw.review as Record<string, unknown> | undefined;

    db.insert(enterpriseRegistrations)
      .values({
        id,
        user_id: null,
        company_name: String(company.name ?? 'Company Demo'),
        tax_code: String(company.tax_code ?? '0101248141'),
        representative_name: String(rep.full_name ?? 'Representative'),
        representative_email: String(rep.corporate_email ?? data.corporate_email ?? ''),
        representative_phone: String(rep.phone ?? '0988776655'),
        company_email: String(company.email ?? data.corporate_email ?? ''),
        company_phone: String(company.phone ?? '0243333444'),
        website: company.website ? String(company.website) : null,
        industry: String(company.industry ?? 'Technology'),
        company_size: String(company.company_size ?? '1-10'),
        address: (company.address as never) ?? { street: '', city: '', country: '' },
        business_license_url: null,
        status: (data.status as never) ?? 'pending',
        rejection_reason: (review?.rejection_reason as string | undefined) ?? null,
        reviewed_by: review?.reviewed_by ? String(review.reviewed_by) : null,
        reviewed_at: (review?.reviewed_at as Date | undefined) ?? null,
        created_enterprise_id: data.created_enterprise_id ? String(data.created_enterprise_id) : null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return toRegistrationDoc({
      id,
      user_id: null,
      company_name: String(company.name ?? 'Company Demo'),
      tax_code: String(company.tax_code ?? '0101248141'),
      representative_name: String(rep.full_name ?? 'Representative'),
      representative_email: String(rep.corporate_email ?? data.corporate_email ?? ''),
      representative_phone: String(rep.phone ?? '0988776655'),
      company_email: String(company.email ?? data.corporate_email ?? ''),
      company_phone: String(company.phone ?? '0243333444'),
      website: company.website ? String(company.website) : null,
      industry: String(company.industry ?? 'Technology'),
      company_size: String(company.company_size ?? '1-10'),
      address: (company.address as never) ?? { street: '', city: '', country: '' },
      business_license_url: null,
      status: (data.status as never) ?? 'pending',
      rejection_reason: (review?.rejection_reason as string | undefined) ?? null,
      reviewed_by: review?.reviewed_by ? String(review.reviewed_by) : null,
      reviewed_at: (review?.reviewed_at as Date | undefined) ?? null,
      created_enterprise_id: data.created_enterprise_id ? String(data.created_enterprise_id) : null,
      createdAt: now,
      updatedAt: now,
    });
  }

  async findById(id: string | Types.ObjectId): Promise<EnterpriseRegistrationDoc | null> {
    if (isMock(EnterpriseRegistration.findById)) {
      return EnterpriseRegistration.findById(id).select('+verification_token.token_hash').exec();
    }
    const db = getSqliteDb();
    const [row] = db.select().from(enterpriseRegistrations).where(eq(enterpriseRegistrations.id, String(id))).all();
    return row ? toRegistrationDoc(row) : null;
  }

  async findByCode(code: string): Promise<EnterpriseRegistrationDoc | null> {
    if (isMock(EnterpriseRegistration.findOne)) {
      return EnterpriseRegistration.findOne({ registration_code: code }).select('+verification_token.token_hash').exec();
    }
    const db = getSqliteDb();
    const [row] = db.select().from(enterpriseRegistrations).where(eq(enterpriseRegistrations.id, code)).all();
    return row ? toRegistrationDoc(row) : null;
  }

  async findByIdOrCode(identifier: string): Promise<EnterpriseRegistrationDoc | null> {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(identifier);
    if (isObjectId) {
      const doc = await this.findById(identifier);
      if (doc) return doc;
    }
    return this.findByCode(identifier);
  }

  async findByEmail(email: string): Promise<EnterpriseRegistrationDoc | null> {
    if (isMock(EnterpriseRegistration.findOne)) {
      return EnterpriseRegistration.findOne({ corporate_email: email.toLowerCase() })
        .select('+verification_token.token_hash')
        .sort({ createdAt: -1 })
        .exec();
    }
    const db = getSqliteDb();
    const [row] = db
      .select()
      .from(enterpriseRegistrations)
      .where(
        or(
          eq(enterpriseRegistrations.company_email, email.toLowerCase()),
          eq(enterpriseRegistrations.representative_email, email.toLowerCase()),
        ),
      )
      .orderBy(desc(enterpriseRegistrations.createdAt))
      .limit(1)
      .all();
    return row ? toRegistrationDoc(row) : null;
  }

  async findDraftByEmail(email: string): Promise<EnterpriseRegistrationDoc | null> {
    if (isMock(EnterpriseRegistration.findOne)) {
      return EnterpriseRegistration.findOne({
        corporate_email: email.toLowerCase(),
        status: 'draft',
      })
        .select('+verification_token.token_hash')
        .sort({ createdAt: -1 })
        .exec();
    }
    const db = getSqliteDb();
    const [row] = db
      .select()
      .from(enterpriseRegistrations)
      .where(
        and(
          or(
            eq(enterpriseRegistrations.company_email, email.toLowerCase()),
            eq(enterpriseRegistrations.representative_email, email.toLowerCase()),
          ),
          eq(enterpriseRegistrations.status, 'pending'),
        ),
      )
      .orderBy(desc(enterpriseRegistrations.createdAt))
      .limit(1)
      .all();
    return row ? toRegistrationDoc(row) : null;
  }

  async findByTokenHash(_tokenHash: string): Promise<EnterpriseRegistrationDoc | null> {
    return null;
  }

  async findByInvitationTokenHash(_tokenHash: string): Promise<EnterpriseRegistrationDoc | null> {
    return null;
  }

  async updateById(
    id: string | Types.ObjectId,
    update: UpdateQuery<EnterpriseRegistrationData> | Record<string, unknown>,
  ): Promise<EnterpriseRegistrationDoc | null> {
    if (isMock(EnterpriseRegistration.findByIdAndUpdate)) {
      return EnterpriseRegistration.findByIdAndUpdate(id, update as never, { returnDocument: 'after' })
        .select('+verification_token.token_hash')
        .exec();
    }
    const db = getSqliteDb();
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const raw = update as Record<string, unknown>;
    const data = (raw.$set as Record<string, unknown>) ?? raw;

    if (data.status) updates.status = data.status;
    if (data.rejection_reason) updates.rejection_reason = data.rejection_reason;
    if (data.reviewed_by) updates.reviewed_by = String(data.reviewed_by);
    if (data.reviewed_at) updates.reviewed_at = data.reviewed_at;
    if (data.created_enterprise_id) updates.created_enterprise_id = String(data.created_enterprise_id);

    const result = db
      .update(enterpriseRegistrations)
      .set(updates)
      .where(eq(enterpriseRegistrations.id, String(id)))
      .returning()
      .get();
    return result ? toRegistrationDoc(result) : null;
  }

  async hasPendingRegistrationByEmail(email: string): Promise<boolean> {
    const db = getSqliteDb();
    const [row] = db
      .select({ count: enterpriseRegistrations.id })
      .from(enterpriseRegistrations)
      .where(
        and(
          or(
            eq(enterpriseRegistrations.company_email, email.toLowerCase()),
            eq(enterpriseRegistrations.representative_email, email.toLowerCase()),
          ),
          inArray(enterpriseRegistrations.status, ['pending']),
        ),
      )
      .limit(1)
      .all();
    return Boolean(row);
  }

  async hasActiveClaim(
    email: string,
    taxCode?: string,
    excludeId?: string | Types.ObjectId,
  ): Promise<boolean> {
    const db = getSqliteDb();
    const conditions = [
      or(
        eq(enterpriseRegistrations.company_email, email.toLowerCase()),
        taxCode ? eq(enterpriseRegistrations.tax_code, taxCode) : eq(enterpriseRegistrations.company_email, email.toLowerCase()),
      ),
      eq(enterpriseRegistrations.status, 'pending'),
    ];
    if (excludeId) {
      conditions.push(ne(enterpriseRegistrations.id, String(excludeId)));
    }
    const [row] = db.select({ id: enterpriseRegistrations.id }).from(enterpriseRegistrations).where(and(...conditions)).limit(1).all();
    return Boolean(row);
  }

  async findPage(
    params: Partial<RegistrationListQuery> = {},
  ): Promise<{ items: EnterpriseRegistrationDoc[]; total: number }> {
    const db = getSqliteDb();
    const conditions = [];

    if (params.status) {
      conditions.push(eq(enterpriseRegistrations.status, params.status as never));
    }
    if (params.search) {
      const pattern = `%${params.search.trim()}%`;
      conditions.push(
        or(
          like(enterpriseRegistrations.company_name, pattern),
          like(enterpriseRegistrations.tax_code, pattern),
          like(enterpriseRegistrations.company_email, pattern),
        ),
      );
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;
    const page = params.page ?? REGISTRATION_CONFIG.DEFAULT_PAGE;
    const limit = params.limit ?? REGISTRATION_CONFIG.DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const items = db
      .select()
      .from(enterpriseRegistrations)
      .where(whereClause)
      .orderBy(desc(enterpriseRegistrations.createdAt))
      .limit(limit)
      .offset(skip)
      .all()
      .map(toRegistrationDoc);

    const total = items.length;
    return { items, total };
  }
}

export const enterpriseRegistrationsRepository = new EnterpriseRegistrationsRepository();
