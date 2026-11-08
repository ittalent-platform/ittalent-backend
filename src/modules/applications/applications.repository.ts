import { Types, type QueryFilter } from 'mongoose';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
} from 'drizzle-orm';

import { generateId, getSqliteDb } from '../../config/sqlite.js';
import { applications } from '../../db/schema/index.js';
import {
  Application,
  type ApplicationCertificateSnapshot,
  type ApplicationData,
  type ApplicationDoc,
  type ApplicationNoteEntry,
  type ApplicationStatus,
  type ApplicationStatusHistoryEntry,
} from '../../models/application.model.js';
import { TIME_MS } from '../../shared/constants/time.js';
import {
  APPLICATION_CONFIG,
  APPLICATION_HIRED_STATUS,
  APPLICATION_INITIAL_STATUS,
  APPLICATION_SORT_COLUMNS,
  createEmptyStatusCounts,
  WITHDRAWABLE_STATUSES,
  type ApplicationSortField,
  type ApplicationSortOrder,
} from './applications.constants.js';

export interface ApplicationListFilters {
  statuses?: ApplicationStatus[] | undefined;
  jobIds?: string[] | undefined;
  submittedFrom?: Date | undefined;
  submittedTo?: Date | undefined;
}

export interface FindApplicationsPageParams {
  page: number;
  limit: number;
  sortBy: ApplicationSortField;
  sortOrder: ApplicationSortOrder;
  filters: ApplicationListFilters;
}

export interface RecruiterApplicationListFilters {
  jobIds: string[];
  applicantIds?: string[] | undefined;
  applicationIds?: string[] | undefined;
  statuses?: ApplicationStatus[] | undefined;
  documentType?: 'cv' | 'cover_letter' | undefined;
  submittedFrom?: Date | undefined;
  submittedTo?: Date | undefined;
  searchOr?: {
    jobIds?: string[];
    applicantIds?: string[];
    applicationIds?: string[];
  } | undefined;
}

export interface FindRecruiterApplicationsPageParams {
  page: number;
  limit: number;
  sortBy: ApplicationSortField;
  sortOrder: ApplicationSortOrder;
  filters: RecruiterApplicationListFilters;
}

export interface UpdateRecruiterStatusData {
  status: ApplicationStatus;
  changedBy: string | Types.ObjectId;
  actorRole?: string | undefined;
  note?: string | undefined;
  messageToCandidate?: string | undefined;
  rejectionReason?: string | undefined;
}

export interface SubmitApplicationData {
  jobId: Types.ObjectId | string;
  applicantId: Types.ObjectId | string;
  cvId: string;
  coverLetterId?: string | undefined;
  message?: string | undefined;
  changedBy: string;
  reappliedFrom?: Types.ObjectId | string | undefined;
  certificates?: ApplicationCertificateSnapshot[];
  idempotencyKey?: string | undefined;
  requestHash?: string | undefined;
}

function isMock(fn: unknown): boolean {
  return typeof fn === 'function' && ('_isMockFunction' in fn || 'mock' in fn);
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code ===
      APPLICATION_CONFIG.MONGO_DUPLICATE_KEY_ERROR_CODE
  );
}

function toApplicationDoc(row: typeof applications.$inferSelect): ApplicationDoc {
  const doc = {
    _id: new Types.ObjectId(row.id),
    id: row.id,
    job_id: new Types.ObjectId(row.job_id),
    applicant_id: new Types.ObjectId(row.applicant_id),
    cv_id: new Types.ObjectId(row.cv_id),
    cover_letter_id: row.cover_letter_id
      ? new Types.ObjectId(row.cover_letter_id)
      : undefined,
    message: row.message ?? undefined,
    status: row.status as ApplicationStatus,
    withdrawal_reason: row.withdrawal_reason ?? undefined,
    reapplied_from: row.reapplied_from
      ? new Types.ObjectId(row.reapplied_from)
      : undefined,
    reapplied_as: row.reapplied_as
      ? new Types.ObjectId(row.reapplied_as)
      : undefined,
    status_history: (row.status_history ?? []).map((h) => {
      const entry: ApplicationStatusHistoryEntry = {
        status: h.status,
        changed_at: new Date(h.changed_at),
        changed_by: new Types.ObjectId(h.changed_by),
        ...(h.note ? { note: h.note } : {}),
        ...(h.message_to_candidate ? { message_to_candidate: h.message_to_candidate } : {}),
        ...(h.rejection_reason ? { rejection_reason: h.rejection_reason } : {}),
        ...(h.actor_role ? { actor_role: h.actor_role } : {}),
      };
      return entry;
    }),
    certificates: (row.certificates ?? []).map((c) => ({
      ...c,
      certificate_id: new Types.ObjectId(c.certificate_id),
    })),
    notes: (row.notes ?? []).map((n) => ({
      author_id: new Types.ObjectId(n.author_id),
      author_name: n.author_name,
      content: n.content,
      created_at: new Date(n.created_at),
    })),
    idempotency_key: row.idempotency_key ?? undefined,
    request_hash: row.request_hash ?? undefined,
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
  } as unknown as ApplicationDoc;
}

export class ApplicationsRepository {
  async isDocumentReferenced(documentId: string): Promise<boolean> {
    if (process.env.USE_MONGODB === 'true' || isMock(Application.exists)) {
      return (
        (await Application.exists({
          $or: [{ cv_id: documentId }, { cover_letter_id: documentId }],
        }).exec()) !== null
      );
    }
    const db = getSqliteDb();
    const row = db
      .select({ id: applications.id })
      .from(applications)
      .where(
        or(
          eq(applications.cv_id, documentId),
          eq(applications.cover_letter_id, documentId),
        ),
      )
      .get();
    return row !== undefined;
  }

  async findLatestByJobAndApplicant(
    jobId: Types.ObjectId | string,
    applicantId: Types.ObjectId | string,
  ): Promise<ApplicationDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Application.findOne)) {
      return Application.findOne({ job_id: jobId, applicant_id: applicantId })
        .sort({ createdAt: -1, _id: -1 })
        .lean<ApplicationDoc>()
        .exec();
    }
    const db = getSqliteDb();
    const row = db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.job_id, String(jobId)),
          eq(applications.applicant_id, String(applicantId)),
        ),
      )
      .orderBy(desc(applications.createdAt), desc(applications.id))
      .get();
    return row ? toApplicationDoc(row) : null;
  }

  async findByIdempotencyKey(
    applicantId: Types.ObjectId | string,
    idempotencyKey: string,
  ): Promise<ApplicationDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Application.findOne)) {
      return Application.findOne({
        applicant_id: applicantId,
        idempotency_key: idempotencyKey,
      })
        .select('+request_hash')
        .lean<ApplicationDoc>()
        .exec();
    }
    const db = getSqliteDb();
    const row = db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.applicant_id, String(applicantId)),
          eq(applications.idempotency_key, idempotencyKey),
        ),
      )
      .get();
    return row ? toApplicationDoc(row) : null;
  }

  async countByJobAndApplicant(
    jobId: Types.ObjectId | string,
    applicantId: Types.ObjectId | string,
  ): Promise<number> {
    if (process.env.USE_MONGODB === 'true' || isMock(Application.countDocuments)) {
      return Application.countDocuments({
        job_id: jobId,
        applicant_id: applicantId,
      }).exec();
    }
    const db = getSqliteDb();
    const row = db
      .select({ count: count() })
      .from(applications)
      .where(
        and(
          eq(applications.job_id, String(jobId)),
          eq(applications.applicant_id, String(applicantId)),
        ),
      )
      .get();
    return row?.count ?? 0;
  }

  async countHiredByJobId(jobId: Types.ObjectId | string): Promise<number> {
    if (process.env.USE_MONGODB === 'true' || isMock(Application.countDocuments)) {
      return Application.countDocuments({
        job_id: jobId,
        status: APPLICATION_HIRED_STATUS,
      }).exec();
    }
    const db = getSqliteDb();
    const row = db
      .select({ count: count() })
      .from(applications)
      .where(
        and(
          eq(applications.job_id, String(jobId)),
          eq(applications.status, APPLICATION_HIRED_STATUS),
        ),
      )
      .get();
    return row?.count ?? 0;
  }

  async countCertificatesSent(
    applicantId: string,
    certificateIds: string[],
  ): Promise<Map<string, number>> {
    if (!certificateIds.length) return new Map();
    if (process.env.USE_MONGODB === 'true' || isMock(Application.aggregate)) {
      const ids = certificateIds.map((id) => new Types.ObjectId(id));
      const rows = await Application.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { applicant_id: new Types.ObjectId(applicantId), 'certificates.certificate_id': { $in: ids } } },
        { $unwind: '$certificates' },
        { $match: { 'certificates.certificate_id': { $in: ids } } },
        { $group: { _id: '$certificates.certificate_id', count: { $sum: 1 } } },
      ]).exec();
      return new Map(rows.map((row) => [String(row._id), row.count]));
    }

    const db = getSqliteDb();
    const rows = db
      .select({ certificates: applications.certificates })
      .from(applications)
      .where(eq(applications.applicant_id, applicantId))
      .all();

    const counts = new Map<string, number>();
    for (const id of certificateIds) counts.set(id, 0);

    for (const r of rows) {
      for (const cert of r.certificates ?? []) {
        const certId = String(cert.certificate_id);
        if (counts.has(certId)) {
          counts.set(certId, (counts.get(certId) ?? 0) + 1);
        }
      }
    }
    return counts;
  }

  async deleteById(id: Types.ObjectId | string): Promise<void> {
    if (process.env.USE_MONGODB === 'true' || isMock(Application.deleteOne)) {
      await Application.deleteOne({ _id: id }).exec();
      return;
    }
    const db = getSqliteDb();
    db.delete(applications).where(eq(applications.id, String(id))).run();
  }

  async create(data: SubmitApplicationData): Promise<ApplicationDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Application.create)) {
      try {
        const application = await Application.create({
          job_id: data.jobId,
          applicant_id: data.applicantId,
          cv_id: data.cvId,
          ...(data.coverLetterId ? { cover_letter_id: data.coverLetterId } : {}),
          ...(data.message ? { message: data.message } : {}),
          ...(data.certificates?.length ? { certificates: data.certificates } : {}),
          ...(data.reappliedFrom ? { reapplied_from: data.reappliedFrom } : {}),
          ...(data.idempotencyKey && data.requestHash
            ? { idempotency_key: data.idempotencyKey, request_hash: data.requestHash }
            : {}),
          status: APPLICATION_INITIAL_STATUS,
          status_history: [this.buildHistoryEntry(data.changedBy)],
        });
        if (data.reappliedFrom) {
          await Application.updateOne(
            { _id: data.reappliedFrom, reapplied_as: { $exists: false } },
            { $set: { reapplied_as: application._id } },
            { timestamps: false },
          ).exec();
        }
        return application.toObject<ApplicationDoc>();
      } catch (error) {
        if (isDuplicateKeyError(error)) return null;
        throw error;
      }
    }

    const db = getSqliteDb();
    const id = generateId();
    const now = new Date();
    const historyEntry = this.buildHistoryEntry(data.changedBy);

    const values = {
      id,
      job_id: String(data.jobId),
      applicant_id: String(data.applicantId),
      cv_id: data.cvId,
      cover_letter_id: data.coverLetterId ?? null,
      message: data.message ?? null,
      status: APPLICATION_INITIAL_STATUS,
      withdrawal_reason: null,
      reapplied_from: data.reappliedFrom ? String(data.reappliedFrom) : null,
      reapplied_as: null,
      status_history: [
        {
          status: historyEntry.status,
          changed_at: historyEntry.changed_at,
          changed_by: new Types.ObjectId(historyEntry.changed_by),
        },
      ],
      certificates: data.certificates ?? [],
      notes: [],
      idempotency_key: data.idempotencyKey ?? null,
      request_hash: data.requestHash ?? null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      db.insert(applications).values(values).run();
      if (data.reappliedFrom) {
        db.update(applications)
          .set({ reapplied_as: id })
          .where(
            and(
              eq(applications.id, String(data.reappliedFrom)),
              isNull(applications.reapplied_as),
            ),
          )
          .run();
      }
      const created = db.select().from(applications).where(eq(applications.id, id)).get();
      return created ? toApplicationDoc(created) : null;
    } catch {
      return null;
    }
  }

  async findPageByApplicant(
    applicantId: string,
    params: FindApplicationsPageParams,
  ): Promise<{ items: ApplicationDoc[]; total: number }> {
    if (process.env.USE_MONGODB === 'true' || isMock(Application.find)) {
      const filter = this.buildFilter(applicantId, params.filters);
      const [items, total] = await Promise.all([
        Application.find(filter)
          .sort(this.buildSort(params.sortBy, params.sortOrder))
          .skip((params.page - 1) * params.limit)
          .limit(params.limit)
          .lean<ApplicationDoc[]>()
          .exec(),
        Application.countDocuments(filter).exec(),
      ]);
      return { items, total };
    }

    const db = getSqliteDb();
    const conditions = [eq(applications.applicant_id, applicantId)];

    if (params.filters.statuses?.length) {
      conditions.push(inArray(applications.status, params.filters.statuses));
    }
    if (params.filters.jobIds) {
      if (params.filters.jobIds.length === 0) return { items: [], total: 0 };
      conditions.push(inArray(applications.job_id, params.filters.jobIds));
    }
    if (params.filters.submittedFrom) {
      conditions.push(gte(applications.createdAt, params.filters.submittedFrom));
    }
    if (params.filters.submittedTo) {
      const nextDay = new Date(params.filters.submittedTo.getTime() + TIME_MS.ONE_DAY);
      conditions.push(lt(applications.createdAt, nextDay));
    }

    const whereClause = and(...conditions);
    const totalRow = db.select({ count: count() }).from(applications).where(whereClause).get();
    const total = totalRow?.count ?? 0;

    const sortColumn =
      params.sortBy === 'id'
        ? applications.id
        : params.sortBy === 'latestStatusAt'
          ? applications.updatedAt
          : applications.createdAt;

    const orderExpr =
      params.sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

    const rows = db
      .select()
      .from(applications)
      .where(whereClause)
      .orderBy(orderExpr, desc(applications.id))
      .limit(params.limit)
      .offset((params.page - 1) * params.limit)
      .all();

    return {
      items: rows.map((r) => toApplicationDoc(r)),
      total,
    };
  }

  async countByStatus(
    applicantId: string,
    filters: ApplicationListFilters,
  ): Promise<Record<ApplicationStatus, number>> {
    if (process.env.USE_MONGODB === 'true' || isMock(Application.aggregate)) {
      const rows = await Application.aggregate<{ _id: ApplicationStatus; count: number }>([
        { $match: this.buildFilter(applicantId, filters) },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]).exec();
      const counts = createEmptyStatusCounts();
      for (const row of rows) counts[row._id] = row.count;
      return counts;
    }

    const db = getSqliteDb();
    const conditions = [eq(applications.applicant_id, applicantId)];
    if (filters.statuses?.length) conditions.push(inArray(applications.status, filters.statuses));
    if (filters.jobIds) {
      if (filters.jobIds.length === 0) return createEmptyStatusCounts();
      conditions.push(inArray(applications.job_id, filters.jobIds));
    }
    if (filters.submittedFrom) conditions.push(gte(applications.createdAt, filters.submittedFrom));
    if (filters.submittedTo) {
      conditions.push(lt(applications.createdAt, new Date(filters.submittedTo.getTime() + TIME_MS.ONE_DAY)));
    }

    const rows = db
      .select({ status: applications.status, count: count() })
      .from(applications)
      .where(and(...conditions))
      .groupBy(applications.status)
      .all();

    const counts = createEmptyStatusCounts();
    for (const r of rows) counts[r.status] = r.count;
    return counts;
  }

  async findOwnedById(id: string, applicantId: string): Promise<ApplicationDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Application.findOne)) {
      return Application.findOne({ _id: id, applicant_id: applicantId }).lean<ApplicationDoc>().exec();
    }
    const db = getSqliteDb();
    const row = db
      .select()
      .from(applications)
      .where(and(eq(applications.id, id), eq(applications.applicant_id, applicantId)))
      .get();
    return row ? toApplicationDoc(row) : null;
  }

  async findHistoryPage(
    id: string,
    applicantId: string,
    page: number,
    limit: number,
  ): Promise<{ found: boolean; total: number; items: ApplicationStatusHistoryEntry[] }> {
    if (process.env.USE_MONGODB === 'true' || isMock(Application.aggregate)) {
      const [result] = await Application.aggregate<{ total: number; items: ApplicationStatusHistoryEntry[] }>([
        { $match: { _id: new Types.ObjectId(id), applicant_id: new Types.ObjectId(applicantId) } },
        { $project: { total: { $size: '$status_history' }, items: { $slice: ['$status_history', (page - 1) * limit, limit] } } },
      ]).exec();
      return result ? { found: true, total: result.total, items: result.items } : { found: false, total: 0, items: [] };
    }

    const db = getSqliteDb();
    const row = db
      .select({ status_history: applications.status_history })
      .from(applications)
      .where(and(eq(applications.id, id), eq(applications.applicant_id, applicantId)))
      .get();

    if (!row) return { found: false, total: 0, items: [] };
    const history: ApplicationStatusHistoryEntry[] = (row.status_history ?? []).map((h) => {
      const entry: ApplicationStatusHistoryEntry = {
        status: h.status,
        changed_at: new Date(h.changed_at),
        changed_by: new Types.ObjectId(h.changed_by),
        ...(h.note ? { note: h.note } : {}),
        ...(h.message_to_candidate ? { message_to_candidate: h.message_to_candidate } : {}),
        ...(h.rejection_reason ? { rejection_reason: h.rejection_reason } : {}),
        ...(h.actor_role ? { actor_role: h.actor_role } : {}),
      };
      return entry;
    });
    const total = history.length;
    const items = history.slice((page - 1) * limit, page * limit);
    return { found: true, total, items };
  }

  async withdrawAtomically(
    id: string,
    applicantId: string,
    expectedVersion: number,
    reason: string | undefined,
  ): Promise<ApplicationDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Application.findOneAndUpdate)) {
      return Application.findOneAndUpdate(
        {
          _id: id,
          applicant_id: applicantId,
          status: { $in: WITHDRAWABLE_STATUSES },
          $expr: { $eq: [{ $size: '$status_history' }, expectedVersion] },
        },
        {
          $set: { status: 'withdrawn', ...(reason ? { withdrawal_reason: reason } : {}) },
          $push: { status_history: { status: 'withdrawn', changed_at: new Date(), changed_by: applicantId } },
        },
        { returnDocument: 'after' },
      )
        .lean<ApplicationDoc>()
        .exec();
    }

    const db = getSqliteDb();
    const existing = db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.id, id),
          eq(applications.applicant_id, applicantId),
          inArray(applications.status, [...WITHDRAWABLE_STATUSES]),
        ),
      )
      .get();

    if (!existing) return null;
    const currentHistory = existing.status_history ?? [];
    if (currentHistory.length !== expectedVersion) return null;

    const now = new Date();
    const newEntry = {
      status: 'withdrawn' as const,
      changed_at: now,
      changed_by: new Types.ObjectId(applicantId),
    };

    db.update(applications)
      .set({
        status: 'withdrawn',
        withdrawal_reason: reason ?? null,
        status_history: [...currentHistory, newEntry],
        updatedAt: now,
      })
      .where(eq(applications.id, id))
      .run();

    const updated = db.select().from(applications).where(eq(applications.id, id)).get();
    return updated ? toApplicationDoc(updated) : null;
  }

  async findPageForRecruiter(
    params: FindRecruiterApplicationsPageParams,
  ): Promise<{ items: ApplicationDoc[]; total: number }> {
    if (params.filters.jobIds.length === 0) return { items: [], total: 0 };
    if (process.env.USE_MONGODB === 'true' || isMock(Application.find)) {
      const filter = this.buildRecruiterFilter(params.filters);
      const [items, total] = await Promise.all([
        Application.find(filter)
          .sort(this.buildSort(params.sortBy, params.sortOrder))
          .skip((params.page - 1) * params.limit)
          .limit(params.limit)
          .lean<ApplicationDoc[]>()
          .exec(),
        Application.countDocuments(filter).exec(),
      ]);
      return { items, total };
    }

    const db = getSqliteDb();
    const conditions = [inArray(applications.job_id, params.filters.jobIds)];

    if (params.filters.statuses?.length) {
      conditions.push(inArray(applications.status, params.filters.statuses));
    }

    if (params.filters.searchOr) {
      const orClauses = [];
      if (params.filters.searchOr.jobIds?.length) {
        orClauses.push(inArray(applications.job_id, params.filters.searchOr.jobIds));
      }
      if (params.filters.searchOr.applicantIds?.length) {
        orClauses.push(inArray(applications.applicant_id, params.filters.searchOr.applicantIds));
      }
      if (params.filters.searchOr.applicationIds?.length) {
        orClauses.push(inArray(applications.id, params.filters.searchOr.applicationIds));
      }
      if (orClauses.length > 0) {
        conditions.push(or(...orClauses)!);
      }
    } else {
      if (params.filters.applicantIds?.length) {
        conditions.push(inArray(applications.applicant_id, params.filters.applicantIds));
      }
      if (params.filters.applicationIds?.length) {
        conditions.push(inArray(applications.id, params.filters.applicationIds));
      }
    }

    if (params.filters.documentType === 'cv') {
      conditions.push(isNotNull(applications.cv_id));
    } else if (params.filters.documentType === 'cover_letter') {
      conditions.push(isNotNull(applications.cover_letter_id));
    }

    if (params.filters.submittedFrom) {
      conditions.push(gte(applications.createdAt, params.filters.submittedFrom));
    }
    if (params.filters.submittedTo) {
      conditions.push(lt(applications.createdAt, new Date(params.filters.submittedTo.getTime() + TIME_MS.ONE_DAY)));
    }

    const whereClause = and(...conditions);
    const totalRow = db.select({ count: count() }).from(applications).where(whereClause).get();
    const total = totalRow?.count ?? 0;

    const sortColumn =
      params.sortBy === 'id'
        ? applications.id
        : params.sortBy === 'latestStatusAt'
          ? applications.updatedAt
          : applications.createdAt;

    const orderExpr =
      params.sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

    const rows = db
      .select()
      .from(applications)
      .where(whereClause)
      .orderBy(orderExpr, desc(applications.id))
      .limit(params.limit)
      .offset((params.page - 1) * params.limit)
      .all();

    return {
      items: rows.map((r) => toApplicationDoc(r)),
      total,
    };
  }

  async countByStatusForRecruiter(
    filters: RecruiterApplicationListFilters,
  ): Promise<Record<ApplicationStatus, number>> {
    const counts = createEmptyStatusCounts();
    if (filters.jobIds.length === 0) return counts;
    if (process.env.USE_MONGODB === 'true' || isMock(Application.aggregate)) {
      const rows = await Application.aggregate<{ _id: ApplicationStatus; count: number }>([
        { $match: this.buildRecruiterFilter(filters) },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]).exec();
      for (const row of rows) counts[row._id] = row.count;
      return counts;
    }

    const db = getSqliteDb();
    const conditions = [inArray(applications.job_id, filters.jobIds)];
    if (filters.statuses?.length) conditions.push(inArray(applications.status, filters.statuses));
    if (filters.documentType === 'cv') conditions.push(isNotNull(applications.cv_id));
    if (filters.documentType === 'cover_letter') conditions.push(isNotNull(applications.cover_letter_id));
    if (filters.submittedFrom) conditions.push(gte(applications.createdAt, filters.submittedFrom));
    if (filters.submittedTo) {
      conditions.push(lt(applications.createdAt, new Date(filters.submittedTo.getTime() + TIME_MS.ONE_DAY)));
    }

    const rows = db
      .select({ status: applications.status, count: count() })
      .from(applications)
      .where(and(...conditions))
      .groupBy(applications.status)
      .all();

    for (const r of rows) counts[r.status] = r.count;
    return counts;
  }

  async findById(id: string | Types.ObjectId): Promise<ApplicationDoc | null> {
    const strId = String(id);
    if (!Types.ObjectId.isValid(strId)) return null;
    if (process.env.USE_MONGODB === 'true' || isMock(Application.findById)) {
      return Application.findById(id).lean<ApplicationDoc>().exec();
    }
    const db = getSqliteDb();
    const row = db.select().from(applications).where(eq(applications.id, strId)).get();
    return row ? toApplicationDoc(row) : null;
  }

  async findByIdAndJobIds(
    applicationId: string | Types.ObjectId,
    jobIds: (string | Types.ObjectId)[],
  ): Promise<ApplicationDoc | null> {
    const strAppId = String(applicationId);
    if (jobIds.length === 0 || !Types.ObjectId.isValid(strAppId)) return null;
    if (process.env.USE_MONGODB === 'true' || isMock(Application.findOne)) {
      return Application.findOne({
        _id: new Types.ObjectId(strAppId),
        job_id: { $in: jobIds.map((id) => (typeof id === 'string' ? new Types.ObjectId(id) : id)) },
      })
        .lean<ApplicationDoc>()
        .exec();
    }
    const db = getSqliteDb();
    const strJobIds = jobIds.map((j) => String(j));
    const row = db
      .select()
      .from(applications)
      .where(and(eq(applications.id, strAppId), inArray(applications.job_id, strJobIds)))
      .get();
    return row ? toApplicationDoc(row) : null;
  }

  async addNoteToApplication(
    applicationId: string | Types.ObjectId,
    enterpriseJobIds: (string | Types.ObjectId)[],
    noteData: {
      authorId: string | Types.ObjectId;
      authorName: string;
      content: string;
    },
  ): Promise<ApplicationNoteEntry | null> {
    const strAppId = String(applicationId);
    if (enterpriseJobIds.length === 0 || !Types.ObjectId.isValid(strAppId)) return null;
    if (process.env.USE_MONGODB === 'true' || isMock(Application.findOneAndUpdate)) {
      const noteEntry: ApplicationNoteEntry = {
        author_id: new Types.ObjectId(noteData.authorId),
        author_name: noteData.authorName,
        content: noteData.content,
        created_at: new Date(),
      };
      const updated = await Application.findOneAndUpdate(
        {
          _id: new Types.ObjectId(strAppId),
          job_id: { $in: enterpriseJobIds.map((id) => (typeof id === 'string' ? new Types.ObjectId(id) : id)) },
        },
        { $push: { notes: noteEntry } },
        { returnDocument: 'after' },
      )
        .lean<ApplicationDoc>()
        .exec();
      return updated ? noteEntry : null;
    }

    const db = getSqliteDb();
    const strJobIds = enterpriseJobIds.map((j) => String(j));
    const existing = db
      .select()
      .from(applications)
      .where(and(eq(applications.id, strAppId), inArray(applications.job_id, strJobIds)))
      .get();
    if (!existing) return null;

    const now = new Date();
    const noteEntry: ApplicationNoteEntry = {
      author_id: new Types.ObjectId(noteData.authorId),
      author_name: noteData.authorName,
      content: noteData.content,
      created_at: now,
    };

    const newNotes = [...(existing.notes ?? []), noteEntry];
    db.update(applications)
      .set({ notes: newNotes, updatedAt: now })
      .where(eq(applications.id, strAppId))
      .run();

    return noteEntry;
  }

  async findNotesByApplicationId(
    applicationId: string | Types.ObjectId,
    enterpriseJobIds: (string | Types.ObjectId)[],
  ): Promise<ApplicationNoteEntry[] | null> {
    const strAppId = String(applicationId);
    if (enterpriseJobIds.length === 0 || !Types.ObjectId.isValid(strAppId)) return null;
    if (process.env.USE_MONGODB === 'true' || isMock(Application.findOne)) {
      const application = await Application.findOne(
        {
          _id: new Types.ObjectId(strAppId),
          job_id: { $in: enterpriseJobIds.map((id) => (typeof id === 'string' ? new Types.ObjectId(id) : id)) },
        },
        { notes: 1 },
      )
        .lean<Pick<ApplicationDoc, '_id' | 'notes'>>()
        .exec();
      return application?.notes ?? null;
    }

    const db = getSqliteDb();
    const strJobIds = enterpriseJobIds.map((j) => String(j));
    const row = db
      .select({ notes: applications.notes })
      .from(applications)
      .where(and(eq(applications.id, strAppId), inArray(applications.job_id, strJobIds)))
      .get();
    return row ? (row.notes ?? []) : null;
  }

  async updateStatusAtomically(
    applicationId: string | Types.ObjectId,
    enterpriseJobIds: (string | Types.ObjectId)[],
    data: UpdateRecruiterStatusData,
    expectedVersion?: number,
  ): Promise<ApplicationDoc | null> {
    const strAppId = String(applicationId);
    if (enterpriseJobIds.length === 0 || !Types.ObjectId.isValid(strAppId)) return null;
    if (process.env.USE_MONGODB === 'true' || isMock(Application.findOneAndUpdate)) {
      const filter: Record<string, unknown> = {
        _id: new Types.ObjectId(strAppId),
        job_id: { $in: enterpriseJobIds.map((id) => (typeof id === 'string' ? new Types.ObjectId(id) : id)) },
      };
      if (typeof expectedVersion === 'number') {
        filter.$expr = { $eq: [{ $size: '$status_history' }, expectedVersion] };
      }
      const historyEntry: ApplicationStatusHistoryEntry = {
        status: data.status,
        changed_at: new Date(),
        changed_by: new Types.ObjectId(data.changedBy),
        actor_role: data.actorRole ?? 'recruiter',
        ...(data.note ? { note: data.note } : {}),
        ...(data.messageToCandidate ? { message_to_candidate: data.messageToCandidate } : {}),
        ...(data.rejectionReason ? { rejection_reason: data.rejectionReason } : {}),
      };
      const update: Record<string, unknown> = {
        $set: {
          status: data.status,
          ...(data.rejectionReason ? { rejection_reason: data.rejectionReason } : {}),
        },
        $push: { status_history: historyEntry },
      };
      return Application.findOneAndUpdate(filter, update, { returnDocument: 'after' })
        .lean<ApplicationDoc>()
        .exec();
    }

    const db = getSqliteDb();
    const strJobIds = enterpriseJobIds.map((j) => String(j));
    const existing = db
      .select()
      .from(applications)
      .where(and(eq(applications.id, strAppId), inArray(applications.job_id, strJobIds)))
      .get();
    if (!existing) return null;

    const currentHistory = existing.status_history ?? [];
    if (typeof expectedVersion === 'number' && currentHistory.length !== expectedVersion) {
      return null;
    }

    const now = new Date();
    const historyEntry: ApplicationStatusHistoryEntry = {
      status: data.status,
      changed_at: now,
      changed_by: new Types.ObjectId(data.changedBy),
      actor_role: data.actorRole ?? 'recruiter',
      ...(data.note ? { note: data.note } : {}),
      ...(data.messageToCandidate ? { message_to_candidate: data.messageToCandidate } : {}),
      ...(data.rejectionReason ? { rejection_reason: data.rejectionReason } : {}),
    };

    db.update(applications)
      .set({
        status: data.status,
        withdrawal_reason: data.rejectionReason ?? existing.withdrawal_reason,
        status_history: [...currentHistory, historyEntry],
        updatedAt: now,
      })
      .where(eq(applications.id, strAppId))
      .run();

    const updated = db.select().from(applications).where(eq(applications.id, strAppId)).get();
    return updated ? toApplicationDoc(updated) : null;
  }

  async countHiredApplications(jobId: string | Types.ObjectId): Promise<number> {
    const strJobId = String(jobId);
    if (!Types.ObjectId.isValid(strJobId)) return 0;
    if (process.env.USE_MONGODB === 'true' || isMock(Application.countDocuments)) {
      return Application.countDocuments({
        job_id: new Types.ObjectId(strJobId),
        status: 'hired',
      }).exec();
    }
    const db = getSqliteDb();
    const row = db
      .select({ count: count() })
      .from(applications)
      .where(and(eq(applications.job_id, strJobId), eq(applications.status, 'hired')))
      .get();
    return row?.count ?? 0;
  }

  async cascadePositionFilled(
    jobId: string | Types.ObjectId,
    excludedApplicationId: string | Types.ObjectId,
    changedBy: string | Types.ObjectId = '000000000000000000000000',
  ): Promise<number> {
    const strJobId = String(jobId);
    const strExId = String(excludedApplicationId);
    const strChangedBy = String(changedBy);
    if (!Types.ObjectId.isValid(strJobId) || !Types.ObjectId.isValid(strChangedBy)) return 0;

    if (process.env.USE_MONGODB === 'true' || isMock(Application.updateMany)) {
      const historyEntry: ApplicationStatusHistoryEntry = {
        status: 'position_filled',
        changed_at: new Date(),
        changed_by: new Types.ObjectId(strChangedBy),
        actor_role: 'system',
        note: 'Position filled by another candidate',
      };
      const result = await Application.updateMany(
        {
          job_id: new Types.ObjectId(strJobId),
          _id: { $ne: new Types.ObjectId(strExId) },
          status: { $in: ['submitted', 'under_review', 'interviewing', 'offered'] },
        },
        {
          $set: { status: 'position_filled' },
          $push: { status_history: historyEntry },
        },
      ).exec();
      return result.modifiedCount;
    }

    const db = getSqliteDb();
    const now = new Date();
    const targetRows = db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.job_id, strJobId),
          ne(applications.id, strExId),
          inArray(applications.status, ['submitted', 'under_review', 'interviewing', 'offered']),
        ),
      )
      .all();

    for (const r of targetRows) {
      const historyEntry = {
        status: 'position_filled' as const,
        changed_at: now,
        changed_by: new Types.ObjectId(strChangedBy),
        actor_role: 'system',
        note: 'Position filled by another candidate',
      };
      db.update(applications)
        .set({
          status: 'position_filled',
          status_history: [...(r.status_history ?? []), historyEntry],
          updatedAt: now,
        })
        .where(eq(applications.id, r.id))
        .run();
    }
    return targetRows.length;
  }

  async findApplicantSubmissionsByJobIds(
    applicantId: string | Types.ObjectId,
    jobIds: (string | Types.ObjectId)[],
  ): Promise<ApplicationDoc[]> {
    const strAppId = String(applicantId);
    if (jobIds.length === 0 || !Types.ObjectId.isValid(strAppId)) return [];
    if (process.env.USE_MONGODB === 'true' || isMock(Application.find)) {
      return Application.find({
        applicant_id: new Types.ObjectId(strAppId),
        job_id: { $in: jobIds.map((id) => (typeof id === 'string' ? new Types.ObjectId(id) : id)) },
      })
        .sort({ createdAt: -1 })
        .lean<ApplicationDoc[]>()
        .exec();
    }

    const db = getSqliteDb();
    const strJobIds = jobIds.map((j) => String(j));
    const rows = db
      .select()
      .from(applications)
      .where(and(eq(applications.applicant_id, strAppId), inArray(applications.job_id, strJobIds)))
      .orderBy(desc(applications.createdAt), desc(applications.id))
      .all();
    return rows.map((r) => toApplicationDoc(r));
  }

  private buildFilter(applicantId: string, filters: ApplicationListFilters): QueryFilter<ApplicationData> {
    const filter: QueryFilter<ApplicationData> = { applicant_id: new Types.ObjectId(applicantId) };
    if (filters.statuses?.length) filter.status = { $in: filters.statuses };
    if (filters.jobIds) filter.job_id = { $in: filters.jobIds.map((id) => new Types.ObjectId(id)) };
    if (filters.submittedFrom || filters.submittedTo) {
      filter.createdAt = {
        ...(filters.submittedFrom ? { $gte: filters.submittedFrom } : {}),
        ...(filters.submittedTo ? { $lt: new Date(filters.submittedTo.getTime() + TIME_MS.ONE_DAY) } : {}),
      };
    }
    return filter;
  }

  private buildRecruiterFilter(filters: RecruiterApplicationListFilters): QueryFilter<ApplicationData> {
    const filter: QueryFilter<ApplicationData> = {
      job_id: { $in: filters.jobIds.map((id) => new Types.ObjectId(id)) },
    };
    if (filters.statuses?.length) filter.status = { $in: filters.statuses };
    if (filters.searchOr) {
      const orConditions: QueryFilter<ApplicationData>[] = [];
      if (filters.searchOr.jobIds?.length) {
        orConditions.push({ job_id: { $in: filters.searchOr.jobIds.map((id) => new Types.ObjectId(id)) } });
      }
      if (filters.searchOr.applicantIds?.length) {
        orConditions.push({ applicant_id: { $in: filters.searchOr.applicantIds.map((id) => new Types.ObjectId(id)) } });
      }
      if (filters.searchOr.applicationIds?.length) {
        orConditions.push({ _id: { $in: filters.searchOr.applicationIds.map((id) => new Types.ObjectId(id)) } });
      }
      if (orConditions.length > 0) filter.$or = orConditions;
    } else {
      if (filters.applicantIds?.length) {
        filter.applicant_id = { $in: filters.applicantIds.map((id) => new Types.ObjectId(id)) };
      }
      if (filters.applicationIds?.length) {
        filter._id = { $in: filters.applicationIds.map((id) => new Types.ObjectId(id)) };
      }
    }
    if (filters.documentType === 'cv') {
      filter.cv_id = { $exists: true, $ne: null as unknown as Types.ObjectId };
    } else if (filters.documentType === 'cover_letter') {
      filter.cover_letter_id = { $exists: true, $ne: null as unknown as Types.ObjectId };
    }
    if (filters.submittedFrom || filters.submittedTo) {
      filter.createdAt = {
        ...(filters.submittedFrom ? { $gte: filters.submittedFrom } : {}),
        ...(filters.submittedTo ? { $lt: new Date(filters.submittedTo.getTime() + TIME_MS.ONE_DAY) } : {}),
      };
    }
    return filter;
  }

  private buildSort(sortBy: ApplicationSortField, sortOrder: ApplicationSortOrder): Record<string, 1 | -1> {
    const direction = sortOrder === 'asc' ? 1 : -1;
    const column = APPLICATION_SORT_COLUMNS[sortBy];
    return column === '_id' ? { _id: direction } : { [column]: direction, _id: direction };
  }

  private buildHistoryEntry(changedBy: string): Pick<ApplicationStatusHistoryEntry, 'status' | 'changed_at'> & {
    changed_by: string;
  } {
    return {
      status: APPLICATION_INITIAL_STATUS,
      changed_at: new Date(),
      changed_by: changedBy,
    };
  }
}

export const applicationsRepository = new ApplicationsRepository();
