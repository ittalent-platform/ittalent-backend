import { applicationStatuses, type ApplicationStatus } from '../../models/application.model.js';
import type { UserRole } from '../../models/user.model.js';

// In this codebase an Applicant is a user with the default `user` role.
export const APPLICANT_ROLE: UserRole = 'user';

export const APPLICATION_INITIAL_STATUS: ApplicationStatus = 'submitted';
export const APPLICATION_HIRED_STATUS: ApplicationStatus = 'hired';

// BR-APP-010: only a Withdrawn or Rejected application is closed, and only then may the applicant apply again
// (as a new record). Any other status keeps the pair occupied.
export const CLOSED_APPLICATION_STATUSES: readonly ApplicationStatus[] = ['withdrawn', 'rejected'];
// BR-APP-010: a pair has at most two records; the second one is the last application to that job.
export const MAX_APPLICATIONS_PER_JOB = 2;

export const APPLICATION_CONFIG = {
  MESSAGE_MAX_LENGTH: 1000,
  KEYWORD_MIN_LENGTH: 1,
  KEYWORD_MAX_LENGTH: 100,
  HISTORY_DEFAULT_LIMIT: 20,
  HISTORY_MAX_LIMIT: 100,
  DEFAULT_PAGE: 1,
  STATUS_FILTER_SEPARATOR: ',',
  MONGO_DUPLICATE_KEY_ERROR_CODE: 11000,
} as const;

export const APPLICATION_MESSAGES = {
  AUTH_REQUIRED: 'Authentication required',
  EMAIL_NOT_VERIFIED: 'Please verify your email before applying for a job',
  ACCOUNT_NOT_ACTIVE: 'Your account is not allowed to apply for jobs',
  JOB_UNAVAILABLE: 'Job not found or is no longer available',
  POSITION_FILLED: 'Position has been filled',
  INVALID_CV: 'Selected CV is not available',
  INVALID_COVER_LETTER: 'Selected cover letter is not available',
  ALREADY_APPLIED: 'You have already applied for this job',
  APPLY_AGAIN_NOT_ALLOWED: 'You cannot apply for this job again',
  // UC-MYAPP-01.EX.2: the account cannot be resolved to a candidate; nothing is read or repaired here.
  CANDIDATE_UNAVAILABLE: 'Candidate profile could not be resolved. Contact support to repair your account.',
  NOT_FOUND: 'Application not found',
  INVALID_STATUS_FILTER: 'Status filter must be a comma-separated list of supported statuses',
  WITHDRAWAL_NOT_ALLOWED: 'Only submitted or under-review applications can be withdrawn',
  WITHDRAWAL_CONFLICT: 'Application state changed before the withdrawal could be applied',
} as const;

export const APPLICATION_ERROR_CODES = {
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  ACCOUNT_NOT_ACTIVE: 'ACCOUNT_NOT_ACTIVE',
  JOB_UNAVAILABLE: 'JOB_UNAVAILABLE',
  POSITION_FILLED: 'POSITION_FILLED',
  INVALID_CV: 'INVALID_CV',
  INVALID_COVER_LETTER: 'INVALID_COVER_LETTER',
  ALREADY_APPLIED: 'ALREADY_APPLIED',
  APPLY_AGAIN_NOT_ALLOWED: 'APPLY_AGAIN_NOT_ALLOWED',
} as const;

export const APPLICATION_SUBMITTED_LABEL = 'Submitted';
export const APPLICATION_EMAIL_FAILED_LOG = '[applications:email:error]';

// BR-APP-004: withdrawal is only permitted before the interview stage and is terminal.
export const WITHDRAWABLE_STATUSES: readonly ApplicationStatus[] = ['submitted', 'under_review'];

export function isWithdrawable(status: ApplicationStatus): boolean {
  return WITHDRAWABLE_STATUSES.includes(status);
}

// Public-facing stage label per status (UC-MYAPP-01 postcondition 3). Submitted and Withdrawn have none.
export const REVIEW_STAGES = ['screening', 'interview', 'offer', 'hired', 'rejected'] as const;
export type ApplicationReviewStage = (typeof REVIEW_STAGES)[number];
export const STATUS_REVIEW_STAGE: Partial<Record<ApplicationStatus, ApplicationReviewStage>> = {
  under_review: 'screening',
  interviewing: 'interview',
  offered: 'offer',
  hired: 'hired',
  rejected: 'rejected',
};

// Sort keys for the list (table headers: ID, Submitted, Updated).
export const APPLICATION_SORT_FIELDS = ['submittedAt', 'latestStatusAt', 'id'] as const;
export type ApplicationSortField = (typeof APPLICATION_SORT_FIELDS)[number];
export const APPLICATION_SORT_ORDERS = ['asc', 'desc'] as const;
export type ApplicationSortOrder = (typeof APPLICATION_SORT_ORDERS)[number];
export const APPLICATION_SORT_COLUMNS: Record<ApplicationSortField, string> = {
  submittedAt: 'createdAt',
  latestStatusAt: 'updatedAt',
  id: '_id',
};

// Public-facing actor roles for history entries; account identifiers are never exposed (BR-APP-005/007).
export const HISTORY_ACTOR_ROLES = ['candidate', 'company', 'system'] as const;
export type ApplicationActorRole = (typeof HISTORY_ACTOR_ROLES)[number];

export const JOB_PUBLIC_STATUS = { OPEN: 'open', CLOSED: 'closed' } as const;

// Board columns follow the candidate-facing lifecycle order from UC-MYAPP-01.AC.3.
export function createEmptyStatusCounts(): Record<ApplicationStatus, number> {
  return applicationStatuses.reduce(
    (counts, status) => {
      counts[status] = 0;
      return counts;
    },
    {} as Record<ApplicationStatus, number>,
  );
}
