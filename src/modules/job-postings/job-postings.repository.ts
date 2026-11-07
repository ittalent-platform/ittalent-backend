import { Types } from 'mongoose';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  like,
  lte,
  ne,
  or,
} from 'drizzle-orm';

import { generateId, getSqliteDb } from '../../config/sqlite.js';
import {
  applications,
  enterprises,
  jobPostingAudits,
  jobPostings,
} from '../../db/schema/index.js';
import { Application } from '../../models/application.model.js';
import { Enterprise } from '../../models/enterprise.model.js';
import {
  JobPostingAuditEvent,
  type JobPostingAuditEventData,
} from '../../models/job-posting-audit.model.js';
import {
  JobPosting,
  type JobPostingData,
  type JobPostingDoc,
  type JobPostingStatus,
} from '../../models/job-posting.model.js';
import type { JobAuditAction } from './job-postings.constants.js';
import type {
  CreateJobPosting,
  JobPostingEnterpriseSummary,
  JobPostingListQuery,
  UpdateJobPosting,
} from './job-postings.schemas.js';

function isMock(fn: unknown): boolean {
  return typeof fn === 'function' && ('_isMockFunction' in fn || 'mock' in fn);
}

function toJobPostingDoc(row: typeof jobPostings.$inferSelect): JobPostingDoc {
  const doc = {
    _id: new Types.ObjectId(row.id),
    id: row.id,
    enterprise_id: new Types.ObjectId(row.enterprise_id),
    posted_by_user_id: new Types.ObjectId(row.posted_by_user_id),
    title: row.title,
    slug: row.slug,
    location: row.location ?? undefined,
    employment_type: row.employment_type ?? undefined,
    salary_min: row.salary_min ?? undefined,
    salary_max: row.salary_max ?? undefined,
    salary_negotiable: Boolean(row.salary_negotiable),
    currency: row.currency,
    level: row.level ?? undefined,
    description: row.description ?? undefined,
    requirements: row.requirements ?? undefined,
    benefits: row.benefits ?? undefined,
    openings: row.openings ?? undefined,
    status: row.status as JobPostingStatus,
    published_at: row.published_at ? new Date(row.published_at) : undefined,
    closed_at: row.closed_at ? new Date(row.closed_at) : undefined,
    archived_at: row.archived_at ? new Date(row.archived_at) : undefined,
    expires_at: row.expires_at ? new Date(row.expires_at) : undefined,
    deleting: Boolean(row.deleting),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
  return {
    ...doc,
    toObject() {
      return doc;
    },
    toJSON() {
      return doc;
    },
  } as unknown as JobPostingDoc;
}

// Not past its expiry date: no expiry set, or expiry still in the future.
const notExpired = (now: Date): Record<string, unknown> => ({
  $or: [
    { expires_at: { $exists: false } },
    { expires_at: null },
    { expires_at: { $gt: now } },
  ],
});

export class JobPostingsRepository {
  // Published is the backward-compatible default; callers can explicitly create an incomplete draft.
  async create(
    userId: string,
    enterpriseId: string,
    input: CreateJobPosting,
    slug: string,
    expiresAt?: Date,
  ): Promise<JobPostingDoc> {
    if (process.env.USE_MONGODB === 'true' || isMock(JobPosting)) {
      const {
        publication_status: requestedPublicationStatus,
        ...inputWithoutStatus
      } = input;
      const publicationStatus = requestedPublicationStatus ?? 'published';
      const rest = this.withoutDeadline(inputWithoutStatus);
      return new JobPosting({
        enterprise_id: enterpriseId,
        posted_by_user_id: userId,
        slug,
        ...this.fields(rest),
        status: publicationStatus,
        ...(publicationStatus === 'published'
          ? { published_at: new Date() }
          : {}),
        ...(expiresAt ? { expires_at: expiresAt } : {}),
      }).save();
    }

    const publicationStatus = input.publication_status ?? 'published';
    const now = new Date();
    const id = generateId();

    const db = getSqliteDb();
    db.insert(jobPostings)
      .values({
        id,
        enterprise_id: enterpriseId,
        posted_by_user_id: userId,
        title: input.title,
        slug,
        location: input.location ?? null,
        employment_type: input.employment_type ?? null,
        salary_min: input.salary_min ?? null,
        salary_max: input.salary_max ?? null,
        salary_negotiable: input.salary_negotiable ?? false,
        currency: input.currency ?? 'VND',
        level: input.level ?? null,
        description: input.description ?? null,
        requirements: input.requirements ?? null,
        benefits: input.benefits ?? null,
        openings: input.openings ?? null,
        status: publicationStatus,
        published_at: publicationStatus === 'published' ? now : null,
        expires_at: expiresAt ?? null,
        deleting: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const row = db.select().from(jobPostings).where(eq(jobPostings.id, id)).get();
    if (!row) throw new Error('Failed to create job posting');
    return toJobPostingDoc(row);
  }

  async findById(id: string): Promise<JobPostingDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(JobPosting.findById)) {
      return JobPosting.findById(id).exec();
    }
    const db = getSqliteDb();
    const row = db.select().from(jobPostings).where(eq(jobPostings.id, id)).get();
    return row ? toJobPostingDoc(row) : null;
  }

  // Any state: an application keeps showing its job after the posting closes or expires.
  async findManyByIds(ids: string[]): Promise<JobPostingDoc[]> {
    if (ids.length === 0) return [];
    if (process.env.USE_MONGODB === 'true' || isMock(JobPosting.find)) {
      return JobPosting.find({ _id: { $in: ids } }).exec();
    }
    const db = getSqliteDb();
    const rows = db
      .select()
      .from(jobPostings)
      .where(inArray(jobPostings.id, ids))
      .all();
    return rows.map((r) => toJobPostingDoc(r));
  }

  async findEnterpriseNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    if (process.env.USE_MONGODB === 'true' || isMock(Enterprise.find)) {
      const enterprisesList = await Enterprise.find(
        { _id: { $in: ids } },
        { name: 1 },
      )
        .lean()
        .exec();
      return new Map(
        enterprisesList.map((enterprise) => [
          String(enterprise._id),
          enterprise.name,
        ]),
      );
    }
    const db = getSqliteDb();
    const rows = db
      .select({ id: enterprises.id, name: enterprises.name })
      .from(enterprises)
      .where(inArray(enterprises.id, ids))
      .all();
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  async findEnterpriseSummaries(
    ids: string[],
  ): Promise<Map<string, JobPostingEnterpriseSummary>> {
    if (ids.length === 0) return new Map();
    if (process.env.USE_MONGODB === 'true' || isMock(Enterprise.find)) {
      const enterprisesList = await Enterprise.find(
        { _id: { $in: ids } },
        { name: 1, logo_url: 1 },
      )
        .lean()
        .exec();
      return new Map(
        enterprisesList.map((enterprise) => [
          String(enterprise._id),
          {
            id: String(enterprise._id),
            name: enterprise.name,
            logoUrl: enterprise.logo_url ?? null,
          },
        ]),
      );
    }
    const db = getSqliteDb();
    const rows = db
      .select({
        id: enterprises.id,
        name: enterprises.name,
        logo_url: enterprises.logo_url,
      })
      .from(enterprises)
      .where(inArray(enterprises.id, ids))
      .all();
    return new Map(
      rows.map((r) => [
        r.id,
        {
          id: r.id,
          name: r.name,
          logoUrl: r.logo_url ?? null,
        },
      ]),
    );
  }

  // Ids of jobs whose title or enterprise name contains the keyword (case-insensitive), for application search.
  async findIdsByKeyword(keyword: string): Promise<string[]> {
    if (process.env.USE_MONGODB === 'true' || isMock(Enterprise.find) || isMock(JobPosting.find)) {
      const pattern = new RegExp(
        keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      const enterpriseIds = (
        await Enterprise.find({ name: pattern }, { _id: 1 }).lean().exec()
      ).map((enterprise) => enterprise._id);
      const jobs = await JobPosting.find(
        { $or: [{ title: pattern }, { enterprise_id: { $in: enterpriseIds } }] },
        { _id: 1 },
      )
        .lean()
        .exec();
      return jobs.map((job) => String(job._id));
    }
    const db = getSqliteDb();
    const matchingEnterprises = db
      .select({ id: enterprises.id })
      .from(enterprises)
      .where(like(enterprises.name, `%${keyword}%`))
      .all();
    const enterpriseIds = matchingEnterprises.map((e) => e.id);

    const conditions = [like(jobPostings.title, `%${keyword}%`)];
    if (enterpriseIds.length > 0) {
      conditions.push(inArray(jobPostings.enterprise_id, enterpriseIds));
    }

    const rows = db
      .select({ id: jobPostings.id })
      .from(jobPostings)
      .where(or(...conditions))
      .all();
    return rows.map((r) => r.id);
  }

  // Ids of all jobs belonging to an enterprise, regardless of status.
  async findJobIdsByEnterpriseId(enterpriseId: string): Promise<string[]> {
    if (process.env.USE_MONGODB === 'true' || isMock(JobPosting.find)) {
      const jobs = await JobPosting.find(
        { enterprise_id: new Types.ObjectId(enterpriseId) },
        { _id: 1 },
      )
        .lean()
        .exec();
      return jobs.map((job) => String(job._id));
    }
    const db = getSqliteDb();
    const rows = db
      .select({ id: jobPostings.id })
      .from(jobPostings)
      .where(eq(jobPostings.enterprise_id, enterpriseId))
      .all();
    return rows.map((r) => r.id);
  }

  // Ids of jobs belonging to an enterprise whose title matches the keyword (case-insensitive).
  async findJobIdsByTitleAndEnterpriseId(
    enterpriseId: string,
    keyword: string,
  ): Promise<string[]> {
    if (process.env.USE_MONGODB === 'true' || isMock(JobPosting.find)) {
      const pattern = new RegExp(
        keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      const jobs = await JobPosting.find(
        {
          enterprise_id: new Types.ObjectId(enterpriseId),
          title: pattern,
        },
        { _id: 1 },
      )
        .lean()
        .exec();
      return jobs.map((job) => String(job._id));
    }
    const db = getSqliteDb();
    const rows = db
      .select({ id: jobPostings.id })
      .from(jobPostings)
      .where(
        and(
          eq(jobPostings.enterprise_id, enterpriseId),
          like(jobPostings.title, `%${keyword}%`),
        ),
      )
      .all();
    return rows.map((r) => r.id);
  }

  // A job accepts applications only while it is Published, not being deleted, before its deadline and
  // owned by an Active enterprise.
  async findOpenPublishedById(
    id: string,
    now: Date,
  ): Promise<JobPostingDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(JobPosting.findOne)) {
      const job = await JobPosting.findOne({
        _id: id,
        status: 'published',
        deleting: { $ne: true },
        ...notExpired(now),
      }).exec();
      if (!job) return null;
      return (await this.isEnterpriseActive(String(job.enterprise_id)))
        ? job
        : null;
    }
    const db = getSqliteDb();
    const job = db
      .select()
      .from(jobPostings)
      .where(
        and(
          eq(jobPostings.id, id),
          eq(jobPostings.status, 'published'),
          or(isNull(jobPostings.deleting), eq(jobPostings.deleting, false)),
          or(isNull(jobPostings.expires_at), gt(jobPostings.expires_at, now)),
        ),
      )
      .get();
    if (!job) return null;
    const active = await this.isEnterpriseActive(job.enterprise_id);
    return active ? toJobPostingDoc(job) : null;
  }

  async isEnterpriseActive(enterpriseId: string): Promise<boolean> {
    if (process.env.USE_MONGODB === 'true' || isMock(Enterprise.exists)) {
      return (
        (await Enterprise.exists({
          _id: enterpriseId,
          status: 'active',
          is_deleted: { $ne: true },
        }).exec()) !== null
      );
    }
    const db = getSqliteDb();
    const row = db
      .select({ id: enterprises.id })
      .from(enterprises)
      .where(
        and(
          eq(enterprises.id, enterpriseId),
          eq(enterprises.status, 'active'),
          eq(enterprises.is_deleted, false),
        ),
      )
      .get();
    return row !== undefined;
  }

  async findActiveEnterpriseIds(): Promise<string[]> {
    if (process.env.USE_MONGODB === 'true' || isMock(Enterprise.find)) {
      const rows = await Enterprise.find(
        { status: 'active', is_deleted: { $ne: true } },
        { _id: 1 },
      )
        .lean()
        .exec();
      return rows.map((row) => String(row._id));
    }
    const db = getSqliteDb();
    const rows = db
      .select({ id: enterprises.id })
      .from(enterprises)
      .where(
        and(
          eq(enterprises.status, 'active'),
          eq(enterprises.is_deleted, false),
        ),
      )
      .all();
    return rows.map((r) => r.id);
  }

  async exists(id: string): Promise<boolean> {
    if (process.env.USE_MONGODB === 'true' || isMock(JobPosting.exists)) {
      return (await JobPosting.exists({ _id: id }).exec()) !== null;
    }
    const db = getSqliteDb();
    const row = db.select({ id: jobPostings.id }).from(jobPostings).where(eq(jobPostings.id, id)).get();
    return row !== undefined;
  }

  // Atomically flags the job as being deleted so no application can be accepted while the count is checked.
  async markDeleting(id: string): Promise<JobPostingDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(JobPosting.findOneAndUpdate)) {
      return JobPosting.findOneAndUpdate(
        { _id: id, deleting: { $ne: true } },
        { $set: { deleting: true } },
        { returnDocument: 'after' },
      ).exec();
    }
    const db = getSqliteDb();
    const existing = db
      .select()
      .from(jobPostings)
      .where(
        and(
          eq(jobPostings.id, id),
          or(isNull(jobPostings.deleting), eq(jobPostings.deleting, false)),
        ),
      )
      .get();
    if (!existing) return null;

    db.update(jobPostings)
      .set({ deleting: true, updatedAt: new Date() })
      .where(eq(jobPostings.id, id))
      .run();

    const updated = db.select().from(jobPostings).where(eq(jobPostings.id, id)).get();
    return updated ? toJobPostingDoc(updated) : null;
  }

  async clearDeleting(id: string): Promise<void> {
    if (process.env.USE_MONGODB === 'true' || isMock(JobPosting.updateOne)) {
      await JobPosting.updateOne({ _id: id }, { $unset: { deleting: 1 } }).exec();
      return;
    }
    const db = getSqliteDb();
    db.update(jobPostings)
      .set({ deleting: false, updatedAt: new Date() })
      .where(eq(jobPostings.id, id))
      .run();
  }

  async hasApplications(id: string): Promise<boolean> {
    if (process.env.USE_MONGODB === 'true' || isMock(Application.exists)) {
      return (await Application.exists({ job_id: id }).exec()) !== null;
    }
    const db = getSqliteDb();
    const row = db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.job_id, id))
      .get();
    return row !== undefined;
  }

  async countApplicationsByJobIds(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    if (process.env.USE_MONGODB === 'true' || isMock(Application.aggregate)) {
      const rows = await Application.aggregate<{ _id: unknown; count: number }>([
        { $match: { job_id: { $in: ids.map((id) => new Types.ObjectId(id)) } } },
        { $group: { _id: '$job_id', count: { $sum: 1 } } },
      ]).exec();
      return new Map(rows.map((row) => [String(row._id), row.count]));
    }
    const db = getSqliteDb();
    const rows = db
      .select({
        job_id: applications.job_id,
        count: count(applications.id),
      })
      .from(applications)
      .where(inArray(applications.job_id, ids))
      .groupBy(applications.job_id)
      .all();
    return new Map(rows.map((r) => [r.job_id, r.count]));
  }

  async recordAudit(event: JobPostingAuditEventData): Promise<void> {
    if (process.env.USE_MONGODB === 'true' || isMock(JobPostingAuditEvent.create)) {
      await JobPostingAuditEvent.create(event);
      return;
    }
    const db = getSqliteDb();
    db.insert(jobPostingAudits)
      .values({
        id: generateId(),
        job_posting_id: String(event.job_posting_id),
        actor_user_id: String(event.actor_user_id),
        action: event.action,
        changes: {
          enterprise_id: String(event.enterprise_id),
          result: event.result,
          job_title: event.job_title,
          changed_fields: event.changed_fields,
        },
        occurred_at: new Date(),
      })
      .run();
  }

  async listAudit(
    id: string,
    page: number,
    limit: number,
  ): Promise<{
    items: Array<
      JobPostingAuditEventData & { _id: Types.ObjectId; createdAt: Date }
    >;
    total: number;
  }> {
    if (process.env.USE_MONGODB === 'true' || isMock(JobPostingAuditEvent.find)) {
      const filter = { job_posting_id: id };
      const [items, total] = await Promise.all([
        JobPostingAuditEvent.find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean<
            Array<
              JobPostingAuditEventData & { _id: Types.ObjectId; createdAt: Date }
            >
          >()
          .exec(),
        JobPostingAuditEvent.countDocuments(filter).exec(),
      ]);
      return { items, total };
    }
    const db = getSqliteDb();
    const totalRow = db
      .select({ count: count() })
      .from(jobPostingAudits)
      .where(eq(jobPostingAudits.job_posting_id, id))
      .get();
    const total = totalRow?.count ?? 0;

    const rows = db
      .select()
      .from(jobPostingAudits)
      .where(eq(jobPostingAudits.job_posting_id, id))
      .orderBy(desc(jobPostingAudits.occurred_at), desc(jobPostingAudits.id))
      .limit(limit)
      .offset((page - 1) * limit)
      .all();

    const items: Array<
      JobPostingAuditEventData & { _id: Types.ObjectId; createdAt: Date }
    > = rows.map((r) => {
      const changes = (r.changes ?? {}) as Record<string, unknown>;
      const item: JobPostingAuditEventData & {
        _id: Types.ObjectId;
        createdAt: Date;
      } = {
        _id: new Types.ObjectId(r.id),
        job_posting_id: new Types.ObjectId(r.job_posting_id),
        enterprise_id: new Types.ObjectId(
          String(changes.enterprise_id ?? r.job_posting_id),
        ),
        actor_user_id: new Types.ObjectId(r.actor_user_id),
        action: r.action as JobAuditAction,
        result: 'success',
        job_title: String(changes.job_title ?? ''),
        createdAt: new Date(r.occurred_at),
        ...(changes.changed_fields
          ? { changed_fields: changes.changed_fields as string[] }
          : {}),
      };
      return item;
    });
    return { items, total };
  }

  // Puts back a job removed by a delete whose audit record could not be written.
  async restore(snapshot: Record<string, unknown>): Promise<void> {
    if (process.env.USE_MONGODB === 'true' || isMock(JobPosting.replaceOne)) {
      await JobPosting.replaceOne({ _id: snapshot._id }, snapshot, {
        upsert: true,
      }).exec();
      return;
    }
    const db = getSqliteDb();
    const id = String(snapshot._id ?? snapshot.id);
    db.insert(jobPostings)
      .values({
        id,
        enterprise_id: String(snapshot.enterprise_id),
        posted_by_user_id: String(snapshot.posted_by_user_id),
        title: String(snapshot.title),
        slug: String(snapshot.slug),
        location: (snapshot.location as string) ?? null,
        employment_type: (snapshot.employment_type as string) ?? null,
        salary_min: (snapshot.salary_min as number) ?? null,
        salary_max: (snapshot.salary_max as number) ?? null,
        salary_negotiable: Boolean(snapshot.salary_negotiable),
        currency: String(snapshot.currency ?? 'VND'),
        level: (snapshot.level as string) ?? null,
        description: (snapshot.description as string) ?? null,
        requirements: (snapshot.requirements as string) ?? null,
        benefits: (snapshot.benefits as string) ?? null,
        openings: (snapshot.openings as number) ?? null,
        status: (snapshot.status as JobPostingStatus) ?? 'draft',
        published_at: snapshot.published_at
          ? new Date(snapshot.published_at as string | number | Date)
          : null,
        closed_at: snapshot.closed_at
          ? new Date(snapshot.closed_at as string | number | Date)
          : null,
        archived_at: snapshot.archived_at
          ? new Date(snapshot.archived_at as string | number | Date)
          : null,
        expires_at: snapshot.expires_at
          ? new Date(snapshot.expires_at as string | number | Date)
          : null,
        deleting: Boolean(snapshot.deleting),
        createdAt: snapshot.createdAt
          ? new Date(snapshot.createdAt as string | number | Date)
          : new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: jobPostings.id,
        set: {
          title: String(snapshot.title),
          status: (snapshot.status as JobPostingStatus) ?? 'draft',
          deleting: Boolean(snapshot.deleting),
          updatedAt: new Date(),
        },
      })
      .run();
  }

  async findBySlug(
    slug: string,
    exceptId?: string,
  ): Promise<JobPostingDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(JobPosting.findOne)) {
      return JobPosting.findOne({
        slug,
        ...(exceptId ? { _id: { $ne: exceptId } } : {}),
      }).exec();
    }
    const db = getSqliteDb();
    const conditions = [eq(jobPostings.slug, slug)];
    if (exceptId) {
      conditions.push(ne(jobPostings.id, exceptId));
    }
    const row = db
      .select()
      .from(jobPostings)
      .where(and(...conditions))
      .get();
    return row ? toJobPostingDoc(row) : null;
  }

  async update(
    id: string,
    input: UpdateJobPosting,
    slug?: string,
    expiresAt?: Date,
  ): Promise<JobPostingDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(JobPosting.findByIdAndUpdate)) {
      const unset = this.clearFields(input);
      const { publication_status: publicationStatus, ...inputWithoutStatus } =
        input;
      const rest = this.withoutDeadline(inputWithoutStatus);
      const lifecycleSet: Partial<JobPostingData> = {};
      if (publicationStatus) lifecycleSet.status = publicationStatus;
      if (publicationStatus === 'published')
        lifecycleSet.published_at = new Date();
      const lifecycleUnset = publicationStatus
        ? publicationStatus === 'published'
          ? { closed_at: 1 as const, archived_at: 1 as const }
          : {
              published_at: 1 as const,
              closed_at: 1 as const,
              archived_at: 1 as const,
            }
        : {};
      return JobPosting.findByIdAndUpdate(
        id,
        {
          $set: {
            ...this.fields(rest),
            ...lifecycleSet,
            ...(slug ? { slug } : {}),
            ...(expiresAt ? { expires_at: expiresAt } : {}),
          },
          ...(Object.keys(unset).length > 0 ||
          Object.keys(lifecycleUnset).length > 0
            ? { $unset: { ...unset, ...lifecycleUnset } }
            : {}),
        },
        { returnDocument: 'after' },
      ).exec();
    }

    const db = getSqliteDb();
    const existing = db.select().from(jobPostings).where(eq(jobPostings.id, id)).get();
    if (!existing) return null;

    const updateData: Partial<typeof jobPostings.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (slug) updateData.slug = slug;
    if (expiresAt !== undefined) updateData.expires_at = expiresAt;

    if (input.title !== undefined) updateData.title = input.title;
    if (input.location !== undefined) updateData.location = input.location ?? null;
    if (input.employment_type !== undefined)
      updateData.employment_type = input.employment_type ?? null;
    if (input.salary_min !== undefined) updateData.salary_min = input.salary_min ?? null;
    if (input.salary_max !== undefined) updateData.salary_max = input.salary_max ?? null;
    if (input.salary_negotiable !== undefined)
      updateData.salary_negotiable = input.salary_negotiable;
    if (input.currency !== undefined) updateData.currency = input.currency;
    if (input.level !== undefined) updateData.level = input.level ?? null;
    if (input.description !== undefined)
      updateData.description = input.description ?? null;
    if (input.requirements !== undefined)
      updateData.requirements = input.requirements ?? null;
    if (input.benefits !== undefined) updateData.benefits = input.benefits ?? null;
    if (input.openings !== undefined) updateData.openings = input.openings ?? null;

    if (input.publication_status) {
      updateData.status = input.publication_status;
      if (input.publication_status === 'published') {
        updateData.published_at = new Date();
        updateData.closed_at = null;
        updateData.archived_at = null;
      } else {
        updateData.published_at = null;
        updateData.closed_at = null;
        updateData.archived_at = null;
      }
    }

    db.update(jobPostings).set(updateData).where(eq(jobPostings.id, id)).run();
    const updated = db.select().from(jobPostings).where(eq(jobPostings.id, id)).get();
    return updated ? toJobPostingDoc(updated) : null;
  }

  async transition(
    id: string,
    currentStatus: JobPostingStatus,
    nextStatus: JobPostingStatus,
    at: Date,
  ): Promise<JobPostingDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(JobPosting.findOneAndUpdate)) {
      const set: Record<string, unknown> = { status: nextStatus };
      const unset: Record<string, 1> = {};
      if (nextStatus === 'closed') set.closed_at = at;
      if (nextStatus === 'archived') set.archived_at = at;
      if (nextStatus === 'published') {
        unset.closed_at = 1;
        unset.archived_at = 1;
      }
      if (nextStatus === 'draft') {
        unset.published_at = 1;
        unset.closed_at = 1;
        unset.archived_at = 1;
      }
      if (currentStatus === 'archived' && nextStatus === 'closed')
        unset.archived_at = 1;
      return JobPosting.findOneAndUpdate(
        { _id: id, status: currentStatus },
        { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
        { returnDocument: 'after' },
      ).exec();
    }

    const db = getSqliteDb();
    const existing = db
      .select()
      .from(jobPostings)
      .where(and(eq(jobPostings.id, id), eq(jobPostings.status, currentStatus)))
      .get();
    if (!existing) return null;

    const updateData: Partial<typeof jobPostings.$inferInsert> = {
      status: nextStatus,
      updatedAt: new Date(),
    };
    if (nextStatus === 'closed') updateData.closed_at = at;
    if (nextStatus === 'archived') updateData.archived_at = at;
    if (nextStatus === 'published') {
      updateData.closed_at = null;
      updateData.archived_at = null;
    }
    if (nextStatus === 'draft') {
      updateData.published_at = null;
      updateData.closed_at = null;
      updateData.archived_at = null;
    }
    if (currentStatus === 'archived' && nextStatus === 'closed') {
      updateData.archived_at = null;
    }

    db.update(jobPostings)
      .set(updateData)
      .where(and(eq(jobPostings.id, id), eq(jobPostings.status, currentStatus)))
      .run();

    const updated = db.select().from(jobPostings).where(eq(jobPostings.id, id)).get();
    return updated ? toJobPostingDoc(updated) : null;
  }

  async delete(id: string): Promise<boolean> {
    if (process.env.USE_MONGODB === 'true' || isMock(JobPosting.deleteOne)) {
      return (await JobPosting.deleteOne({ _id: id }).exec()).deletedCount === 1;
    }
    const db = getSqliteDb();
    const res = db.delete(jobPostings).where(eq(jobPostings.id, id)).run();
    return res.changes > 0;
  }

  async list(
    query: JobPostingListQuery,
    options: {
      publicOnly: boolean;
      enterpriseId?: string;
      activeEnterpriseIds?: string[];
    },
  ): Promise<{ items: JobPostingDoc[]; total: number }> {
    const now = new Date();
    if (process.env.USE_MONGODB === 'true' || isMock(JobPosting.find)) {
      const filter: Record<string, unknown> = {
        // Public listing: Published, not being deleted, before the deadline and owned by an Active enterprise.
        // The conditions sit in $and so they combine with the enterprise_id filter and the search $or.
        ...(options.publicOnly
          ? {
              status: 'published',
              deleting: { $ne: true },
              $and: [
                notExpired(now),
                { enterprise_id: { $in: options.activeEnterpriseIds ?? [] } },
              ],
            }
          : {}),
        ...((options.enterpriseId ?? query.enterprise_id)
          ? { enterprise_id: options.enterpriseId ?? query.enterprise_id }
          : {}),
        ...(query.location
          ? {
              location: new RegExp(
                query.location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                'i',
              ),
            }
          : {}),
        ...(query.employment_type
          ? { employment_type: query.employment_type }
          : {}),
        ...(query.level ? { level: query.level } : {}),
      };
      if (!options.publicOnly && query.publication_status) {
        filter.status =
          query.publication_status === 'published'
            ? { $in: ['published', 'closed'] }
            : query.publication_status;
      }
      if (!options.publicOnly && query.recruitment_status === 'open') {
        filter.status = 'published';
        const clauses =
          (filter.$and as Record<string, unknown>[] | undefined) ?? [];
        filter.$and = [...clauses, notExpired(now)];
      }
      if (!options.publicOnly && query.recruitment_status === 'closed') {
        const clauses =
          (filter.$and as Record<string, unknown>[] | undefined) ?? [];
        filter.$and = [
          ...clauses,
          {
            $or: [
              { status: { $in: ['draft', 'closed', 'archived'] } },
              { status: 'published', expires_at: { $lte: now } },
            ],
          },
        ];
      }
      if (query.search) {
        const pattern = new RegExp(
          query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'i',
        );
        filter.$or = [
          { title: pattern },
          { description: pattern },
          { location: pattern },
        ];
      }
      const field = query.sort_by === 'created_at' ? 'createdAt' : query.sort_by;
      const direction = query.sort_order === 'asc' ? 1 : -1;
      const [items, total] = await Promise.all([
        JobPosting.find(filter)
          .sort({ [field]: direction, _id: direction })
          .skip((query.page - 1) * query.limit)
          .limit(query.limit)
          .exec(),
        JobPosting.countDocuments(filter).exec(),
      ]);
      return { items, total };
    }

    const db = getSqliteDb();
    const conditions = [];

    if (options.publicOnly) {
      conditions.push(eq(jobPostings.status, 'published'));
      conditions.push(or(isNull(jobPostings.deleting), eq(jobPostings.deleting, false)));
      conditions.push(or(isNull(jobPostings.expires_at), gt(jobPostings.expires_at, now)));
      if (options.activeEnterpriseIds && options.activeEnterpriseIds.length > 0) {
        conditions.push(inArray(jobPostings.enterprise_id, options.activeEnterpriseIds));
      } else {
        return { items: [], total: 0 };
      }
    }

    const entId = options.enterpriseId ?? query.enterprise_id;
    if (entId) {
      conditions.push(eq(jobPostings.enterprise_id, entId));
    }

    if (query.location) {
      conditions.push(like(jobPostings.location, `%${query.location}%`));
    }

    if (query.employment_type) {
      conditions.push(eq(jobPostings.employment_type, query.employment_type));
    }

    if (query.level) {
      conditions.push(eq(jobPostings.level, query.level));
    }

    if (!options.publicOnly && query.publication_status) {
      if (query.publication_status === 'published') {
        conditions.push(inArray(jobPostings.status, ['published', 'closed']));
      } else {
        conditions.push(eq(jobPostings.status, query.publication_status));
      }
    }

    if (!options.publicOnly && query.recruitment_status === 'open') {
      conditions.push(eq(jobPostings.status, 'published'));
      conditions.push(or(isNull(jobPostings.expires_at), gt(jobPostings.expires_at, now)));
    }

    if (!options.publicOnly && query.recruitment_status === 'closed') {
      conditions.push(
        or(
          inArray(jobPostings.status, ['draft', 'closed', 'archived']),
          and(eq(jobPostings.status, 'published'), lte(jobPostings.expires_at, now)),
        ),
      );
    }

    if (query.search) {
      conditions.push(
        or(
          like(jobPostings.title, `%${query.search}%`),
          like(jobPostings.description, `%${query.search}%`),
          like(jobPostings.location, `%${query.search}%`),
        ),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const totalRow = db
      .select({ count: count() })
      .from(jobPostings)
      .where(whereClause)
      .get();
    const total = totalRow?.count ?? 0;

    const sortColumn =
      query.sort_by === 'expires_at'
        ? jobPostings.expires_at
        : query.sort_by === 'title'
          ? jobPostings.title
          : jobPostings.createdAt;

    const orderExpr =
      query.sort_order === 'asc' ? asc(sortColumn) : desc(sortColumn);

    const rows = db
      .select()
      .from(jobPostings)
      .where(whereClause)
      .orderBy(orderExpr, desc(jobPostings.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit)
      .all();

    return {
      items: rows.map((r) => toJobPostingDoc(r)),
      total,
    };
  }

  // The deadline is stored as an instant, so callers pass it separately after normalising it.
  private withoutDeadline<T extends { expires_at?: unknown }>(
    input: T,
  ): Omit<T, 'expires_at'> {
    const copy = { ...input };
    delete copy.expires_at;
    return copy;
  }

  private fields(
    input: Omit<
      CreateJobPosting | UpdateJobPosting,
      'expires_at' | 'publication_status'
    >,
  ): Partial<JobPostingData> {
    const result: Partial<JobPostingData> = {};
    if (input.title !== undefined) result.title = input.title;
    if (input.location !== undefined && input.location !== null)
      result.location = input.location;
    if (input.employment_type !== undefined && input.employment_type !== null)
      result.employment_type = input.employment_type;
    if (input.salary_min !== undefined && input.salary_min !== null)
      result.salary_min = input.salary_min;
    if (input.salary_max !== undefined && input.salary_max !== null)
      result.salary_max = input.salary_max;
    if (input.salary_negotiable !== undefined)
      result.salary_negotiable = input.salary_negotiable;
    if (input.currency !== undefined) result.currency = input.currency;
    if (input.level !== undefined && input.level !== null)
      result.level = input.level;
    if (input.description !== undefined && input.description !== null)
      result.description = input.description;
    if (input.requirements !== undefined && input.requirements !== null)
      result.requirements = input.requirements;
    if (input.benefits !== undefined && input.benefits !== null)
      result.benefits = input.benefits;
    if (input.openings !== undefined && input.openings !== null)
      result.openings = input.openings;
    return result;
  }

  private clearFields(
    input: UpdateJobPosting,
  ): Partial<Record<'salary_min' | 'salary_max' | 'level' | 'openings', 1>> {
    const result: Partial<
      Record<'salary_min' | 'salary_max' | 'level' | 'openings', 1>
    > = {};
    if (input.salary_min === null) result.salary_min = 1;
    if (input.salary_max === null) result.salary_max = 1;
    if (input.level === null) result.level = 1;
    if (input.openings === null) result.openings = 1;
    return result;
  }

  // Automates closing a published job posting when vacancies are fulfilled (BR-18)
  async closeJobPosting(jobId: string | Types.ObjectId): Promise<boolean> {
    const id = String(jobId);
    if (!Types.ObjectId.isValid(id)) {
      return false;
    }
    if (process.env.USE_MONGODB === 'true' || isMock(JobPosting.updateOne)) {
      const result = await JobPosting.updateOne(
        { _id: new Types.ObjectId(id), status: 'published' },
        { $set: { status: 'closed', closed_at: new Date() } },
      ).exec();
      return result.modifiedCount > 0;
    }
    const db = getSqliteDb();
    const res = db
      .update(jobPostings)
      .set({ status: 'closed', closed_at: new Date(), updatedAt: new Date() })
      .where(and(eq(jobPostings.id, id), eq(jobPostings.status, 'published')))
      .run();
    return res.changes > 0;
  }
}

export const jobPostingsRepository = new JobPostingsRepository();
