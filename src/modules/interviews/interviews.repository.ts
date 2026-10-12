import type { Types } from 'mongoose';

import { Application, type ApplicationDoc } from '../../models/application.model.js';
import { Enterprise } from '../../models/enterprise.model.js';
import {
  Interview,
  type InterviewData,
  type InterviewDoc,
  type InterviewMode,
} from '../../models/interview.model.js';
import { JobPosting } from '../../models/job-posting.model.js';
import {
  INTERVIEW_EDITABLE_STATUS,
  INTERVIEW_COMPLETED_STATUS,
  INTERVIEW_INITIAL_STATUS,
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

export interface InterviewConflictParams {
  interviewerIds: string[];
  applicantId: string;
  startsAt: Date;
  endsAt: Date;
  excludeId?: string | undefined;
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

  // Deletes unless the interview was completed meanwhile; returns the deleted record.
  async deleteNotCompleted(id: string): Promise<InterviewDoc | null> {
    return Interview.findOneAndDelete({ _id: id, status: { $ne: INTERVIEW_COMPLETED_STATUS } })
      .lean<InterviewDoc>()
      .exec();
  }

}

export const interviewsRepository = new InterviewsRepository();
