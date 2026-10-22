import type { ApplicationStatus } from '../../models/application.model.js';
import type { InterviewStatus } from '../../models/interview.model.js';
import type { JobPostingStatus } from '../../models/job-posting.model.js';
import type { UserRole, UserStatus } from '../../models/user.model.js';

// Every date of the dashboard is a whole calendar day in Vietnam time. Vietnam has no daylight saving time,
// so a fixed offset is enough to turn an instant into its local day and back.
export const DASHBOARD_TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const DASHBOARD_UTC_OFFSET_HOURS = 7;
// `$dateToString` format that groups documents by their local calendar day (YYYY-MM-DD).
export const DASHBOARD_DAY_FORMAT = '%Y-%m-%d';

// HR and enterprise admins see the numbers of their own company; a system admin sees the platform overview.
export const DASHBOARD_COMPANY_ROLES = ['recruiter', 'enterprise_admin'] as const satisfies readonly UserRole[];
export const DASHBOARD_PLATFORM_ROLE: UserRole = 'admin';
// The company a dashboard may show must be active.
export const DASHBOARD_ACTIVE_ENTERPRISE_STATUS = 'active';

// Time filter of the company dashboard. The presets end yesterday: today is not over, so its counts would be partial.
export const DASHBOARD_RANGES = ['last_7_days', 'last_30_days', 'last_90_days', 'this_month', 'custom'] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];
export const DASHBOARD_DEFAULT_RANGE: DashboardRange = 'last_30_days';
export const DASHBOARD_PRESET_DAYS: Readonly<Partial<Record<DashboardRange, number>>> = {
  last_7_days: 7,
  last_30_days: 30,
  last_90_days: 90,
};

export const DASHBOARD_CONFIG = {
  // The longest period a custom range may cover; keeps every aggregation and the day-by-day lists bounded.
  MAX_RANGE_DAYS: 366,
  // The weekly chart and the sparklines group the period in blocks of this many days, starting at its first day.
  WEEK_DAYS: 7,
  TOP_JOBS_LIMIT: 5,
  // Platform overview.
  NEW_ACCOUNTS_WEEKS: 8,
  NEW_ACCOUNTS_WINDOW_DAYS: 30,
  WAITING_LIST_LIMIT: 4,
  // `YYYY-MM-DD` and `YYYY-MM`
  ISO_DATE_LENGTH: 10,
  ISO_MONTH_LENGTH: 7,
  PERCENT: 100,
  ONE_DECIMAL: 10,
  TWO_DECIMALS: 100,
  MS_PER_HOUR: 3_600_000,
  MS_PER_DAY: 86_400_000,
  // Date.getUTCDay() counts Sunday as 0; the dashboard weeks start on Monday.
  SUNDAY_UTC_DAY: 0,
  DAYS_IN_WEEK: 7,
} as const;

// Candidates carry the default `user` role in this backend; `applicant` is accepted for the same reason.
export const DASHBOARD_CANDIDATE_ROLES = ['user', 'applicant'] as const satisfies readonly UserRole[];
export const DASHBOARD_HR_ROLE: UserRole = 'recruiter';
export const DASHBOARD_ENTERPRISE_ADMIN_ROLE: UserRole = 'enterprise_admin';
// System admins are staff, not accounts of the platform's users, so they are not counted.
export const DASHBOARD_ACCOUNT_ROLES = [
  ...DASHBOARD_CANDIDATE_ROLES,
  DASHBOARD_HR_ROLE,
  DASHBOARD_ENTERPRISE_ADMIN_ROLE,
] as const satisfies readonly UserRole[];

// An account is "suspended" for the dashboard when an admin suspended it or it was blocked for not verifying its email.
export const DASHBOARD_SUSPENDED_USER_STATUSES: readonly UserStatus[] = ['suspended', 'blocked'];
export const DASHBOARD_DEFAULT_USER_STATUS: UserStatus = 'active';

export const DASHBOARD_PENDING_REGISTRATION_STATUS = 'pending_review';
// Companies that are approved: running, or approved and then suspended.
export const DASHBOARD_SUSPENDED_ENTERPRISE_STATUS = 'suspended';

export const DASHBOARD_CLOSED_APPLICATION_STATUSES: readonly ApplicationStatus[] = ['rejected', 'withdrawn', 'position_filled'];
export const DASHBOARD_HIRED_STATUS: ApplicationStatus = 'hired';
export const DASHBOARD_PUBLISHED_STATUS: JobPostingStatus = 'published';
export const DASHBOARD_COMPLETED_INTERVIEW_STATUS: InterviewStatus = 'completed';

// The response names statuses in camelCase; these maps are the only place that translates the stored values.
export const DASHBOARD_APPLICATION_STATUS_KEYS = {
  submitted: 'submitted',
  under_review: 'underReview',
  interviewing: 'interviewing',
  offered: 'offered',
  hired: 'hired',
  rejected: 'rejected',
  withdrawn: 'withdrawn',
  position_filled: 'positionFilled',
} as const satisfies Record<ApplicationStatus, string>;

export const DASHBOARD_INTERVIEW_STATUS_KEYS = {
  scheduled: 'scheduled',
  reschedule_requested: 'rescheduleRequested',
  completed: 'completed',
  no_show: 'noShow',
  cancelled: 'cancelled',
} as const satisfies Record<InterviewStatus, string>;

export const DASHBOARD_MESSAGES = {
  AUTH_REQUIRED: 'Authentication required',
  COMPANY_ROLES_ONLY: 'Only HR and enterprise admins can open the company dashboard',
  PLATFORM_ROLE_ONLY: 'Only system admins can open the platform overview',
  NOT_A_MEMBER: 'Your account is no longer a member of a company',
  COMPANY_NOT_ACTIVE: 'The dashboard is not available while the company is not active',
  CUSTOM_RANGE_NEEDS_DATES: 'A custom range needs both "from" and "to"',
  DATES_ONLY_FOR_CUSTOM: '"from" and "to" only apply to a custom range',
  END_BEFORE_START: '"to" must be on or after "from"',
  RANGE_TOO_LONG: `A period can cover at most ${DASHBOARD_CONFIG.MAX_RANGE_DAYS} days`,
} as const;

export const DASHBOARD_ERROR_CODES = {
  NOT_A_MEMBER: 'DASHBOARD_NOT_A_MEMBER',
  COMPANY_NOT_ACTIVE: 'DASHBOARD_COMPANY_NOT_ACTIVE',
} as const;
