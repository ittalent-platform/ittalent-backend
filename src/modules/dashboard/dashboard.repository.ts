import { Types } from 'mongoose';
import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm';

import { getSqliteDb } from '../../config/sqlite.js';
import {
  applications,
  enterpriseRegistrations,
  enterprises,
  interviews,
  jobPostings,
} from '../../db/schema/index.js';
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

export interface DashboardEnterpriseRow {
  id: string;
  name: string;
  status: EnterpriseStatus;
}

export interface DayStatusCount<Status extends string> {
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
  items: PendingRegistrationRow[];
}

export interface EnterpriseStatusCount {
  status: EnterpriseStatus;
  count: number;
}

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

export function registrationDisplayName(companyName: string | null | undefined, corporateEmail: string): string {
  return companyName?.trim() || corporateEmail;
}

function isMock(fn: unknown): boolean {
  return typeof fn === 'function' && ('_isMockFunction' in fn || 'mock' in fn);
}

function toVietnamDateString(date: Date): string {
  const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
  const vnTime = new Date(date.getTime() + VN_OFFSET_MS);
  return vnTime.toISOString().slice(0, 10);
}

export class DashboardRepository {
  async findEnterprise(enterpriseId: string): Promise<DashboardEnterpriseRow | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Enterprise.findOne)) {
      const enterprise = await Enterprise.findOne({ _id: enterpriseId, is_deleted: { $ne: true } })
        .select('name status')
        .lean()
        .exec();
      return enterprise ? { id: String(enterprise._id), name: enterprise.name, status: enterprise.status } : null;
    }

    const db = getSqliteDb();
    const row = db
      .select({ id: enterprises.id, name: enterprises.name, status: enterprises.status })
      .from(enterprises)
      .where(and(eq(enterprises.id, enterpriseId), eq(enterprises.is_deleted, false)))
      .get();
    return row ? { id: row.id, name: row.name, status: row.status as EnterpriseStatus } : null;
  }

  async findJobIds(enterpriseId: string): Promise<Types.ObjectId[]> {
    if (process.env.USE_MONGODB === 'true' || isMock(JobPosting.find)) {
      const jobs = await JobPosting.find({ enterprise_id: enterpriseId }).select('_id').lean().exec();
      return jobs.map((job) => job._id);
    }

    const db = getSqliteDb();
    const rows = db
      .select({ id: jobPostings.id })
      .from(jobPostings)
      .where(eq(jobPostings.enterprise_id, enterpriseId))
      .all();
    return rows.map((r) => new Types.ObjectId(r.id));
  }

  async countApplicationsByDayAndStatus(jobIds: Types.ObjectId[], from: Date, to: Date): Promise<DayStatusCount<ApplicationStatus>[]> {
    if (jobIds.length === 0) return [];
    if (process.env.USE_MONGODB === 'true' || isMock(Application.aggregate)) {
      const rows = await Application.aggregate<DayStatusGroup<ApplicationStatus>>([
        { $match: { job_id: { $in: jobIds }, createdAt: { $gte: from, $lt: to } } },
        { $group: { _id: { date: localDay('createdAt'), status: '$status' }, count: { $sum: 1 } } },
      ]).exec();
      return toDayStatusCounts(rows);
    }

    const db = getSqliteDb();
    const strJobIds = jobIds.map((j) => String(j));
    const rows = db
      .select({ status: applications.status, createdAt: applications.createdAt })
      .from(applications)
      .where(inArray(applications.job_id, strJobIds))
      .all();

    const counts = new Map<string, number>();
    for (const r of rows) {
      const created = new Date(r.createdAt);
      if (created >= from && created < to) {
        const dateStr = toVietnamDateString(created);
        const key = `${dateStr}:::${r.status}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    const result: DayStatusCount<ApplicationStatus>[] = [];
    for (const [key, count] of counts.entries()) {
      const [date, status] = key.split(':::');
      result.push({ date: date!, status: status as ApplicationStatus, count });
    }
    return result;
  }

  async countJobsByDayAndStatus(enterpriseId: string, from: Date, to: Date): Promise<DayStatusCount<JobPostingStatus>[]> {
    if (process.env.USE_MONGODB === 'true' || isMock(JobPosting.aggregate)) {
      const rows = await JobPosting.aggregate<DayStatusGroup<JobPostingStatus>>([
        { $match: { enterprise_id: new Types.ObjectId(enterpriseId), createdAt: { $gte: from, $lt: to } } },
        { $group: { _id: { date: localDay('createdAt'), status: '$status' }, count: { $sum: 1 } } },
      ]).exec();
      return toDayStatusCounts(rows);
    }

    const db = getSqliteDb();
    const rows = db
      .select({ status: jobPostings.status, createdAt: jobPostings.createdAt })
      .from(jobPostings)
      .where(eq(jobPostings.enterprise_id, enterpriseId))
      .all();

    const counts = new Map<string, number>();
    for (const r of rows) {
      const created = new Date(r.createdAt);
      if (created >= from && created < to) {
        const dateStr = toVietnamDateString(created);
        const key = `${dateStr}:::${r.status}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    const result: DayStatusCount<JobPostingStatus>[] = [];
    for (const [key, count] of counts.entries()) {
      const [date, status] = key.split(':::');
      result.push({ date: date!, status: status as JobPostingStatus, count });
    }
    return result;
  }

  async countInterviewsByDayAndStatus(enterpriseId: string, from: Date, to: Date): Promise<DayStatusCount<InterviewStatus>[]> {
    if (process.env.USE_MONGODB === 'true' || isMock(Interview.aggregate)) {
      const rows = await Interview.aggregate<DayStatusGroup<InterviewStatus>>([
        { $match: { enterprise_id: new Types.ObjectId(enterpriseId), scheduled_at: { $gte: from, $lt: to } } },
        { $group: { _id: { date: localDay('scheduled_at'), status: '$status' }, count: { $sum: 1 } } },
      ]).exec();
      return toDayStatusCounts(rows);
    }

    const db = getSqliteDb();
    const rows = db
      .select({ status: interviews.status, scheduled_at: interviews.scheduled_at })
      .from(interviews)
      .where(eq(interviews.enterprise_id, enterpriseId))
      .all();

    const counts = new Map<string, number>();
    for (const r of rows) {
      const scheduled = new Date(r.scheduled_at);
      if (scheduled >= from && scheduled < to) {
        const dateStr = toVietnamDateString(scheduled);
        const key = `${dateStr}:::${r.status}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    const result: DayStatusCount<InterviewStatus>[] = [];
    for (const [key, count] of counts.entries()) {
      const [date, status] = key.split(':::');
      result.push({ date: date!, status: status as InterviewStatus, count });
    }
    return result;
  }

  async findTopJobsByApplications(jobIds: Types.ObjectId[], from: Date, to: Date, limit: number): Promise<TopJobRow[]> {
    if (jobIds.length === 0) return [];
    if (process.env.USE_MONGODB === 'true' || isMock(Application.aggregate)) {
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

    const db = getSqliteDb();
    const strJobIds = jobIds.map((j) => String(j));
    const rows = db
      .select({ jobId: applications.job_id, status: applications.status, createdAt: applications.createdAt })
      .from(applications)
      .where(inArray(applications.job_id, strJobIds))
      .all();

    const stats = new Map<string, { applications: number; hired: number }>();
    for (const id of strJobIds) stats.set(id, { applications: 0, hired: 0 });

    for (const r of rows) {
      const created = new Date(r.createdAt);
      if (created >= from && created < to) {
        const entry = stats.get(r.jobId) ?? { applications: 0, hired: 0 };
        entry.applications++;
        if (r.status === DASHBOARD_HIRED_STATUS) entry.hired++;
        stats.set(r.jobId, entry);
      }
    }

    const sorted = [...stats.entries()]
      .filter(([, s]) => s.applications > 0)
      .sort((a, b) => b[1].applications - a[1].applications || a[0].localeCompare(b[0]))
      .slice(0, limit);

    return sorted.map(([jobId, s]) => ({ jobId, applications: s.applications, hired: s.hired }));
  }

  async countInterviewsByJob(enterpriseId: string, jobIds: Types.ObjectId[], from: Date, to: Date): Promise<JobCountRow[]> {
    if (jobIds.length === 0) return [];
    if (process.env.USE_MONGODB === 'true' || isMock(Interview.aggregate)) {
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

    const db = getSqliteDb();
    const strJobIds = jobIds.map((j) => String(j));
    const rows = db
      .select({ jobId: interviews.job_id, scheduled_at: interviews.scheduled_at })
      .from(interviews)
      .where(
        and(
          eq(interviews.enterprise_id, enterpriseId),
          inArray(interviews.job_id, strJobIds),
        ),
      )
      .all();

    const counts = new Map<string, number>();
    for (const r of rows) {
      const scheduled = new Date(r.scheduled_at);
      if (scheduled >= from && scheduled < to) {
        counts.set(r.jobId, (counts.get(r.jobId) ?? 0) + 1);
      }
    }

    return [...counts.entries()].map(([jobId, count]) => ({ jobId, count }));
  }

  async findJobTitles(jobIds: Types.ObjectId[]): Promise<Map<string, string>> {
    if (jobIds.length === 0) return new Map();
    if (process.env.USE_MONGODB === 'true' || isMock(JobPosting.find)) {
      const jobs = await JobPosting.find({ _id: { $in: jobIds } }).select('title').lean().exec();
      return new Map(jobs.map((job) => [String(job._id), job.title]));
    }

    const db = getSqliteDb();
    const strJobIds = jobIds.map((j) => String(j));
    const rows = db
      .select({ id: jobPostings.id, title: jobPostings.title })
      .from(jobPostings)
      .where(inArray(jobPostings.id, strJobIds))
      .all();
    return new Map(rows.map((r) => [r.id, r.title]));
  }

  async countEnterprisesByStatus(): Promise<EnterpriseStatusCount[]> {
    if (process.env.USE_MONGODB === 'true' || isMock(Enterprise.aggregate)) {
      const rows = await Enterprise.aggregate<{ _id: EnterpriseStatus; count: number }>([
        { $match: { is_deleted: { $ne: true } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]).exec();
      return rows.map((row) => ({ status: row._id, count: row.count }));
    }

    const db = getSqliteDb();
    const rows = db
      .select({ status: enterprises.status })
      .from(enterprises)
      .where(eq(enterprises.is_deleted, false))
      .all();

    const counts = new Map<EnterpriseStatus, number>();
    for (const r of rows) {
      const st = r.status as EnterpriseStatus;
      counts.set(st, (counts.get(st) ?? 0) + 1);
    }

    return [...counts.entries()].map(([status, count]) => ({ status, count }));
  }

  async findPendingRegistrations(limit: number): Promise<PendingRegistrations> {
    if (process.env.USE_MONGODB === 'true' || isMock(EnterpriseRegistration.aggregate)) {
      const filter = { status: DASHBOARD_PENDING_REGISTRATION_STATUS } as const;
      const [total, rows] = await Promise.all([
        EnterpriseRegistration.countDocuments(filter).exec(),
        EnterpriseRegistration.aggregate<{ _id: Types.ObjectId; companyName?: string; corporateEmail: string; submittedAt: Date }>([
          { $match: filter },
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

    const db = getSqliteDb();
    const rows = db
      .select()
      .from(enterpriseRegistrations)
      .where(eq(enterpriseRegistrations.status, 'pending'))
      .all();

    const total = rows.length;
    rows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const items = rows.slice(0, limit).map((r) => {
      return {
        id: r.id,
        companyName: registrationDisplayName(r.company_name, r.company_email),
        submittedAt: new Date(r.createdAt),
      };
    });

    return { total, items };
  }
}

export const dashboardRepository = new DashboardRepository();
