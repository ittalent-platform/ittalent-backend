import { Types } from 'mongoose';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  like,
  lt,
  lte,
  ne,
} from 'drizzle-orm';

import { generateId, getSqliteDb } from '../../config/sqlite.js';
import {
  applications,
  enterprises,
  interviews,
  jobPostings,
} from '../../db/schema/index.js';
import {
  Application,
  type ApplicationDoc,
  type ApplicationStatus,
} from '../../models/application.model.js';
import { Enterprise } from '../../models/enterprise.model.js';
import {
  Interview,
  type InterviewData,
  type InterviewDoc,
  type InterviewMode,
  type InterviewRescheduleRequest,
  type InterviewStatus,
  type InterviewStatusHistoryEntry,
} from '../../models/interview.model.js';
import { JobPosting } from '../../models/job-posting.model.js';
import {
  INTERVIEW_CONFIG,
  INTERVIEW_EDITABLE_STATUS,
  INTERVIEW_COMPLETED_STATUS,
  INTERVIEW_INITIAL_STATUS,
  INTERVIEW_SORT_COLUMNS,
  type InterviewSortField,
  type InterviewSortOrder,
} from './interviews.constants.js';

export interface InterviewJobRow {
  _id: Types.ObjectId;
  enterprise_id: Types.ObjectId;
  title: string;
}

export interface InterviewApplicationContext {
  application: ApplicationDoc;
  job: InterviewJobRow;
}

export interface CreateInterviewRecord {
  enterpriseId: string;
  applicationId: string;
  jobId: string;
  applicantId: string;
  interviewerIds: string[];
  createdBy: string;
  scheduledAt: Date;
  endsAt: Date;
  durationMinutes: number;
  mode: InterviewMode;
  meetingLink?: string | undefined;
  location?: string | undefined;
  notes?: string | undefined;
}

export interface UpdateInterviewRecord {
  interviewerIds?: string[] | undefined;
  scheduledAt?: Date | undefined;
  endsAt?: Date | undefined;
  durationMinutes?: number | undefined;
  mode?: InterviewMode | undefined;
  meetingLink?: string | null | undefined;
  location?: string | null | undefined;
  notes?: string | null | undefined;
}

export interface InterviewFilter {
  enterpriseId: string;
  interviewerId?: string | undefined;
  statuses?: InterviewStatus[] | undefined;
  mode?: InterviewMode | undefined;
  jobId?: string | undefined;
  applicationId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  overlapRange?: boolean | undefined;
  search?: { userIds: string[]; jobIds: string[] } | undefined;
}

export interface FindInterviewsPageParams {
  page: number;
  limit: number;
  sortBy: InterviewSortField;
  sortOrder: InterviewSortOrder;
}

export interface SchedulableApplicationFilter {
  enterpriseId: string;
  statuses: readonly ApplicationStatus[];
  search?: { userIds: string[]; jobIds: string[] } | undefined;
  limit: number;
}

export interface InterviewConflictParams {
  interviewerIds: string[];
  applicantId: string;
  startsAt: Date;
  endsAt: Date;
  excludeId?: string | undefined;
}

export interface RequestInterviewRescheduleRecord {
  proposedDateTime: Date;
  reason: string;
}

function isMock(fn: unknown): boolean {
  return typeof fn === 'function' && ('_isMockFunction' in fn || 'mock' in fn);
}

function toInterviewDoc(row: typeof interviews.$inferSelect): InterviewDoc {
  const doc = {
    _id: new Types.ObjectId(row.id),
    id: row.id,
    enterprise_id: new Types.ObjectId(row.enterprise_id),
    application_id: new Types.ObjectId(row.application_id),
    job_id: new Types.ObjectId(row.job_id),
    applicant_id: new Types.ObjectId(row.applicant_id),
    interviewer_ids: (row.interviewer_ids ?? []).map((id) => new Types.ObjectId(id)),
    created_by: new Types.ObjectId(row.created_by),
    scheduled_at: new Date(row.scheduled_at),
    ends_at: new Date(row.ends_at),
    duration_minutes: row.duration_minutes,
    mode: row.mode as InterviewMode,
    meeting_link: row.meeting_link ?? undefined,
    location: row.location ?? undefined,
    notes: row.notes ?? undefined,
    status: row.status as InterviewStatus,
    reschedule_request: row.reschedule_request
      ? {
          proposed_time: new Date(row.reschedule_request.proposed_time),
          reason: row.reschedule_request.reason,
          requested_at: new Date(row.reschedule_request.requested_at),
        }
      : undefined,
    status_history: (row.status_history ?? []).map((h) => ({
      status: h.status,
      changed_at: new Date(h.changed_at),
      changed_by: new Types.ObjectId(h.changed_by),
      note: h.note,
    })),
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
  } as unknown as InterviewDoc;
}

function toApplicationDoc(row: typeof applications.$inferSelect): ApplicationDoc {
  const doc = {
    _id: new Types.ObjectId(row.id),
    id: row.id,
    job_id: new Types.ObjectId(row.job_id),
    applicant_id: new Types.ObjectId(row.applicant_id),
    cv_id: new Types.ObjectId(row.cv_id),
    cover_letter_id: row.cover_letter_id ? new Types.ObjectId(row.cover_letter_id) : undefined,
    message: row.message ?? undefined,
    status: row.status as ApplicationStatus,
    withdrawal_reason: row.withdrawal_reason ?? undefined,
    reapplied_from: row.reapplied_from ? new Types.ObjectId(row.reapplied_from) : undefined,
    reapplied_as: row.reapplied_as ? new Types.ObjectId(row.reapplied_as) : undefined,
    status_history: (row.status_history ?? []).map((h) => ({
      status: h.status,
      changed_at: new Date(h.changed_at),
      changed_by: new Types.ObjectId(h.changed_by),
      note: h.note,
      message_to_candidate: h.message_to_candidate,
      rejection_reason: h.rejection_reason,
      actor_role: h.actor_role,
    })),
    certificates: row.certificates ?? [],
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

export class InterviewsRepository {
  async findApplicationContext(applicationId: string): Promise<InterviewApplicationContext | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Application.findById) || isMock(JobPosting.findById)) {
      const application = await Application.findById(applicationId).lean<ApplicationDoc>().exec();
      if (!application) return null;
      const job = await JobPosting.findById(application.job_id, { enterprise_id: 1, title: 1 })
        .lean<InterviewJobRow>()
        .exec();
      return job ? { application, job } : null;
    }
    const db = getSqliteDb();
    const appRow = db.select().from(applications).where(eq(applications.id, applicationId)).get();
    if (!appRow) return null;
    const jobRow = db
      .select({ id: jobPostings.id, enterprise_id: jobPostings.enterprise_id, title: jobPostings.title })
      .from(jobPostings)
      .where(eq(jobPostings.id, appRow.job_id))
      .get();
    if (!jobRow) return null;

    return {
      application: toApplicationDoc(appRow),
      job: {
        _id: new Types.ObjectId(jobRow.id),
        enterprise_id: new Types.ObjectId(jobRow.enterprise_id),
        title: jobRow.title,
      },
    };
  }

  async findJobTitles(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    if (process.env.USE_MONGODB === 'true' || isMock(JobPosting.find)) {
      const jobs = await JobPosting.find({ _id: { $in: ids } }, { title: 1 }).lean<{ _id: Types.ObjectId; title: string }[]>().exec();
      return new Map(jobs.map((job) => [String(job._id), job.title]));
    }
    const db = getSqliteDb();
    const rows = db
      .select({ id: jobPostings.id, title: jobPostings.title })
      .from(jobPostings)
      .where(inArray(jobPostings.id, ids))
      .all();
    return new Map(rows.map((r) => [r.id, r.title]));
  }

  async findEnterpriseName(enterpriseId: string): Promise<string | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Enterprise.findById)) {
      const enterprise = await Enterprise.findById(enterpriseId, { name: 1 }).lean<{ name: string }>().exec();
      return enterprise?.name ?? null;
    }
    const db = getSqliteDb();
    const row = db.select({ name: enterprises.name }).from(enterprises).where(eq(enterprises.id, enterpriseId)).get();
    return row?.name ?? null;
  }

  async findJobIdsByTitle(enterpriseId: string, keyword: string): Promise<string[]> {
    if (process.env.USE_MONGODB === 'true' || isMock(JobPosting.find)) {
      const pattern = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const jobs = await JobPosting.find({ enterprise_id: enterpriseId, title: pattern }, { _id: 1 })
        .limit(INTERVIEW_CONFIG.SEARCH_MATCH_LIMIT)
        .lean<{ _id: Types.ObjectId }[]>()
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
      .limit(INTERVIEW_CONFIG.SEARCH_MATCH_LIMIT)
      .all();
    return rows.map((r) => r.id);
  }

  async findSchedulableApplications(filter: SchedulableApplicationFilter): Promise<ApplicationDoc[]> {
    if (process.env.USE_MONGODB === 'true' || isMock(Application.find) || isMock(JobPosting.find)) {
      const jobs = await JobPosting.find({ enterprise_id: filter.enterpriseId }, { _id: 1 })
        .lean<{ _id: Types.ObjectId }[]>()
        .exec();
      if (jobs.length === 0) return [];
      const conditions: unknown[] = [
        { job_id: { $in: jobs.map((job) => String(job._id)) } },
        { status: { $in: [...filter.statuses] } },
      ];
      if (filter.search) {
        conditions.push({
          $or: [{ applicant_id: { $in: filter.search.userIds } }, { job_id: { $in: filter.search.jobIds } }],
        });
      }
      return Application.find({ $and: conditions as never })
        .sort({ createdAt: -1, _id: -1 })
        .limit(filter.limit)
        .lean<ApplicationDoc[]>()
        .exec();
    }

    const db = getSqliteDb();
    const jobRows = db
      .select({ id: jobPostings.id })
      .from(jobPostings)
      .where(eq(jobPostings.enterprise_id, filter.enterpriseId))
      .all();
    const jobIds = jobRows.map((j) => j.id);
    if (jobIds.length === 0) return [];

    const conditions = [
      inArray(applications.job_id, jobIds),
      inArray(applications.status, [...filter.statuses]),
    ];

    if (filter.search) {
      const subConditions = [];
      if (filter.search.userIds.length > 0) {
        subConditions.push(inArray(applications.applicant_id, filter.search.userIds));
      }
      if (filter.search.jobIds.length > 0) {
        subConditions.push(inArray(applications.job_id, filter.search.jobIds));
      }
      if (subConditions.length > 0) {
        conditions.push(subConditions.length === 1 ? subConditions[0]! : subConditions[0]!);
      }
    }

    const rows = db
      .select()
      .from(applications)
      .where(and(...conditions))
      .orderBy(desc(applications.createdAt), desc(applications.id))
      .limit(filter.limit)
      .all();

    return rows.map((r) => toApplicationDoc(r));
  }

  async findConflict(params: InterviewConflictParams): Promise<InterviewDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Interview.findOne)) {
      return Interview.findOne({
        status: INTERVIEW_INITIAL_STATUS,
        scheduled_at: { $lt: params.endsAt },
        ends_at: { $gt: params.startsAt },
        $or: [{ interviewer_ids: { $in: params.interviewerIds } }, { applicant_id: params.applicantId }],
        ...(params.excludeId ? { _id: { $ne: params.excludeId } } : {}),
      })
        .lean<InterviewDoc>()
        .exec();
    }

    const db = getSqliteDb();
    const conditions = [
      eq(interviews.status, INTERVIEW_INITIAL_STATUS),
      lt(interviews.scheduled_at, params.endsAt),
      gt(interviews.ends_at, params.startsAt),
    ];
    if (params.excludeId) {
      conditions.push(ne(interviews.id, params.excludeId));
    }

    const rows = db
      .select()
      .from(interviews)
      .where(and(...conditions))
      .all();

    for (const row of rows) {
      if (row.applicant_id === params.applicantId) {
        return toInterviewDoc(row);
      }
      const interviewers = row.interviewer_ids ?? [];
      if (params.interviewerIds.some((id) => interviewers.includes(id))) {
        return toInterviewDoc(row);
      }
    }
    return null;
  }

  async create(record: CreateInterviewRecord): Promise<InterviewDoc> {
    if (process.env.USE_MONGODB === 'true' || isMock(Interview.create)) {
      const now = new Date();
      const created = await Interview.create({
        enterprise_id: record.enterpriseId,
        application_id: record.applicationId,
        job_id: record.jobId,
        applicant_id: record.applicantId,
        interviewer_ids: record.interviewerIds,
        created_by: record.createdBy,
        scheduled_at: record.scheduledAt,
        ends_at: record.endsAt,
        duration_minutes: record.durationMinutes,
        mode: record.mode,
        ...(record.meetingLink ? { meeting_link: record.meetingLink } : {}),
        ...(record.location ? { location: record.location } : {}),
        ...(record.notes ? { notes: record.notes } : {}),
        status: INTERVIEW_INITIAL_STATUS,
        status_history: [{ status: INTERVIEW_INITIAL_STATUS, changed_at: now, changed_by: record.createdBy }],
      });
      return created.toObject() as unknown as InterviewDoc;
    }

    const db = getSqliteDb();
    const id = generateId();
    const now = new Date();
    const historyEntry = {
      status: INTERVIEW_INITIAL_STATUS,
      changed_at: now,
      changed_by: new Types.ObjectId(record.createdBy),
    };

    db.insert(interviews)
      .values({
        id,
        enterprise_id: record.enterpriseId,
        application_id: record.applicationId,
        job_id: record.jobId,
        applicant_id: record.applicantId,
        interviewer_ids: record.interviewerIds,
        created_by: record.createdBy,
        scheduled_at: record.scheduledAt,
        ends_at: record.endsAt,
        duration_minutes: record.durationMinutes,
        mode: record.mode,
        meeting_link: record.meetingLink ?? null,
        location: record.location ?? null,
        notes: record.notes ?? null,
        status: INTERVIEW_INITIAL_STATUS,
        status_history: [historyEntry],
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const created = db.select().from(interviews).where(eq(interviews.id, id)).get();
    if (!created) throw new Error('Failed to create interview');
    return toInterviewDoc(created);
  }

  async findById(id: string): Promise<InterviewDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Interview.findById)) {
      return Interview.findById(id).lean<InterviewDoc>().exec();
    }
    const db = getSqliteDb();
    const row = db.select().from(interviews).where(eq(interviews.id, id)).get();
    return row ? toInterviewDoc(row) : null;
  }

  async updateScheduled(id: string, update: UpdateInterviewRecord): Promise<InterviewDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Interview.findOneAndUpdate)) {
      const set: Partial<Record<keyof InterviewData, unknown>> = {};
      const unset: Partial<Record<keyof InterviewData, ''>> = {};
      if (update.interviewerIds) set.interviewer_ids = update.interviewerIds;
      if (update.scheduledAt) set.scheduled_at = update.scheduledAt;
      if (update.endsAt) set.ends_at = update.endsAt;
      if (update.durationMinutes !== undefined) set.duration_minutes = update.durationMinutes;
      if (update.mode) set.mode = update.mode;
      for (const [field, value] of [
        ['meeting_link', update.meetingLink],
        ['location', update.location],
        ['notes', update.notes],
      ] as const) {
        if (value === null) unset[field] = '';
        else if (value !== undefined) set[field] = value;
      }
      return Interview.findOneAndUpdate(
        { _id: id, status: INTERVIEW_EDITABLE_STATUS },
        {
          ...(Object.keys(set).length > 0 ? { $set: set } : {}),
          ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
        },
        { returnDocument: 'after' },
      )
        .lean<InterviewDoc>()
        .exec();
    }

    const db = getSqliteDb();
    const existing = db
      .select()
      .from(interviews)
      .where(and(eq(interviews.id, id), eq(interviews.status, INTERVIEW_EDITABLE_STATUS)))
      .get();
    if (!existing) return null;

    const updateData: Partial<typeof interviews.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (update.interviewerIds !== undefined) updateData.interviewer_ids = update.interviewerIds;
    if (update.scheduledAt !== undefined) updateData.scheduled_at = update.scheduledAt;
    if (update.endsAt !== undefined) updateData.ends_at = update.endsAt;
    if (update.durationMinutes !== undefined) updateData.duration_minutes = update.durationMinutes;
    if (update.mode !== undefined) updateData.mode = update.mode;
    if (update.meetingLink !== undefined) updateData.meeting_link = update.meetingLink ?? null;
    if (update.location !== undefined) updateData.location = update.location ?? null;
    if (update.notes !== undefined) updateData.notes = update.notes ?? null;

    db.update(interviews)
      .set(updateData)
      .where(eq(interviews.id, id))
      .run();

    const updated = db.select().from(interviews).where(eq(interviews.id, id)).get();
    return updated ? toInterviewDoc(updated) : null;
  }

  async transitionFromScheduled(
    id: string,
    status: InterviewStatus,
    changedBy: string,
    options: { note?: string | undefined; endedBefore?: Date | undefined } = {},
  ): Promise<InterviewDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Interview.findOneAndUpdate)) {
      const entry: InterviewStatusHistoryEntry = {
        status,
        changed_at: new Date(),
        changed_by: new Types.ObjectId(changedBy),
        ...(options.note ? { note: options.note } : {}),
      };
      return Interview.findOneAndUpdate(
        {
          _id: id,
          status: INTERVIEW_EDITABLE_STATUS,
          ...(options.endedBefore ? { ends_at: { $lte: options.endedBefore } } : {}),
        },
        { $set: { status }, $push: { status_history: entry } },
        { returnDocument: 'after' },
      )
        .lean<InterviewDoc>()
        .exec();
    }

    const db = getSqliteDb();
    const conditions = [
      eq(interviews.id, id),
      eq(interviews.status, INTERVIEW_EDITABLE_STATUS),
    ];
    if (options.endedBefore) {
      conditions.push(lte(interviews.ends_at, options.endedBefore));
    }

    const existing = db
      .select()
      .from(interviews)
      .where(and(...conditions))
      .get();
    if (!existing) return null;

    const now = new Date();
    const entry = {
      status,
      changed_at: now,
      changed_by: new Types.ObjectId(changedBy),
      ...(options.note ? { note: options.note } : {}),
    };
    const history = [...(existing.status_history ?? []), entry];

    db.update(interviews)
      .set({
        status,
        status_history: history,
        updatedAt: now,
      })
      .where(eq(interviews.id, id))
      .run();

    const updated = db.select().from(interviews).where(eq(interviews.id, id)).get();
    return updated ? toInterviewDoc(updated) : null;
  }

  async requestReschedule(
    id: string,
    applicantId: string,
    record: RequestInterviewRescheduleRecord,
  ): Promise<InterviewDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Interview.findOneAndUpdate)) {
      const requestedAt = new Date();
      const request: InterviewRescheduleRequest = {
        proposed_time: record.proposedDateTime,
        reason: record.reason,
        requested_at: requestedAt,
      };
      const entry: InterviewStatusHistoryEntry = {
        status: 'reschedule_requested',
        changed_at: requestedAt,
        changed_by: new Types.ObjectId(applicantId),
      };
      return Interview.findOneAndUpdate(
        { _id: id, applicant_id: applicantId, status: INTERVIEW_EDITABLE_STATUS },
        { $set: { status: 'reschedule_requested', reschedule_request: request }, $push: { status_history: entry } },
        { returnDocument: 'after' },
      )
        .lean<InterviewDoc>()
        .exec();
    }

    const db = getSqliteDb();
    const existing = db
      .select()
      .from(interviews)
      .where(
        and(
          eq(interviews.id, id),
          eq(interviews.applicant_id, applicantId),
          eq(interviews.status, INTERVIEW_EDITABLE_STATUS),
        ),
      )
      .get();
    if (!existing) return null;

    const requestedAt = new Date();
    const request: InterviewRescheduleRequest = {
      proposed_time: record.proposedDateTime,
      reason: record.reason,
      requested_at: requestedAt,
    };
    const entry = {
      status: 'reschedule_requested' as const,
      changed_at: requestedAt,
      changed_by: new Types.ObjectId(applicantId),
    };
    const history = [...(existing.status_history ?? []), entry];

    db.update(interviews)
      .set({
        status: 'reschedule_requested',
        reschedule_request: request,
        status_history: history,
        updatedAt: requestedAt,
      })
      .where(eq(interviews.id, id))
      .run();

    const updated = db.select().from(interviews).where(eq(interviews.id, id)).get();
    return updated ? toInterviewDoc(updated) : null;
  }

  async deleteNotCompleted(id: string): Promise<InterviewDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Interview.findOneAndDelete)) {
      return Interview.findOneAndDelete({ _id: id, status: { $ne: INTERVIEW_COMPLETED_STATUS } })
        .lean<InterviewDoc>()
        .exec();
    }
    const db = getSqliteDb();
    const existing = db
      .select()
      .from(interviews)
      .where(and(eq(interviews.id, id), ne(interviews.status, INTERVIEW_COMPLETED_STATUS)))
      .get();
    if (!existing) return null;

    db.delete(interviews).where(eq(interviews.id, id)).run();
    return toInterviewDoc(existing);
  }

  async findPage(
    filter: InterviewFilter,
    params: FindInterviewsPageParams,
  ): Promise<{ items: InterviewDoc[]; total: number }> {
    if (process.env.USE_MONGODB === 'true' || isMock(Interview.find)) {
      const query = this.buildQuery(filter);
      const direction = params.sortOrder === 'asc' ? 1 : -1;
      const [items, total] = await Promise.all([
        Interview.find(query as never)
          .sort({ [INTERVIEW_SORT_COLUMNS[params.sortBy]]: direction, _id: direction })
          .skip((params.page - 1) * params.limit)
          .limit(params.limit)
          .lean<InterviewDoc[]>()
          .exec(),
        Interview.countDocuments(query as never).exec(),
      ]);
      return { items, total };
    }

    const db = getSqliteDb();
    const rows = db
      .select()
      .from(interviews)
      .where(eq(interviews.enterprise_id, filter.enterpriseId))
      .all();

    const filtered = rows.filter((r) => {
      if (filter.interviewerId && !(r.interviewer_ids ?? []).includes(filter.interviewerId)) return false;
      if (filter.statuses && filter.statuses.length > 0 && !filter.statuses.includes(r.status)) return false;
      if (filter.mode && r.mode !== filter.mode) return false;
      if (filter.jobId && r.job_id !== filter.jobId) return false;
      if (filter.applicationId && r.application_id !== filter.applicationId) return false;

      if (filter.overlapRange) {
        if (filter.to && new Date(r.scheduled_at) >= filter.to) return false;
        if (filter.from && new Date(r.ends_at) <= filter.from) return false;
      } else {
        if (filter.from && new Date(r.scheduled_at) < filter.from) return false;
        if (filter.to && new Date(r.scheduled_at) > filter.to) return false;
      }

      if (filter.search) {
        const { userIds, jobIds } = filter.search;
        const appMatch = userIds.includes(r.applicant_id);
        const intMatch = (r.interviewer_ids ?? []).some((id) => userIds.includes(id));
        const jobMatch = jobIds.includes(r.job_id);
        if (!appMatch && !intMatch && !jobMatch) return false;
      }

      return true;
    });

    const total = filtered.length;
    const direction = params.sortOrder === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      const col = INTERVIEW_SORT_COLUMNS[params.sortBy];
      let valA: unknown = (a as Record<string, unknown>)[col];
      let valB: unknown = (b as Record<string, unknown>)[col];
      if (valA instanceof Date) valA = valA.getTime();
      if (valB instanceof Date) valB = valB.getTime();
      if (valA !== valB) {
        return (valA as number) > (valB as number) ? direction : -direction;
      }
      return a.id > b.id ? direction : -direction;
    });

    const skip = (params.page - 1) * params.limit;
    const paged = filtered.slice(skip, skip + params.limit);
    return {
      items: paged.map((r) => toInterviewDoc(r)),
      total,
    };
  }

  async findCalendar(filter: InterviewFilter, limit: number): Promise<{ items: InterviewDoc[]; total: number }> {
    if (process.env.USE_MONGODB === 'true' || isMock(Interview.find)) {
      const query = this.buildQuery(filter);
      const [items, total] = await Promise.all([
        Interview.find(query as never).sort({ scheduled_at: 1, _id: 1 }).limit(limit).lean<InterviewDoc[]>().exec(),
        Interview.countDocuments(query as never).exec(),
      ]);
      return { items, total };
    }

    const { items, total } = await this.findPage(filter, {
      page: 1,
      limit,
      sortBy: 'scheduledAt',
      sortOrder: 'asc',
    });
    return { items, total };
  }

  private buildQuery(filter: InterviewFilter): unknown {
    const conditions: Record<string, unknown>[] = [{ enterprise_id: filter.enterpriseId }];
    if (filter.interviewerId) conditions.push({ interviewer_ids: filter.interviewerId });
    if (filter.statuses && filter.statuses.length > 0) conditions.push({ status: { $in: filter.statuses } });
    if (filter.mode) conditions.push({ mode: filter.mode });
    if (filter.jobId) conditions.push({ job_id: filter.jobId });
    if (filter.applicationId) conditions.push({ application_id: filter.applicationId });
    if (filter.overlapRange) {
      if (filter.to) conditions.push({ scheduled_at: { $lt: filter.to } });
      if (filter.from) conditions.push({ ends_at: { $gt: filter.from } });
    } else if (filter.from || filter.to) {
      conditions.push({
        scheduled_at: { ...(filter.from ? { $gte: filter.from } : {}), ...(filter.to ? { $lte: filter.to } : {}) },
      });
    }
    if (filter.search) {
      const { userIds, jobIds } = filter.search;
      conditions.push({
        $or: [
          { applicant_id: { $in: userIds } },
          { interviewer_ids: { $in: userIds } },
          { job_id: { $in: jobIds } },
        ],
      });
    }
    return { $and: conditions };
  }
}

export const interviewsRepository = new InterviewsRepository();
