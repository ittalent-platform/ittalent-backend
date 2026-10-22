import { z } from 'zod';

import {
  DASHBOARD_CONFIG,
  DASHBOARD_DEFAULT_RANGE,
  DASHBOARD_MESSAGES,
  DASHBOARD_RANGES,
} from './dashboard.constants.js';

// A whole calendar day in Vietnam time, `YYYY-MM-DD`. The format also rejects dates that do not exist (30 Feb).
const localDateSchema = z.iso.date();

// strictObject: an unknown key (for example a company id) is refused instead of being ignored.
export const companyDashboardQuerySchema = z.strictObject({
  range: z.enum(DASHBOARD_RANGES).default(DASHBOARD_DEFAULT_RANGE),
  from: localDateSchema.optional(),
  to: localDateSchema.optional(),
});
// Cross-field rules live outside the base object so OpenAPI keeps a plain object shape.
export const companyDashboardQueryValidator = companyDashboardQuerySchema.superRefine((data, ctx) => {
  if (data.range !== 'custom') {
    if (data.from !== undefined || data.to !== undefined) {
      ctx.addIssue({ code: 'custom', message: DASHBOARD_MESSAGES.DATES_ONLY_FOR_CUSTOM, path: ['range'] });
    }
    return;
  }
  if (data.from === undefined || data.to === undefined) {
    ctx.addIssue({ code: 'custom', message: DASHBOARD_MESSAGES.CUSTOM_RANGE_NEEDS_DATES, path: ['from'] });
    return;
  }
  // ISO dates sort the same as the days they name.
  if (data.to < data.from) {
    ctx.addIssue({ code: 'custom', message: DASHBOARD_MESSAGES.END_BEFORE_START, path: ['to'] });
    return;
  }
  const days = (Date.parse(data.to) - Date.parse(data.from)) / DASHBOARD_CONFIG.MS_PER_DAY + 1;
  if (days > DASHBOARD_CONFIG.MAX_RANGE_DAYS) {
    ctx.addIssue({ code: 'custom', message: DASHBOARD_MESSAGES.RANGE_TOO_LONG, path: ['to'] });
  }
});
export type CompanyDashboardQuery = z.infer<typeof companyDashboardQuerySchema>;

const countSchema = z.number().int().min(0);

export const dashboardPeriodSchema = z.object({
  range: z.enum(DASHBOARD_RANGES),
  from: localDateSchema,
  to: localDateSchema,
  days: z.number().int().min(1),
});

// One block of the period (seven days from its first day; the last one can be shorter).
export const dashboardWeekSchema = z.object({
  from: localDateSchema,
  to: localDateSchema,
  days: z.number().int().min(1),
  applications: countSchema,
  jobsPosted: countSchema,
  interviews: countSchema,
  hired: countSchema,
});

export const companyDashboardResponseSchema = z.object({
  asOf: z.iso.datetime(),
  timeZone: z.string(),
  company: z.object({ id: z.string(), name: z.string() }),
  period: dashboardPeriodSchema,
  summary: z.object({
    jobsPosted: countSchema,
    jobsOpen: countSchema,
    applicationsReceived: countSchema,
    averageApplicationsPerDay: z.number().min(0),
    interviews: countSchema,
    interviewsCompleted: countSchema,
    hired: countSchema,
    hiredPercent: z.number().min(0).nullable(),
  }),
  weeks: z.array(dashboardWeekSchema),
  weeklyAverageApplications: z.number().min(0).nullable(),
  applicationStatuses: z.object({
    submitted: countSchema,
    underReview: countSchema,
    interviewing: countSchema,
    offered: countSchema,
    hired: countSchema,
    rejected: countSchema,
    withdrawn: countSchema,
    positionFilled: countSchema,
  }),
  interviewDays: z.array(z.object({ date: localDateSchema, count: countSchema })),
  interviewStatuses: z.object({
    scheduled: countSchema,
    rescheduleRequested: countSchema,
    completed: countSchema,
    noShow: countSchema,
    cancelled: countSchema,
  }),
  jobStatuses: z.object({
    published: countSchema,
    closed: countSchema,
    draft: countSchema,
    archived: countSchema,
  }),
  topJobs: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      applications: countSchema,
      interviews: countSchema,
      hired: countSchema,
    }),
  ),
});
export type CompanyDashboardResponse = z.infer<typeof companyDashboardResponseSchema>;
export type DashboardPeriod = z.infer<typeof dashboardPeriodSchema>;
export type DashboardWeek = z.infer<typeof dashboardWeekSchema>;

export const platformOverviewResponseSchema = z.object({
  asOf: z.iso.datetime(),
  timeZone: z.string(),
  accounts: z.object({
    total: countSchema,
    newInLast30Days: countSchema,
    byRole: z.object({ candidates: countSchema, hr: countSchema, enterpriseAdmins: countSchema }),
    byStatus: z.object({ active: countSchema, invited: countSchema, inactive: countSchema, suspended: countSchema }),
    // Monday to Sunday, oldest week first; the last one is the current week so far.
    newPerWeek: z.array(z.object({ from: localDateSchema, to: localDateSchema, count: countSchema })),
  }),
  companies: z.object({
    active: countSchema,
    suspended: countSchema,
    approved: countSchema,
    waitingForReview: countSchema,
    oldestWaitingDays: countSchema.nullable(),
  }),
  waitingForReview: z.array(
    z.object({
      id: z.string(),
      companyName: z.string(),
      submittedAt: z.iso.datetime(),
      waitingDays: countSchema,
    }),
  ),
});
export type PlatformOverviewResponse = z.infer<typeof platformOverviewResponseSchema>;
