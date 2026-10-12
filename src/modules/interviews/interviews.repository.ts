import { Types, type QueryFilter } from 'mongoose';

import { Application, type ApplicationDoc } from '../../models/application.model.js';
import { Enterprise } from '../../models/enterprise.model.js';
import {
  Interview,
  type InterviewData,
  type InterviewDoc,
  type InterviewMode,
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

// Narrow read models: this module only reads these entities (the "shared models" the architecture allows)
// and never writes to them. People are read through UsersService, never through the User model.
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

// Only the fields that are present are written; `null` clears an optional field.
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
  // Set for an interviewer, who only sees the interviews they are assigned to.
  interviewerId?: string | undefined;
  statuses?: InterviewStatus[] | undefined;
  mode?: InterviewMode | undefined;
  jobId?: string | undefined;
  applicationId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  // false (list): the start time lies inside [from, to]. true (calendar): the interview overlaps [from, to].
  overlapRange?: boolean | undefined;
  // Already resolved from the keyword; an empty pair matches nothing.
  search?: { userIds: string[]; jobIds: string[] } | undefined;
}

export interface FindInterviewsPageParams {
  page: number;
  limit: number;
  sortBy: InterviewSortField;
  sortOrder: InterviewSortOrder;
}

export interface InterviewConflictParams {
  interviewerIds: string[];
  applicantId: string;
  startsAt: Date;
  endsAt: Date;
  excludeId?: string | undefined;
}

const ASCENDING = 1;
const DESCENDING = -1;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class InterviewsRepository {
  // ---- reads of other entities ----

  async findApplicationContext(applicationId: string): Promise<InterviewApplicationContext | null> {
    const application = await Application.findById(applicationId).lean<ApplicationDoc>().exec();
    if (!application) {
      return null;
    }
    const job = await JobPosting.findById(application.job_id, { enterprise_id: 1, title: 1 })
      .lean<InterviewJobRow>()
      .exec();
    return job ? { application, job } : null;
  }

  async findJobTitles(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }
    const jobs = await JobPosting.find({ _id: { $in: ids } }, { title: 1 }).lean<{ _id: Types.ObjectId; title: string }[]>().exec();
    return new Map(jobs.map((job) => [String(job._id), job.title]));
  }

  async findEnterpriseName(enterpriseId: string): Promise<string | null> {
    const enterprise = await Enterprise.findById(enterpriseId, { name: 1 }).lean<{ name: string }>().exec();
    return enterprise?.name ?? null;
  }

  // The enterprise's jobs whose title contains the keyword (plain text, not a pattern). Capped, so a very short
  // keyword on a large number of jobs can miss some matches.
  async findJobIdsByTitle(enterpriseId: string, keyword: string): Promise<string[]> {
    const jobs = await JobPosting.find({ enterprise_id: enterpriseId, title: new RegExp(escapeRegExp(keyword), 'i') }, { _id: 1 })
      .limit(INTERVIEW_CONFIG.SEARCH_MATCH_LIMIT)
      .lean<{ _id: Types.ObjectId }[]>()
      .exec();
    return jobs.map((job) => String(job._id));
  }

  // ---- interviews ----

  // An active interview that overlaps the window and involves one of the interviewers or the applicant.
  // Two requests racing past this check can still both save: Mongo has no overlap constraint.
  async findConflict(params: InterviewConflictParams): Promise<InterviewDoc | null> {
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

  async create(record: CreateInterviewRecord): Promise<InterviewDoc> {
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

  async findById(id: string): Promise<InterviewDoc | null> {
    return Interview.findById(id).lean<InterviewDoc>().exec();
  }

  // Applies the change only while the interview is still scheduled; null means it changed (or vanished) meanwhile.
  async updateScheduled(id: string, update: UpdateInterviewRecord): Promise<InterviewDoc | null> {
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

  // Atomic scheduled -> status change that also appends the history entry; null means it is no longer scheduled.
  // `endedBefore` re-checks "the interview has ended" in the same write, so an interview that was just moved to a
  // later time cannot be completed.
  async transitionFromScheduled(
    id: string,
    status: InterviewStatus,
    changedBy: string,
    options: { note?: string | undefined; endedBefore?: Date | undefined } = {},
  ): Promise<InterviewDoc | null> {
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

  // Deletes unless the interview was completed meanwhile; returns the deleted record.
  async deleteNotCompleted(id: string): Promise<InterviewDoc | null> {
    return Interview.findOneAndDelete({ _id: id, status: { $ne: INTERVIEW_COMPLETED_STATUS } })
      .lean<InterviewDoc>()
      .exec();
  }

  async findPage(
    filter: InterviewFilter,
    params: FindInterviewsPageParams,
  ): Promise<{ items: InterviewDoc[]; total: number }> {
    const query = this.buildQuery(filter);
    const direction = params.sortOrder === 'asc' ? ASCENDING : DESCENDING;
    const [items, total] = await Promise.all([
      Interview.find(query)
        // _id breaks ties so paging never repeats or skips a row.
        .sort({ [INTERVIEW_SORT_COLUMNS[params.sortBy]]: direction, _id: direction })
        .skip((params.page - 1) * params.limit)
        .limit(params.limit)
        .lean<InterviewDoc[]>()
        .exec(),
      Interview.countDocuments(query).exec(),
    ]);
    return { items, total };
  }

  // Everything in the window, earliest first, capped at `limit`; `total` is the uncapped match count.
  async findCalendar(filter: InterviewFilter, limit: number): Promise<{ items: InterviewDoc[]; total: number }> {
    const query = this.buildQuery(filter);
    const [items, total] = await Promise.all([
      Interview.find(query).sort({ scheduled_at: ASCENDING, _id: ASCENDING }).limit(limit).lean<InterviewDoc[]>().exec(),
      Interview.countDocuments(query).exec(),
    ]);
    return { items, total };
  }

  private buildQuery(filter: InterviewFilter): QueryFilter<InterviewData> {
    const conditions: QueryFilter<InterviewData>[] = [{ enterprise_id: filter.enterpriseId }];

    if (filter.interviewerId) {
      conditions.push({ interviewer_ids: filter.interviewerId });
    }
    if (filter.statuses && filter.statuses.length > 0) {
      conditions.push({ status: { $in: filter.statuses } });
    }
    if (filter.mode) {
      conditions.push({ mode: filter.mode });
    }
    if (filter.jobId) {
      conditions.push({ job_id: filter.jobId });
    }
    if (filter.applicationId) {
      conditions.push({ application_id: filter.applicationId });
    }
    if (filter.overlapRange) {
      if (filter.to) {
        conditions.push({ scheduled_at: { $lt: filter.to } });
      }
      if (filter.from) {
        conditions.push({ ends_at: { $gt: filter.from } });
      }
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
