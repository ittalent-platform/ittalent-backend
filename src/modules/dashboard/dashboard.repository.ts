import { Types } from 'mongoose';

import { Application, type ApplicationStatus } from '../../models/application.model.js';
import { Enterprise, type EnterpriseStatus } from '../../models/enterprise.model.js';
import { EnterpriseRegistration } from '../../models/enterprise-registration.model.js';
import { Interview, type InterviewStatus } from '../../models/interview.model.js';
import { JobPosting, type JobPostingStatus } from '../../models/job-posting.model.js';
import {
  DASHBOARD_DAY_FORMAT,
  DASHBOARD_HIRED_STATUS,
  DASHBOARD_PENDING_REGISTRATION_STATUS,
  DASHBOARD_TIME_ZONE,
} from './dashboard.constants.js';

// Narrow read models: the dashboard only counts these entities (the "shared models" the architecture allows)
// and never writes to them. People are counted through UsersService, never through the User model.
export interface DashboardEnterpriseRow {
  id: string;
  name: string;
  status: EnterpriseStatus;
}

export interface DayStatusCount<Status extends string> {
  /** Calendar day in Vietnam time, `YYYY-MM-DD`. */
  date: string;
  status: Status;
  count: number;
}

export interface TopJobRow {
  jobId: string;
  applications: number;
  hired: number;
}

export interface JobCountRow {
  jobId: string;
  count: number;
}

export interface PendingRegistrationRow {
  id: string;
  companyName: string;
  submittedAt: Date;
}

export interface PendingRegistrations {
  total: number;
  /** Oldest first. */
  items: PendingRegistrationRow[];
}

export interface EnterpriseStatusCount {
  status: EnterpriseStatus;
  count: number;
}

// Groups documents by the Vietnam-time calendar day of a date field, so a day never splits at UTC midnight.
function localDay(field: string): Record<string, unknown> {
  return { $dateToString: { format: DASHBOARD_DAY_FORMAT, date: `$${field}`, timezone: DASHBOARD_TIME_ZONE } };
}

interface DayStatusGroup<Status extends string> {
  _id: { date: string; status: Status };
  count: number;
}

function toDayStatusCounts<Status extends string>(rows: DayStatusGroup<Status>[]): DayStatusCount<Status>[] {
  return rows.map((row) => ({ date: row._id.date, status: row._id.status, count: row.count }));
}

/** A sign-up that has not named its company yet (missing or blank) is still identifiable by its corporate email. */
export function registrationDisplayName(companyName: string | null | undefined, corporateEmail: string): string {
  return companyName?.trim() || corporateEmail;
}

// Every period below is the half-open window [from, to): `from` is the first instant of the first day and
// `to` the first instant after the last day, so "to included" needs no end-of-day arithmetic.
export class DashboardRepository {
  async findEnterprise(enterpriseId: string): Promise<DashboardEnterpriseRow | null> {
    const enterprise = await Enterprise.findOne({ _id: enterpriseId, is_deleted: { $ne: true } })
      .select('name status')
      .lean()
      .exec();
    return enterprise ? { id: String(enterprise._id), name: enterprise.name, status: enterprise.status } : null;
  }

  /** Every job of the company; applications reach the company through their job. */
  async findJobIds(enterpriseId: string): Promise<Types.ObjectId[]> {
    const jobs = await JobPosting.find({ enterprise_id: enterpriseId }).select('_id').lean().exec();
    return jobs.map((job) => job._id);
  }

  /** Applications received in the period, per day and current status. */
  async countApplicationsByDayAndStatus(jobIds: Types.ObjectId[], from: Date, to: Date): Promise<DayStatusCount<ApplicationStatus>[]> {
    if (jobIds.length === 0) return [];
    const rows = await Application.aggregate<DayStatusGroup<ApplicationStatus>>([
      { $match: { job_id: { $in: jobIds }, createdAt: { $gte: from, $lt: to } } },
      { $group: { _id: { date: localDay('createdAt'), status: '$status' }, count: { $sum: 1 } } },
    ]).exec();
    return toDayStatusCounts(rows);
  }

  /** Jobs created in the period, per day and current status. */
  async countJobsByDayAndStatus(enterpriseId: string, from: Date, to: Date): Promise<DayStatusCount<JobPostingStatus>[]> {
    const rows = await JobPosting.aggregate<DayStatusGroup<JobPostingStatus>>([
      { $match: { enterprise_id: new Types.ObjectId(enterpriseId), createdAt: { $gte: from, $lt: to } } },
      { $group: { _id: { date: localDay('createdAt'), status: '$status' }, count: { $sum: 1 } } },
    ]).exec();
    return toDayStatusCounts(rows);
  }

  /** Interviews that start in the period, per day and current status. */
  async countInterviewsByDayAndStatus(enterpriseId: string, from: Date, to: Date): Promise<DayStatusCount<InterviewStatus>[]> {
    const rows = await Interview.aggregate<DayStatusGroup<InterviewStatus>>([
      { $match: { enterprise_id: new Types.ObjectId(enterpriseId), scheduled_at: { $gte: from, $lt: to } } },
      { $group: { _id: { date: localDay('scheduled_at'), status: '$status' }, count: { $sum: 1 } } },
    ]).exec();
    return toDayStatusCounts(rows);
  }

  /** The jobs that received the most applications in the period; equal counts keep a stable order. */
  async findTopJobsByApplications(jobIds: Types.ObjectId[], from: Date, to: Date, limit: number): Promise<TopJobRow[]> {
    if (jobIds.length === 0) return [];
    const rows = await Application.aggregate<{ _id: Types.ObjectId; applications: number; hired: number }>([
      { $match: { job_id: { $in: jobIds }, createdAt: { $gte: from, $lt: to } } },
      {
        $group: {
          _id: '$job_id',
          applications: { $sum: 1 },
          hired: { $sum: { $cond: [{ $eq: ['$status', DASHBOARD_HIRED_STATUS] }, 1, 0] } },
        },
      },
      { $sort: { applications: -1, _id: 1 } },
      { $limit: limit },
    ]).exec();
    return rows.map((row) => ({ jobId: String(row._id), applications: row.applications, hired: row.hired }));
  }

  /** Interviews that start in the period, for the given jobs. */
  async countInterviewsByJob(enterpriseId: string, jobIds: Types.ObjectId[], from: Date, to: Date): Promise<JobCountRow[]> {
    if (jobIds.length === 0) return [];
    const rows = await Interview.aggregate<{ _id: Types.ObjectId; count: number }>([
      {
        $match: {
          enterprise_id: new Types.ObjectId(enterpriseId),
          job_id: { $in: jobIds },
          scheduled_at: { $gte: from, $lt: to },
        },
      },
      { $group: { _id: '$job_id', count: { $sum: 1 } } },
    ]).exec();
    return rows.map((row) => ({ jobId: String(row._id), count: row.count }));
  }

  async findJobTitles(jobIds: Types.ObjectId[]): Promise<Map<string, string>> {
    if (jobIds.length === 0) return new Map();
    const jobs = await JobPosting.find({ _id: { $in: jobIds } }).select('title').lean().exec();
    return new Map(jobs.map((job) => [String(job._id), job.title]));
  }

  // ---- platform overview ----

  /** Companies that are not deleted, per status. */
  async countEnterprisesByStatus(): Promise<EnterpriseStatusCount[]> {
    const rows = await Enterprise.aggregate<{ _id: EnterpriseStatus; count: number }>([
      { $match: { is_deleted: { $ne: true } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).exec();
    return rows.map((row) => ({ status: row._id, count: row.count }));
  }

  /** Company sign-ups waiting for a decision, oldest submission first. */
  async findPendingRegistrations(limit: number): Promise<PendingRegistrations> {
    const filter = { status: DASHBOARD_PENDING_REGISTRATION_STATUS } as const;
    const [total, rows] = await Promise.all([
      EnterpriseRegistration.countDocuments(filter).exec(),
      EnterpriseRegistration.aggregate<{ _id: Types.ObjectId; companyName?: string; corporateEmail: string; submittedAt: Date }>([
        { $match: filter },
        // The submission time is when the claim was locked; the creation time covers records without one.
        { $addFields: { submittedAt: { $ifNull: ['$claim_locks.locked_at', '$createdAt'] } } },
        { $sort: { submittedAt: 1, _id: 1 } },
        { $limit: limit },
        { $project: { companyName: '$company_data.name', corporateEmail: '$corporate_email', submittedAt: 1 } },
      ]).exec(),
    ]);
    return {
      total,
      items: rows.map((row) => ({
        id: String(row._id),
        companyName: registrationDisplayName(row.companyName, row.corporateEmail),
        submittedAt: row.submittedAt,
      })),
    };
  }
}

export const dashboardRepository = new DashboardRepository();
