import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { DASHBOARD_ERROR_CODES, DASHBOARD_MESSAGES } from '../../../src/modules/dashboard/dashboard.constants.js';
import type { DashboardRepository } from '../../../src/modules/dashboard/dashboard.repository.js';
import type { CompanyDashboardQuery } from '../../../src/modules/dashboard/dashboard.schemas.js';
import {
  DashboardService,
  addDays,
  daysBetween,
  resolvePeriod,
  startOfLocalDay,
  toLocalDate,
  type DashboardActor,
} from '../../../src/modules/dashboard/dashboard.service.js';
import type { UsersService } from '../../../src/modules/users/users.service.js';

const ENTERPRISE = 'e00000000000000000000001';
const HR: DashboardActor = { id: 'a00000000000000000000001', role: 'recruiter' };
const ENTERPRISE_ADMIN: DashboardActor = { id: 'a00000000000000000000002', role: 'enterprise_admin' };
const SYSTEM_ADMIN: DashboardActor = { id: 'a00000000000000000000003', role: 'admin' };
const JOB_ONE = new Types.ObjectId('c00000000000000000000001');
const JOB_TWO = new Types.ObjectId('c00000000000000000000002');
const JOB_THREE = new Types.ObjectId('c00000000000000000000003');

// Sunday 11 Oct 2026, 10:42 in Ho Chi Minh City.
const NOW = new Date('2026-10-11T03:42:00.000Z');

const custom = (from: string, to: string): CompanyDashboardQuery => ({ range: 'custom', from, to });
const preset = (range: CompanyDashboardQuery['range']): CompanyDashboardQuery => ({ range });

describe('calendar helpers (Vietnam time)', () => {
  it('maps an instant to the local day, also around UTC midnight', () => {
    expect(toLocalDate(new Date('2026-10-11T03:42:00.000Z'))).toBe('2026-10-11');
    expect(toLocalDate(new Date('2026-10-10T16:59:59.999Z'))).toBe('2026-10-10');
    expect(toLocalDate(new Date('2026-10-10T17:00:00.000Z'))).toBe('2026-10-11');
  });

  it('starts a local day seven hours before UTC midnight', () => {
    expect(startOfLocalDay('2026-10-11').toISOString()).toBe('2026-10-10T17:00:00.000Z');
  });

  it('adds days across months and years, and counts them back', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(daysBetween('2026-09-11', '2026-10-10')).toBe(29);
    expect(daysBetween('2026-10-10', '2026-09-11')).toBe(-29);
  });
});

describe('resolvePeriod', () => {
  it('ends the presets yesterday, so every day in them is complete', () => {
    expect(resolvePeriod(preset('last_7_days'), NOW)).toEqual({ range: 'last_7_days', from: '2026-10-04', to: '2026-10-10', days: 7 });
    expect(resolvePeriod(preset('last_30_days'), NOW)).toEqual({ range: 'last_30_days', from: '2026-09-11', to: '2026-10-10', days: 30 });
    expect(resolvePeriod(preset('last_90_days'), NOW)).toEqual({ range: 'last_90_days', from: '2026-07-13', to: '2026-10-10', days: 90 });
    expect(resolvePeriod(preset('this_month'), NOW)).toEqual({ range: 'this_month', from: '2026-10-01', to: '2026-10-10', days: 10 });
  });

  it('follows the Vietnam day, not the UTC day', () => {
    // 17:30 UTC on 10 Oct is already 11 Oct 00:30 in Vietnam, so "yesterday" is still 10 Oct.
    expect(resolvePeriod(preset('last_7_days'), new Date('2026-10-10T17:30:00.000Z')).to).toBe('2026-10-10');
    // 16:30 UTC on 10 Oct is 23:30 on 10 Oct in Vietnam, so "yesterday" is 9 Oct.
    expect(resolvePeriod(preset('last_7_days'), new Date('2026-10-10T16:30:00.000Z')).to).toBe('2026-10-09');
  });

  it('uses the first day so far when the month has just started', () => {
    expect(resolvePeriod(preset('this_month'), new Date('2026-10-01T03:00:00.000Z'))).toEqual({
      range: 'this_month',
      from: '2026-10-01',
      to: '2026-10-01',
      days: 1,
    });
  });

  it('reaches back over a month and a year boundary', () => {
    expect(resolvePeriod(preset('last_7_days'), new Date('2027-01-03T03:00:00.000Z'))).toMatchObject({ from: '2026-12-27', to: '2027-01-02', days: 7 });
  });

  it('uses a custom range as given, including a future one', () => {
    expect(resolvePeriod(custom('2026-09-01', '2026-09-30'), NOW)).toEqual({ range: 'custom', from: '2026-09-01', to: '2026-09-30', days: 30 });
    expect(resolvePeriod(custom('2026-11-01', '2026-11-07'), NOW).days).toBe(7);
  });

  it('refuses a custom range without its dates', () => {
    expect(() => resolvePeriod({ range: 'custom' }, NOW)).toThrow(DASHBOARD_MESSAGES.CUSTOM_RANGE_NEEDS_DATES);
  });
});

interface Fixture {
  repository: { [Key in keyof DashboardRepository]: Mock };
  users: { getEnterpriseId: Mock; countAccountsByRoleAndStatus: Mock; countAccountsCreatedPerDay: Mock };
  service: DashboardService;
}

function fixture(): Fixture {
  const repository = {
    findEnterprise: vi.fn().mockResolvedValue({ id: ENTERPRISE, name: 'Nova Fintech', status: 'active' }),
    findJobIds: vi.fn().mockResolvedValue([JOB_ONE, JOB_TWO, JOB_THREE]),
    countApplicationsByDayAndStatus: vi.fn().mockResolvedValue([]),
    countJobsByDayAndStatus: vi.fn().mockResolvedValue([]),
    countInterviewsByDayAndStatus: vi.fn().mockResolvedValue([]),
    findTopJobsByApplications: vi.fn().mockResolvedValue([]),
    countInterviewsByJob: vi.fn().mockResolvedValue([]),
    findJobTitles: vi.fn().mockResolvedValue(new Map()),
    countEnterprisesByStatus: vi.fn().mockResolvedValue([]),
    findPendingRegistrations: vi.fn().mockResolvedValue({ total: 0, items: [] }),
  };
  const users = {
    getEnterpriseId: vi.fn().mockResolvedValue(ENTERPRISE),
    countAccountsByRoleAndStatus: vi.fn().mockResolvedValue([]),
    countAccountsCreatedPerDay: vi.fn().mockResolvedValue([]),
  };
  const service = new DashboardService(
    repository as unknown as DashboardRepository,
    users as unknown as UsersService,
    () => NOW,
  );
  return { repository, users, service };
}

async function failure(promise: Promise<unknown>): Promise<{ statusCode?: number; code?: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    return error as { statusCode?: number; code?: string; message: string };
  }
  throw new Error('Expected the call to fail');
}

describe('DashboardService.getCompanyDashboard', () => {
  let ctx: Fixture;
  beforeEach(() => {
    ctx = fixture();
  });

  describe('access', () => {
    it.each(['user', 'admin', 'applicant', 'guest'])('refuses the %s role', async (role) => {
      const error = await failure(ctx.service.getCompanyDashboard({ id: HR.id, role }, preset('last_30_days')));

      expect(error.statusCode).toBe(403);
      expect(error.message).toBe(DASHBOARD_MESSAGES.COMPANY_ROLES_ONLY);
      expect(ctx.repository.findJobIds).not.toHaveBeenCalled();
    });

    it('says the account is no longer a member when it has no company', async () => {
      ctx.users.getEnterpriseId.mockResolvedValue(null);

      const error = await failure(ctx.service.getCompanyDashboard(HR, preset('last_30_days')));

      expect(error.statusCode).toBe(403);
      expect(error.code).toBe(DASHBOARD_ERROR_CODES.NOT_A_MEMBER);
      expect(ctx.repository.countApplicationsByDayAndStatus).not.toHaveBeenCalled();
    });

    it.each(['suspended', 'pending', 'inactive', 'rejected'])('shows nothing while the company is %s', async (status) => {
      ctx.repository.findEnterprise.mockResolvedValue({ id: ENTERPRISE, name: 'Nova Fintech', status });

      const error = await failure(ctx.service.getCompanyDashboard(HR, preset('last_30_days')));

      expect(error.statusCode).toBe(403);
      expect(error.code).toBe(DASHBOARD_ERROR_CODES.COMPANY_NOT_ACTIVE);
      expect(ctx.repository.countApplicationsByDayAndStatus).not.toHaveBeenCalled();
    });

    it('treats a company that no longer exists as not active', async () => {
      ctx.repository.findEnterprise.mockResolvedValue(null);

      const error = await failure(ctx.service.getCompanyDashboard(HR, preset('last_30_days')));

      expect(error.code).toBe(DASHBOARD_ERROR_CODES.COMPANY_NOT_ACTIVE);
    });

    it.each([HR, ENTERPRISE_ADMIN])('lets $role in and reads only the company of the account', async (actor) => {
      await ctx.service.getCompanyDashboard(actor, preset('last_30_days'));

      expect(ctx.users.getEnterpriseId).toHaveBeenCalledWith(actor.id);
      expect(ctx.repository.findEnterprise).toHaveBeenCalledWith(ENTERPRISE);
      expect(ctx.repository.countJobsByDayAndStatus).toHaveBeenCalledWith(ENTERPRISE, expect.any(Date), expect.any(Date));
      expect(ctx.repository.countInterviewsByDayAndStatus).toHaveBeenCalledWith(ENTERPRISE, expect.any(Date), expect.any(Date));
    });
  });

  describe('the period asked from the repository', () => {
    it('is the half-open window from the first instant of the first day to the first instant after the last day', async () => {
      await ctx.service.getCompanyDashboard(HR, custom('2026-09-01', '2026-09-10'));

      const from = new Date('2026-08-31T17:00:00.000Z');
      const to = new Date('2026-09-10T17:00:00.000Z');
      expect(ctx.repository.countApplicationsByDayAndStatus).toHaveBeenCalledWith([JOB_ONE, JOB_TWO, JOB_THREE], from, to);
      expect(ctx.repository.countJobsByDayAndStatus).toHaveBeenCalledWith(ENTERPRISE, from, to);
      expect(ctx.repository.countInterviewsByDayAndStatus).toHaveBeenCalledWith(ENTERPRISE, from, to);
      expect(ctx.repository.findTopJobsByApplications).toHaveBeenCalledWith([JOB_ONE, JOB_TWO, JOB_THREE], from, to, 5);
    });
  });

  describe('the numbers', () => {
    // 1 to 10 Sep: two blocks of days (1-7 and 8-10).
    async function tenDays(): ReturnType<DashboardService['getCompanyDashboard']> {
      ctx.repository.countApplicationsByDayAndStatus.mockResolvedValue([
        { date: '2026-09-02', status: 'submitted', count: 2 },
        { date: '2026-09-02', status: 'hired', count: 1 },
        { date: '2026-09-09', status: 'rejected', count: 3 },
        { date: '2026-09-09', status: 'withdrawn', count: 1 },
        { date: '2026-09-10', status: 'under_review', count: 4 },
        { date: '2026-09-10', status: 'position_filled', count: 1 },
        { date: '2026-09-10', status: 'interviewing', count: 2 },
        { date: '2026-09-10', status: 'offered', count: 1 },
      ]);
      ctx.repository.countJobsByDayAndStatus.mockResolvedValue([
        { date: '2026-09-03', status: 'published', count: 1 },
        { date: '2026-09-04', status: 'draft', count: 1 },
        { date: '2026-09-04', status: 'closed', count: 2 },
        { date: '2026-09-09', status: 'archived', count: 1 },
      ]);
      ctx.repository.countInterviewsByDayAndStatus.mockResolvedValue([
        { date: '2026-09-05', status: 'scheduled', count: 1 },
        { date: '2026-09-05', status: 'completed', count: 2 },
        { date: '2026-09-08', status: 'no_show', count: 1 },
        { date: '2026-09-08', status: 'reschedule_requested', count: 1 },
        { date: '2026-09-09', status: 'cancelled', count: 1 },
      ]);
      ctx.repository.findTopJobsByApplications.mockResolvedValue([
        { jobId: String(JOB_ONE), applications: 8, hired: 1 },
        { jobId: String(JOB_TWO), applications: 6, hired: 0 },
        // A job that has no title any more is left out instead of being shown blank.
        { jobId: String(JOB_THREE), applications: 2, hired: 0 },
      ]);
      ctx.repository.findJobTitles.mockResolvedValue(
        new Map([
          [String(JOB_ONE), 'Senior Backend Engineer (Go)'],
          [String(JOB_TWO), 'Data Analyst'],
        ]),
      );
      ctx.repository.countInterviewsByJob.mockResolvedValue([{ jobId: String(JOB_ONE), count: 3 }]);
      return ctx.service.getCompanyDashboard(HR, custom('2026-09-01', '2026-09-10'));
    }

    it('names the company, the period and the moment the numbers are from', async () => {
      const result = await tenDays();

      expect(result.company).toEqual({ id: ENTERPRISE, name: 'Nova Fintech' });
      expect(result.period).toEqual({ range: 'custom', from: '2026-09-01', to: '2026-09-10', days: 10 });
      expect(result.asOf).toBe('2026-10-11T03:42:00.000Z');
      expect(result.timeZone).toBe('Asia/Ho_Chi_Minh');
    });

    it('sums the key numbers', async () => {
      const { summary } = await tenDays();

      expect(summary).toEqual({
        jobsPosted: 5,
        jobsOpen: 1,
        applicationsReceived: 15,
        averageApplicationsPerDay: 1.5,
        interviews: 6,
        interviewsCompleted: 2,
        hired: 1,
        hiredPercent: 6.7,
      });
    });

    it('groups the applications by the status they have now, and adds up to the total', async () => {
      const { applicationStatuses, summary } = await tenDays();

      expect(applicationStatuses).toEqual({
        submitted: 2,
        underReview: 4,
        interviewing: 2,
        offered: 1,
        hired: 1,
        rejected: 3,
        withdrawn: 1,
        positionFilled: 1,
      });
      expect(Object.values(applicationStatuses).reduce((total, count) => total + count, 0)).toBe(summary.applicationsReceived);
    });

    it('groups interviews and jobs by their status now', async () => {
      const { interviewStatuses, jobStatuses } = await tenDays();

      expect(interviewStatuses).toEqual({ scheduled: 1, rescheduleRequested: 1, completed: 2, noShow: 1, cancelled: 1 });
      expect(jobStatuses).toEqual({ published: 1, closed: 2, draft: 1, archived: 1 });
    });

    it('cuts the period into blocks of seven days from its first day, the last one shorter', async () => {
      const { weeks } = await tenDays();

      expect(weeks).toEqual([
        { from: '2026-09-01', to: '2026-09-07', days: 7, applications: 3, jobsPosted: 4, interviews: 3, hired: 1 },
        { from: '2026-09-08', to: '2026-09-10', days: 3, applications: 12, jobsPosted: 1, interviews: 3, hired: 0 },
      ]);
    });

    it('averages only the whole weeks, so a partial week does not drag it down', async () => {
      const { weeklyAverageApplications } = await tenDays();

      expect(weeklyAverageApplications).toBe(3);
    });

    it('lists every day of the period for the interview calendar, with zeros', async () => {
      const { interviewDays } = await tenDays();

      expect(interviewDays).toHaveLength(10);
      expect(interviewDays[0]).toEqual({ date: '2026-09-01', count: 0 });
      expect(interviewDays.find((day) => day.date === '2026-09-05')).toEqual({ date: '2026-09-05', count: 3 });
      expect(interviewDays.find((day) => day.date === '2026-09-08')).toEqual({ date: '2026-09-08', count: 2 });
      expect(interviewDays.reduce((total, day) => total + day.count, 0)).toBe(6);
    });

    it('lists the top jobs with their interviews, and leaves out a job without a title', async () => {
      const { topJobs } = await tenDays();

      expect(topJobs).toEqual([
        { id: String(JOB_ONE), title: 'Senior Backend Engineer (Go)', applications: 8, interviews: 3, hired: 1 },
        { id: String(JOB_TWO), title: 'Data Analyst', applications: 6, interviews: 0, hired: 0 },
      ]);
    });

    it('averages the weeks of a 30-day period as the design does (22, 31, 27, 36 and a partial 12)', async () => {
      ctx.repository.countApplicationsByDayAndStatus.mockResolvedValue([
        { date: '2026-09-11', status: 'submitted', count: 22 },
        { date: '2026-09-18', status: 'submitted', count: 31 },
        { date: '2026-09-25', status: 'under_review', count: 27 },
        { date: '2026-10-02', status: 'interviewing', count: 36 },
        { date: '2026-10-09', status: 'rejected', count: 12 },
      ]);

      const result = await ctx.service.getCompanyDashboard(HR, preset('last_30_days'));

      expect(result.weeks.map((week) => [week.from, week.to, week.days, week.applications])).toEqual([
        ['2026-09-11', '2026-09-17', 7, 22],
        ['2026-09-18', '2026-09-24', 7, 31],
        ['2026-09-25', '2026-10-01', 7, 27],
        ['2026-10-02', '2026-10-08', 7, 36],
        ['2026-10-09', '2026-10-10', 2, 12],
      ]);
      expect(result.weeklyAverageApplications).toBe(29);
      expect(result.summary.averageApplicationsPerDay).toBe(4.3);
    });
  });

  describe('a period with nothing in it', () => {
    it('returns real zeros and no percentage', async () => {
      const result = await ctx.service.getCompanyDashboard(HR, preset('last_7_days'));

      expect(result.summary).toEqual({
        jobsPosted: 0,
        jobsOpen: 0,
        applicationsReceived: 0,
        averageApplicationsPerDay: 0,
        interviews: 0,
        interviewsCompleted: 0,
        hired: 0,
        hiredPercent: null,
      });
      expect(result.interviewDays).toHaveLength(7);
      expect(result.interviewDays.every((day) => day.count === 0)).toBe(true);
      expect(result.topJobs).toEqual([]);
      expect(result.weeks).toHaveLength(1);
    });

    it('has no weekly average when the period is shorter than a week', async () => {
      const result = await ctx.service.getCompanyDashboard(HR, custom('2026-09-01', '2026-09-05'));

      expect(result.weeklyAverageApplications).toBeNull();
      expect(result.weeks).toEqual([{ from: '2026-09-01', to: '2026-09-05', days: 5, applications: 0, jobsPosted: 0, interviews: 0, hired: 0 }]);
    });

    it('answers a period that has not started with zeros instead of an error', async () => {
      const result = await ctx.service.getCompanyDashboard(HR, custom('2026-12-01', '2026-12-07'));

      expect(result.period.days).toBe(7);
      expect(result.summary.applicationsReceived).toBe(0);
    });

    it('does not look up titles or interviews of jobs when the company has no job', async () => {
      ctx.repository.findJobIds.mockResolvedValue([]);

      await ctx.service.getCompanyDashboard(HR, preset('last_30_days'));

      expect(ctx.repository.findTopJobsByApplications).toHaveBeenCalledWith([], expect.any(Date), expect.any(Date), 5);
      expect(ctx.repository.findJobTitles).toHaveBeenCalledWith([]);
      expect(ctx.repository.countInterviewsByJob).toHaveBeenCalledWith(ENTERPRISE, [], expect.any(Date), expect.any(Date));
    });
  });

  it('does not answer at all when a read fails, so nothing partial is shown', async () => {
    ctx.repository.countInterviewsByDayAndStatus.mockRejectedValue(new Error('connection lost'));

    await expect(ctx.service.getCompanyDashboard(HR, preset('last_30_days'))).rejects.toThrow('connection lost');
  });
});

describe('DashboardService.getPlatformOverview', () => {
  let ctx: Fixture;
  beforeEach(() => {
    ctx = fixture();
  });

  it.each([HR, ENTERPRISE_ADMIN, { id: HR.id, role: 'user' }])('refuses $role', async (actor) => {
    const error = await failure(ctx.service.getPlatformOverview(actor));

    expect(error.statusCode).toBe(403);
    expect(error.message).toBe(DASHBOARD_MESSAGES.PLATFORM_ROLE_ONLY);
    expect(ctx.users.countAccountsByRoleAndStatus).not.toHaveBeenCalled();
  });

  it('never reads a company\'s jobs, applications or interviews', async () => {
    await ctx.service.getPlatformOverview(SYSTEM_ADMIN);

    expect(ctx.repository.findJobIds).not.toHaveBeenCalled();
    expect(ctx.repository.countApplicationsByDayAndStatus).not.toHaveBeenCalled();
    expect(ctx.repository.countInterviewsByDayAndStatus).not.toHaveBeenCalled();
    expect(ctx.repository.countJobsByDayAndStatus).not.toHaveBeenCalled();
  });

  it('counts the accounts of the roles that are users of the platform, never system admins', async () => {
    await ctx.service.getPlatformOverview(SYSTEM_ADMIN);

    const roles = ctx.users.countAccountsByRoleAndStatus.mock.calls[0]?.[0] as string[];
    expect(roles).toEqual(['user', 'applicant', 'recruiter', 'enterprise_admin']);
    expect(roles).not.toContain('admin');
  });

  it('asks for eight whole weeks, Monday to Sunday, ending with the current week', async () => {
    const result = await ctx.service.getPlatformOverview(SYSTEM_ADMIN);

    expect(result.accounts.newPerWeek).toHaveLength(8);
    expect(result.accounts.newPerWeek[0]).toMatchObject({ from: '2026-08-17', to: '2026-08-23' });
    expect(result.accounts.newPerWeek[7]).toMatchObject({ from: '2026-10-05', to: '2026-10-11' });
    const [, from, to, timeZone] = ctx.users.countAccountsCreatedPerDay.mock.calls[0] as [string[], Date, Date, string];
    expect(from.toISOString()).toBe('2026-08-16T17:00:00.000Z');
    expect(to.toISOString()).toBe('2026-10-11T17:00:00.000Z');
    expect(timeZone).toBe('Asia/Ho_Chi_Minh');
  });

  it('sums the accounts by role and by status', async () => {
    ctx.users.countAccountsByRoleAndStatus.mockResolvedValue([
      { role: 'user', status: 'active', count: 1800 },
      { role: 'applicant', status: 'active', count: 10 },
      { role: 'user', status: 'invited', count: 20 },
      { role: 'user', status: 'suspended', count: 5 },
      { role: 'user', status: 'blocked', count: 5 },
      { role: 'recruiter', status: 'active', count: 200 },
      { role: 'recruiter', status: 'inactive', count: 12 },
      { role: 'enterprise_admin', status: 'active', count: 31 },
      { role: 'enterprise_admin', status: 'invited', count: 28 },
      { role: 'enterprise_admin', status: 'suspended', count: 5 },
    ]);

    const { accounts } = await ctx.service.getPlatformOverview(SYSTEM_ADMIN);

    expect(accounts.byRole).toEqual({ candidates: 1840, hr: 212, enterpriseAdmins: 64 });
    expect(accounts.total).toBe(2116);
    expect(accounts.byStatus).toEqual({ active: 2041, invited: 48, inactive: 12, suspended: 15 });
  });

  it('adds up new accounts per week and for the last 30 days, in Vietnam days', async () => {
    ctx.users.countAccountsCreatedPerDay.mockResolvedValue([
      { date: '2026-08-17', count: 4 },
      { date: '2026-08-23', count: 1 },
      { date: '2026-09-11', count: 9 },
      { date: '2026-09-12', count: 2 },
      { date: '2026-10-05', count: 6 },
      { date: '2026-10-11', count: 3 },
    ]);

    const { accounts } = await ctx.service.getPlatformOverview(SYSTEM_ADMIN);

    expect(accounts.newPerWeek.map((week) => week.count)).toEqual([5, 0, 0, 9 + 2, 0, 0, 0, 9]);
    // 30 days ending today start on 12 Sep: the 9 accounts of 11 Sep are outside.
    expect(accounts.newInLast30Days).toBe(2 + 6 + 3);
  });

  it('counts companies: active, suspended, approved and waiting for review', async () => {
    ctx.repository.countEnterprisesByStatus.mockResolvedValue([
      { status: 'active', count: 58 },
      { status: 'suspended', count: 3 },
      { status: 'pending', count: 7 },
      { status: 'rejected', count: 2 },
    ]);
    ctx.repository.findPendingRegistrations.mockResolvedValue({ total: 4, items: [] });

    const { companies } = await ctx.service.getPlatformOverview(SYSTEM_ADMIN);

    expect(companies).toEqual({ active: 58, suspended: 3, approved: 61, waitingForReview: 4, oldestWaitingDays: null });
  });

  it('lists the sign-ups waiting for review with the days they have waited, by calendar day', async () => {
    ctx.repository.findPendingRegistrations.mockResolvedValue({
      total: 4,
      items: [
        // 01:00 in Vietnam on 6 Oct: submitted on the 6th, five days before today.
        { id: 'r1', companyName: 'Pixel Labs', submittedAt: new Date('2026-10-05T18:00:00.000Z') },
        { id: 'r2', companyName: 'Sunrise Apps', submittedAt: new Date('2026-10-08T05:00:00.000Z') },
        { id: 'r3', companyName: 'Kite Health', submittedAt: new Date('2026-10-10T08:00:00.000Z') },
        { id: 'r4', companyName: 'Lotus Data', submittedAt: new Date('2026-10-11T02:00:00.000Z') },
      ],
    });

    const { waitingForReview, companies } = await ctx.service.getPlatformOverview(SYSTEM_ADMIN);

    expect(waitingForReview.map((item) => [item.companyName, item.waitingDays])).toEqual([
      ['Pixel Labs', 5],
      ['Sunrise Apps', 3],
      ['Kite Health', 1],
      ['Lotus Data', 0],
    ]);
    expect(waitingForReview[0]?.submittedAt).toBe('2026-10-05T18:00:00.000Z');
    expect(companies.oldestWaitingDays).toBe(5);
  });

  it('returns zeros and an empty list when nothing exists yet', async () => {
    const result = await ctx.service.getPlatformOverview(SYSTEM_ADMIN);

    expect(result.accounts.total).toBe(0);
    expect(result.accounts.newInLast30Days).toBe(0);
    expect(result.companies).toEqual({ active: 0, suspended: 0, approved: 0, waitingForReview: 0, oldestWaitingDays: null });
    expect(result.waitingForReview).toEqual([]);
  });
});
