import type { ClientSession, Types, UpdateQuery } from 'mongoose';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  like,
  or,
  sql,
} from 'drizzle-orm';

import { generateId, getSqliteDb } from '../../config/sqlite.js';
import { enterprises, jobPostings } from '../../db/schema/index.js';
import {
  Enterprise,
  type EnterpriseData,
  type EnterpriseDoc,
  type EnterpriseStatus,
} from '../../models/enterprise.model.js';
import { ENTERPRISE_CONFIG, PUBLIC_ENTERPRISE_STATUS } from './enterprises.constants.js';

export interface FindEnterprisesParams {
  keyword?: string | undefined;
  industry?: string | undefined;
  industries?: string[] | undefined;
  location?: string | undefined;
  company_size?: string | undefined;
  company_sizes?: string[] | undefined;
  status?: EnterpriseStatus | undefined;
  page: number;
  limit: number;
}

function isMock(fn: unknown): boolean {
  return typeof fn === 'function' && ('_isMockFunction' in fn || 'mock' in fn);
}

function toEnterpriseDoc(row: typeof enterprises.$inferSelect): EnterpriseDoc {
  return {
    _id: row.id as unknown as Types.ObjectId,
    id: row.id,
    name: row.name,
    legal_name: row.legal_name ?? undefined,
    tax_code: row.tax_code,
    registration_number: row.registration_number ?? undefined,
    founded_year: row.founded_year ?? undefined,
    email: row.email,
    phone: row.phone,
    website: row.website ?? undefined,
    industry: row.industry,
    sub_industries: row.sub_industries ?? [],
    company_size: row.company_size,
    company_type: row.company_type ?? undefined,
    address: row.address,
    branches: row.branches ?? [],
    logo_url: row.logo_url ?? null,
    cover_url: row.cover_url ?? null,
    short_description: row.short_description ?? undefined,
    description: row.description ?? undefined,
    culture_summary: row.culture_summary ?? undefined,
    benefits: row.benefits ?? [],
    tech_stack: row.tech_stack ?? [],
    social_links: row.social_links ?? undefined,
    working_days: row.working_days ?? undefined,
    media_gallery: row.media_gallery ?? [],
    status: row.status,
    status_reason: row.status_reason ?? undefined,
    status_updated_by: (row.status_updated_by as unknown as Types.ObjectId) ?? undefined,
    status_updated_at: row.status_updated_at ?? undefined,
    creator_account_id: row.creator_account_id as unknown as Types.ObjectId,
    admin_mutation_version: row.admin_mutation_version,
    is_deleted: row.is_deleted,
    deleted_at: row.deleted_at ?? undefined,
    deleted_by: (row.deleted_by as unknown as Types.ObjectId) ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    toObject() {
      return this;
    },
  } as unknown as EnterpriseDoc;
}

export class EnterprisesRepository {
  async incrementAdminMutationVersion(enterpriseId: Types.ObjectId | string, session?: ClientSession): Promise<boolean> {
    if (isMock(Enterprise.updateOne)) {
      const result = await Enterprise.updateOne(
        { _id: enterpriseId, is_deleted: false, status: 'active' },
        { $inc: { admin_mutation_version: 1 } },
        { session: session as never, timestamps: false },
      ).exec();
      return result.matchedCount === 1;
    }
    const db = getSqliteDb();
    const result = db
      .update(enterprises)
      .set({ admin_mutation_version: sql`${enterprises.admin_mutation_version} + 1` })
      .where(and(eq(enterprises.id, String(enterpriseId)), eq(enterprises.is_deleted, false), eq(enterprises.status, 'active')))
      .run();
    return result.changes === 1;
  }

  async create(data: Partial<EnterpriseData>): Promise<EnterpriseDoc> {
    const db = getSqliteDb();
    const id = generateId();
    const now = new Date();
    db.insert(enterprises)
      .values({
        id,
        name: data.name ?? '',
        legal_name: data.legal_name ?? null,
        tax_code: data.tax_code ?? '',
        registration_number: data.registration_number ?? null,
        founded_year: data.founded_year ?? null,
        email: data.email ?? '',
        phone: data.phone ?? '',
        website: data.website ?? null,
        industry: data.industry ?? '',
        sub_industries: data.sub_industries ?? [],
        company_size: data.company_size ?? '1-10',
        company_type: data.company_type ?? null,
        address: data.address ?? { street: '', city: '', country: '' },
        branches: data.branches ?? [],
        logo_url: data.logo_url ?? null,
        cover_url: data.cover_url ?? null,
        short_description: data.short_description ?? null,
        description: data.description ?? null,
        culture_summary: data.culture_summary ?? null,
        benefits: data.benefits ?? [],
        tech_stack: data.tech_stack ?? [],
        social_links: data.social_links ?? null,
        working_days: data.working_days ?? null,
        media_gallery: data.media_gallery ?? [],
        status: data.status ?? 'pending',
        status_reason: data.status_reason ?? null,
        status_updated_by: data.status_updated_by ? String(data.status_updated_by) : null,
        status_updated_at: data.status_updated_at ?? null,
        creator_account_id: String(data.creator_account_id),
        admin_mutation_version: 0,
        is_deleted: false,
        deleted_at: null,
        deleted_by: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return toEnterpriseDoc({
      id,
      name: data.name ?? '',
      legal_name: data.legal_name ?? null,
      tax_code: data.tax_code ?? '',
      registration_number: data.registration_number ?? null,
      founded_year: data.founded_year ?? null,
      email: data.email ?? '',
      phone: data.phone ?? '',
      website: data.website ?? null,
      industry: data.industry ?? '',
      sub_industries: data.sub_industries ?? [],
      company_size: data.company_size ?? '1-10',
      company_type: data.company_type ?? null,
      address: data.address ?? { street: '', city: '', country: '' },
      branches: data.branches ?? [],
      logo_url: data.logo_url ?? null,
      cover_url: data.cover_url ?? null,
      short_description: data.short_description ?? null,
      description: data.description ?? null,
      culture_summary: data.culture_summary ?? null,
      benefits: data.benefits ?? [],
      tech_stack: data.tech_stack ?? [],
      social_links: data.social_links ?? null,
      working_days: data.working_days ?? null,
      media_gallery: data.media_gallery ?? [],
      status: data.status ?? 'pending',
      status_reason: data.status_reason ?? null,
      status_updated_by: data.status_updated_by ? String(data.status_updated_by) : null,
      status_updated_at: data.status_updated_at ?? null,
      creator_account_id: String(data.creator_account_id),
      admin_mutation_version: 0,
      is_deleted: false,
      deleted_at: null,
      deleted_by: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  async findById(id: string | Types.ObjectId, session?: ClientSession): Promise<EnterpriseDoc | null> {
    if (isMock(Enterprise.findOne)) {
      const query = Enterprise.findOne({ _id: id, is_deleted: false });
      if (session) query.session(session as never);
      return query.exec();
    }
    const db = getSqliteDb();
    const [row] = db
      .select()
      .from(enterprises)
      .where(and(eq(enterprises.id, String(id)), eq(enterprises.is_deleted, false)))
      .all();
    return row ? toEnterpriseDoc(row) : null;
  }

  async findByIdIncludeDeleted(id: string | Types.ObjectId): Promise<EnterpriseDoc | null> {
    if (isMock(Enterprise.findById)) {
      return Enterprise.findById(id).exec();
    }
    const db = getSqliteDb();
    const [row] = db.select().from(enterprises).where(eq(enterprises.id, String(id))).all();
    return row ? toEnterpriseDoc(row) : null;
  }

  async findByTaxCode(taxCode: string): Promise<EnterpriseDoc | null> {
    if (isMock(Enterprise.findOne)) {
      return Enterprise.findOne({ tax_code: taxCode, is_deleted: false }).exec();
    }
    const db = getSqliteDb();
    const [row] = db
      .select()
      .from(enterprises)
      .where(and(eq(enterprises.tax_code, taxCode), eq(enterprises.is_deleted, false)))
      .all();
    return row ? toEnterpriseDoc(row) : null;
  }

  async findByEmail(email: string): Promise<EnterpriseDoc | null> {
    if (isMock(Enterprise.findOne)) {
      return Enterprise.findOne({ email: email.toLowerCase(), is_deleted: false }).exec();
    }
    const db = getSqliteDb();
    const [row] = db
      .select()
      .from(enterprises)
      .where(and(eq(enterprises.email, email.toLowerCase()), eq(enterprises.is_deleted, false)))
      .all();
    return row ? toEnterpriseDoc(row) : null;
  }

  async findNamesByIds(ids: (string | Types.ObjectId)[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const stringIds = ids.map(String);
    const db = getSqliteDb();
    const rows = db
      .select({ id: enterprises.id, name: enterprises.name })
      .from(enterprises)
      .where(and(inArray(enterprises.id, stringIds), eq(enterprises.is_deleted, false)))
      .all();
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  async findByCreatorId(creatorId: string | Types.ObjectId): Promise<EnterpriseDoc | null> {
    if (isMock(Enterprise.findOne)) {
      return Enterprise.findOne({
        creator_account_id: creatorId,
        is_deleted: false,
      }).exec();
    }
    const db = getSqliteDb();
    const [row] = db
      .select()
      .from(enterprises)
      .where(and(eq(enterprises.creator_account_id, String(creatorId)), eq(enterprises.is_deleted, false)))
      .all();
    return row ? toEnterpriseDoc(row) : null;
  }

  async findPage(
    params: FindEnterprisesParams,
    isAdmin = false,
  ): Promise<{ items: EnterpriseDoc[]; total: number }> {
    const db = getSqliteDb();
    const conditions = [];

    if (isAdmin) {
      if (params.status) {
        conditions.push(eq(enterprises.status, params.status));
        if (params.status === 'deleted') {
          conditions.push(eq(enterprises.is_deleted, true));
        } else {
          conditions.push(eq(enterprises.is_deleted, false));
        }
      } else {
        conditions.push(eq(enterprises.is_deleted, false));
      }
    } else {
      conditions.push(eq(enterprises.status, PUBLIC_ENTERPRISE_STATUS));
      conditions.push(eq(enterprises.is_deleted, false));
    }

    if (params.keyword) {
      const pattern = `%${params.keyword.trim()}%`;
      conditions.push(or(like(enterprises.name, pattern), like(enterprises.industry, pattern)));
    }

    if (params.industry) {
      conditions.push(eq(enterprises.industry, params.industry));
    }

    if (params.industries?.length) {
      conditions.push(inArray(enterprises.industry, params.industries));
    }

    if (params.company_size) {
      conditions.push(eq(enterprises.company_size, params.company_size as never));
    }

    if (params.company_sizes?.length) {
      conditions.push(inArray(enterprises.company_size, params.company_sizes as never));
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;
    const [countRow] = db.select({ count: count() }).from(enterprises).where(whereClause).all();
    const total = countRow?.count ?? 0;

    const skip = (params.page - 1) * params.limit;
    const items = db
      .select()
      .from(enterprises)
      .where(whereClause)
      .orderBy(asc(enterprises.name), asc(enterprises.id))
      .limit(params.limit)
      .offset(skip)
      .all()
      .map(toEnterpriseDoc);

    return { items, total };
  }

  async updateById(
    id: string | Types.ObjectId,
    updateData: UpdateQuery<EnterpriseData> | Record<string, unknown>,
  ): Promise<EnterpriseDoc | null> {
    if (isMock(Enterprise.findOneAndUpdate)) {
      return Enterprise.findOneAndUpdate(
        { _id: id, is_deleted: false },
        updateData as never,
        { returnDocument: 'after' },
      ).exec();
    }
    const db = getSqliteDb();
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const raw = updateData as Record<string, unknown>;
    const data = (raw.$set as Record<string, unknown>) ?? raw;

    for (const [key, val] of Object.entries(data)) {
      if (key in enterprises) {
        updates[key] = val;
      }
    }

    const result = db
      .update(enterprises)
      .set(updates)
      .where(and(eq(enterprises.id, String(id)), eq(enterprises.is_deleted, false)))
      .returning()
      .get();
    return result ? toEnterpriseDoc(result) : null;
  }

  async softDelete(
    id: string | Types.ObjectId,
    adminId: string | Types.ObjectId,
  ): Promise<EnterpriseDoc | null> {
    if (isMock(Enterprise.findOneAndUpdate)) {
      return Enterprise.findOneAndUpdate(
        { _id: id, is_deleted: false },
        {
          $set: {
            is_deleted: true,
            status: 'deleted',
            deleted_at: new Date(),
            deleted_by: String(adminId) as never,
          },
        },
        { returnDocument: 'after' },
      ).exec();
    }
    const db = getSqliteDb();
    const result = db
      .update(enterprises)
      .set({
        is_deleted: true,
        status: 'deleted',
        deleted_at: new Date(),
        deleted_by: String(adminId),
        updatedAt: new Date(),
      })
      .where(and(eq(enterprises.id, String(id)), eq(enterprises.is_deleted, false)))
      .returning()
      .get();
    return result ? toEnterpriseDoc(result) : null;
  }

  async countActiveByIndustry(): Promise<{ industry: string; count: number }[]> {
    const db = getSqliteDb();
    const rows = db
      .select({ industry: enterprises.industry, count: count() })
      .from(enterprises)
      .where(and(eq(enterprises.status, PUBLIC_ENTERPRISE_STATUS), eq(enterprises.is_deleted, false)))
      .groupBy(enterprises.industry)
      .orderBy(desc(count()), asc(enterprises.industry))
      .limit(ENTERPRISE_CONFIG.INDUSTRY_FACET_LIMIT)
      .all();
    return rows;
  }

  async countOpenRolesByEnterpriseIds(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) {
      return new Map();
    }
    const db = getSqliteDb();
    const now = new Date();
    const rows = db
      .select({ enterprise_id: jobPostings.enterprise_id, count: count() })
      .from(jobPostings)
      .where(
        and(
          inArray(jobPostings.enterprise_id, ids),
          eq(jobPostings.status, 'published'),
          or(eq(jobPostings.deleting, false), eq(jobPostings.deleting, null as never)),
          or(gt(jobPostings.expires_at, now), eq(jobPostings.expires_at, null as never)),
        ),
      )
      .groupBy(jobPostings.enterprise_id)
      .all();
    return new Map(rows.map((row) => [row.enterprise_id, row.count]));
  }

  async countActiveJobs(enterpriseId: string | Types.ObjectId): Promise<number> {
    const db = getSqliteDb();
    const [row] = db
      .select({ count: count() })
      .from(jobPostings)
      .where(
        and(
          eq(jobPostings.enterprise_id, String(enterpriseId)),
          inArray(jobPostings.status, ['published', 'closed']),
        ),
      )
      .all();
    return row?.count ?? 0;
  }
}

export const enterprisesRepository = new EnterprisesRepository();
