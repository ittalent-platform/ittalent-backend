import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { usersService, type UsersService } from '../users/users.service.js';
import {
  DASHBOARD_ACCOUNT_ROLES,
  DASHBOARD_ACTIVE_ENTERPRISE_STATUS,
  DASHBOARD_APPLICATION_STATUS_KEYS,
  DASHBOARD_CANDIDATE_ROLES,
  DASHBOARD_COMPANY_ROLES,
  DASHBOARD_CONFIG,
  DASHBOARD_DEFAULT_RANGE,
  DASHBOARD_DEFAULT_USER_STATUS,
  DASHBOARD_ENTERPRISE_ADMIN_ROLE,
  DASHBOARD_ERROR_CODES,
  DASHBOARD_HR_ROLE,
  DASHBOARD_INTERVIEW_STATUS_KEYS,
  DASHBOARD_MESSAGES,
  DASHBOARD_PLATFORM_ROLE,
  DASHBOARD_PRESET_DAYS,
  DASHBOARD_SUSPENDED_ENTERPRISE_STATUS,
  DASHBOARD_SUSPENDED_USER_STATUSES,
  DASHBOARD_TIME_ZONE,
  DASHBOARD_UTC_OFFSET_HOURS,
} from './dashboard.constants.js';
import { dashboardRepository, type DashboardRepository } from './dashboard.repository.js';
import type {
  CompanyDashboardQuery,
  CompanyDashboardResponse,
  DashboardPeriod,
  DashboardWeek,
  PlatformOverviewResponse,
} from './dashboard.schemas.js';

export interface DashboardActor {
  id: string;
  role: string;
}

const OFFSET_MS = DASHBOARD_UTC_OFFSET_HOURS * DASHBOARD_CONFIG.MS_PER_HOUR;

// ---- calendar days in Vietnam time, written `YYYY-MM-DD` ----
// `Date.parse('YYYY-MM-DD')` is midnight UTC, which makes plain day arithmetic exact because every day has 24 hours.

/** The Vietnam-time calendar day an instant falls on. */
export function toLocalDate(instant: Date): string {
  return new Date(instant.getTime() + OFFSET_MS).toISOString().slice(0, DASHBOARD_CONFIG.ISO_DATE_LENGTH);
}

/** The first instant of a Vietnam-time calendar day. */
export function startOfLocalDay(date: string): Date {
  return new Date(Date.parse(date) - OFFSET_MS);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * DASHBOARD_CONFIG.MS_PER_DAY).toISOString().slice(0, DASHBOARD_CONFIG.ISO_DATE_LENGTH);
}

/** Whole days from one calendar day to another (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DASHBOARD_CONFIG.MS_PER_DAY);
}

function enumerateDays(from: string, to: string): string[] {
  const count = daysBetween(from, to) + 1;
  return Array.from({ length: count }, (_unused, index) => addDays(from, index));
}

// The dashboard's weeks start on Monday, the way a Vietnamese calendar does.
function mondayOf(date: string): string {
  const weekday = new Date(Date.parse(date)).getUTCDay();
  return addDays(date, -((weekday + DASHBOARD_CONFIG.DAYS_IN_WEEK - 1) % DASHBOARD_CONFIG.DAYS_IN_WEEK));
}

function round(value: number, factor: number): number {
  return Math.round(value * factor) / factor;
}

function sumDays(counts: ReadonlyMap<string, number>, days: readonly string[]): number {
  return days.reduce((total, day) => total + (counts.get(day) ?? 0), 0);
}

function addCount(counts: Map<string, number>, day: string, count: number): void {
  counts.set(day, (counts.get(day) ?? 0) + count);
}

/**
 * The period a query asks for, as whole days. Presets end yesterday because today is not over yet, so every
 * number covers complete days; a custom range is used as given, even when it reaches into the future.
 */
export function resolvePeriod(query: CompanyDashboardQuery, now: Date): DashboardPeriod {
  const today = toLocalDate(now);
  const yesterday = addDays(today, -1);
  let from: string;
  let to: string;

  if (query.range === 'custom') {
    if (!query.from || !query.to) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, DASHBOARD_MESSAGES.CUSTOM_RANGE_NEEDS_DATES);
    }
    from = query.from;
    to = query.to;
  } else if (query.range === 'this_month') {
    from = `${today.slice(0, DASHBOARD_CONFIG.ISO_MONTH_LENGTH)}-01`;
    // On the first day of the month there is no finished day yet, so the period is that day so far.
    to = yesterday >= from ? yesterday : today;
  } else {
    const presetDays = DASHBOARD_PRESET_DAYS[query.range] ?? DASHBOARD_PRESET_DAYS[DASHBOARD_DEFAULT_RANGE] ?? 1;
    to = yesterday;
    from = addDays(yesterday, -(presetDays - 1));
  }

  return { range: query.range, from, to, days: daysBetween(from, to) + 1 };
}

export class DashboardService {
  constructor(
    private readonly repository: DashboardRepository = dashboardRepository,
    private readonly users: UsersService = usersService,
    // Injected so the periods and the "days waiting" can be tested without a clock.
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** HR and enterprise admin: the numbers of their own company for one period. */
  async getCompanyDashboard(actor: DashboardActor, query: CompanyDashboardQuery): Promise<CompanyDashboardResponse> {
    if (!DASHBOARD_COMPANY_ROLES.some((role) => role === actor.role)) {
      throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, DASHBOARD_MESSAGES.COMPANY_ROLES_ONLY);
    }
    // The company always comes from the account, never from the request, so nobody can read another company's numbers.
    const enterpriseId = await this.users.getEnterpriseId(actor.id);
    if (!enterpriseId) {
      throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, DASHBOARD_MESSAGES.NOT_A_MEMBER, DASHBOARD_ERROR_CODES.NOT_A_MEMBER);
    }
    const enterprise = await this.repository.findEnterprise(enterpriseId);
    if (!enterprise || enterprise.status !== DASHBOARD_ACTIVE_ENTERPRISE_STATUS) {
      throw createHttpError(
        HTTP_STATUS.HTTP_403_FORBIDDEN,
        DASHBOARD_MESSAGES.COMPANY_NOT_ACTIVE,
        DASHBOARD_ERROR_CODES.COMPANY_NOT_ACTIVE,
      );
    }

    const asOf = this.now();
    const period = resolvePeriod(query, asOf);
    const from = startOfLocalDay(period.from);
    const to = startOfLocalDay(addDays(period.to, 1));

    const jobIds = await this.repository.findJobIds(enterpriseId);
    // Every widget is derived from these same rows, so no widget can disagree with another.
    const [applications, jobs, interviews, topJobs] = await Promise.all([
      this.repository.countApplicationsByDayAndStatus(jobIds, from, to),
      this.repository.countJobsByDayAndStatus(enterpriseId, from, to),
      this.repository.countInterviewsByDayAndStatus(enterpriseId, from, to),
      this.repository.findTopJobsByApplications(jobIds, from, to, DASHBOARD_CONFIG.TOP_JOBS_LIMIT),
    ]);
    const topJobIds = jobIds.filter((id) => topJobs.some((job) => job.jobId === String(id)));
    const [titles, interviewCounts] = await Promise.all([
      this.repository.findJobTitles(topJobIds),
      this.repository.countInterviewsByJob(enterpriseId, topJobIds, from, to),
    ]);

    const days = enumerateDays(period.from, period.to);
    const applicationsByDay = new Map<string, number>();
    const hiredByDay = new Map<string, number>();
    const jobsByDay = new Map<string, number>();
    const interviewsByDay = new Map<string, number>();
    const applicationStatuses = {
      submitted: 0,
      underReview: 0,
      interviewing: 0,
      offered: 0,
      hired: 0,
      rejected: 0,
      withdrawn: 0,
      positionFilled: 0,
    };
    const interviewStatuses = { scheduled: 0, rescheduleRequested: 0, completed: 0, noShow: 0, cancelled: 0 };
    const jobStatuses = { published: 0, closed: 0, draft: 0, archived: 0 };

    for (const row of applications) {
      const key = DASHBOARD_APPLICATION_STATUS_KEYS[row.status];
      applicationStatuses[key] += row.count;
      addCount(applicationsByDay, row.date, row.count);
      if (row.status === 'hired') addCount(hiredByDay, row.date, row.count);
    }
    for (const row of interviews) {
      interviewStatuses[DASHBOARD_INTERVIEW_STATUS_KEYS[row.status]] += row.count;
      addCount(interviewsByDay, row.date, row.count);
    }
    for (const row of jobs) {
      jobStatuses[row.status] += row.count;
      addCount(jobsByDay, row.date, row.count);
    }

    const weeks = this.groupWeeks(days, { applicationsByDay, jobsByDay, interviewsByDay, hiredByDay });
    const fullWeeks = weeks.filter((week) => week.days === DASHBOARD_CONFIG.WEEK_DAYS);
    const applicationsReceived = sumDays(applicationsByDay, days);
    const hired = applicationStatuses.hired;
    const interviewCountsByJob = new Map(interviewCounts.map((row) => [row.jobId, row.count]));

    return {
      asOf: asOf.toISOString(),
      timeZone: DASHBOARD_TIME_ZONE,
      company: { id: enterprise.id, name: enterprise.name },
      period,
      summary: {
        jobsPosted: sumDays(jobsByDay, days),
        jobsOpen: jobStatuses.published,
        applicationsReceived,
        averageApplicationsPerDay: round(applicationsReceived / period.days, DASHBOARD_CONFIG.ONE_DECIMAL),
        interviews: sumDays(interviewsByDay, days),
        interviewsCompleted: interviewStatuses.completed,
        hired,
        hiredPercent:
          applicationsReceived > 0
            ? round((hired / applicationsReceived) * DASHBOARD_CONFIG.PERCENT, DASHBOARD_CONFIG.ONE_DECIMAL)
            : null,
      },
      weeks,
      // A partial last week would drag the average down, so only whole weeks count.
      weeklyAverageApplications:
        fullWeeks.length > 0
          ? round(fullWeeks.reduce((total, week) => total + week.applications, 0) / fullWeeks.length, DASHBOARD_CONFIG.TWO_DECIMALS)
          : null,
      applicationStatuses,
      interviewDays: days.map((date) => ({ date, count: interviewsByDay.get(date) ?? 0 })),
      interviewStatuses,
      jobStatuses,
      topJobs: topJobs.flatMap((job) => {
        const title = titles.get(job.jobId);
        return title === undefined
          ? []
          : [{ id: job.jobId, title, applications: job.applications, interviews: interviewCountsByJob.get(job.jobId) ?? 0, hired: job.hired }];
      }),
    };
  }

  /** System admin: how big the platform is and what waits for a decision. Never any company's hiring data. */
  async getPlatformOverview(actor: DashboardActor): Promise<PlatformOverviewResponse> {
    if (actor.role !== DASHBOARD_PLATFORM_ROLE) {
      throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, DASHBOARD_MESSAGES.PLATFORM_ROLE_ONLY);
    }
    const asOf = this.now();
    const today = toLocalDate(asOf);
    const currentMonday = mondayOf(today);
    const weekStarts = Array.from({ length: DASHBOARD_CONFIG.NEW_ACCOUNTS_WEEKS }, (_unused, index) =>
      addDays(currentMonday, -(DASHBOARD_CONFIG.NEW_ACCOUNTS_WEEKS - 1 - index) * DASHBOARD_CONFIG.DAYS_IN_WEEK),
    );
    const windowStart = weekStarts[0] ?? currentMonday;

    const [accountRows, createdRows, enterpriseRows, pending] = await Promise.all([
      this.users.countAccountsByRoleAndStatus(DASHBOARD_ACCOUNT_ROLES),
      this.users.countAccountsCreatedPerDay(
        DASHBOARD_ACCOUNT_ROLES,
        startOfLocalDay(windowStart),
        startOfLocalDay(addDays(today, 1)),
        DASHBOARD_TIME_ZONE,
      ),
      this.repository.countEnterprisesByStatus(),
      this.repository.findPendingRegistrations(DASHBOARD_CONFIG.WAITING_LIST_LIMIT),
    ]);

    const createdByDay = new Map(createdRows.map((row) => [row.date, row.count]));
    const byRole = { candidates: 0, hr: 0, enterpriseAdmins: 0 };
    const byStatus = { active: 0, invited: 0, inactive: 0, suspended: 0 };
    for (const row of accountRows) {
      if (DASHBOARD_CANDIDATE_ROLES.some((role) => role === row.role)) byRole.candidates += row.count;
      else if (row.role === DASHBOARD_HR_ROLE) byRole.hr += row.count;
      else if (row.role === DASHBOARD_ENTERPRISE_ADMIN_ROLE) byRole.enterpriseAdmins += row.count;

      if (DASHBOARD_SUSPENDED_USER_STATUSES.some((status) => status === row.status)) byStatus.suspended += row.count;
      else if (row.status === 'invited') byStatus.invited += row.count;
      else if (row.status === 'inactive') byStatus.inactive += row.count;
      else if (row.status === DASHBOARD_DEFAULT_USER_STATUS) byStatus.active += row.count;
    }

    const companyCount = (status: string): number => enterpriseRows.find((row) => row.status === status)?.count ?? 0;
    const active = companyCount(DASHBOARD_ACTIVE_ENTERPRISE_STATUS);
    const suspended = companyCount(DASHBOARD_SUSPENDED_ENTERPRISE_STATUS);
    const waitingForReview = pending.items.map((item) => ({
      id: item.id,
      companyName: item.companyName,
      submittedAt: item.submittedAt.toISOString(),
      waitingDays: Math.max(0, daysBetween(toLocalDate(item.submittedAt), today)),
    }));
    const lastThirtyDaysStart = addDays(today, -(DASHBOARD_CONFIG.NEW_ACCOUNTS_WINDOW_DAYS - 1));

    return {
      asOf: asOf.toISOString(),
      timeZone: DASHBOARD_TIME_ZONE,
      accounts: {
        total: byRole.candidates + byRole.hr + byRole.enterpriseAdmins,
        newInLast30Days: enumerateDays(lastThirtyDaysStart, today).reduce((total, day) => total + (createdByDay.get(day) ?? 0), 0),
        byRole,
        byStatus,
        newPerWeek: weekStarts.map((from) => {
          const to = addDays(from, DASHBOARD_CONFIG.DAYS_IN_WEEK - 1);
          return { from, to, count: sumDays(createdByDay, enumerateDays(from, to)) };
        }),
      },
      companies: {
        active,
        suspended,
        approved: active + suspended,
        waitingForReview: pending.total,
        // The list is oldest first, so its first entry is the longest wait.
        oldestWaitingDays: waitingForReview[0]?.waitingDays ?? null,
      },
      waitingForReview,
    };
  }

  // Blocks of seven days from the first day of the period; the last one holds what is left.
  private groupWeeks(
    days: readonly string[],
    counts: { applicationsByDay: Map<string, number>; jobsByDay: Map<string, number>; interviewsByDay: Map<string, number>; hiredByDay: Map<string, number> },
  ): DashboardWeek[] {
    const weeks: DashboardWeek[] = [];
    for (let start = 0; start < days.length; start += DASHBOARD_CONFIG.WEEK_DAYS) {
      const block = days.slice(start, start + DASHBOARD_CONFIG.WEEK_DAYS);
      const from = block[0];
      const to = block[block.length - 1];
      if (from === undefined || to === undefined) continue;
      weeks.push({
        from,
        to,
        days: block.length,
        applications: sumDays(counts.applicationsByDay, block),
        jobsPosted: sumDays(counts.jobsByDay, block),
        interviews: sumDays(counts.interviewsByDay, block),
        hired: sumDays(counts.hiredByDay, block),
      });
    }
    return weeks;
  }
}

export const dashboardService = new DashboardService();
