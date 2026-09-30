import type { ApplicationStatus } from '../../models/application.model.js';
import { applicationStatuses, APPLICATION_REASON_MAX_LENGTH } from '../../models/application.model.js';

export const APPLICATION_MESSAGES = {
  AUTH_REQUIRED: 'Authentication required',
  // UC-MYAPP-01.EX.2: the account cannot be resolved to a candidate; nothing is read or repaired here.
  CANDIDATE_UNAVAILABLE: 'Candidate profile could not be resolved. Contact support to repair your account.',
  INVALID_STATUS_FILTER: 'Status filter must be a comma-separated list of supported statuses',
  NOT_FOUND: 'Application not found',
  WITHDRAWAL_NOT_ALLOWED: 'Only submitted or under-review applications can be withdrawn',
  WITHDRAWAL_CONFLICT: 'Application state changed before the withdrawal could be applied',
} as const;

export const APPLICATION_CONFIG = {
  KEYWORD_MIN_LENGTH: 1,
  KEYWORD_MAX_LENGTH: 100,
  REASON_MAX_LENGTH: APPLICATION_REASON_MAX_LENGTH,
  HISTORY_DEFAULT_LIMIT: 20,
  HISTORY_MAX_LIMIT: 100,
  DEFAULT_PAGE: 1,
  STATUS_FILTER_SEPARATOR: ',',
} as const;

// Sort keys accepted by the list endpoint (table headers: ID, Submitted, Updated).
export const APPLICATION_SORT_FIELDS = ['submittedAt', 'latestStatusAt', 'id'] as const;
export type ApplicationSortField = (typeof APPLICATION_SORT_FIELDS)[number];
export const APPLICATION_SORT_ORDERS = ['asc', 'desc'] as const;
export type ApplicationSortOrder = (typeof APPLICATION_SORT_ORDERS)[number];
export const APPLICATION_SORT_COLUMNS: Record<ApplicationSortField, string> = {
  submittedAt: 'submitted_at',
  latestStatusAt: 'latest_status_at',
  id: '_id',
};

// BR-APP-008: only a first application that was withdrawn, on a job that is still public, may be repeated once.
export const REAPPLY_PUBLIC_STATUS = 'open';

// BR-APP-004: withdrawal is only permitted before the interview stage and is terminal.
export const WITHDRAWABLE_STATUSES: readonly ApplicationStatus[] = ['submitted', 'under_review'];

export function isWithdrawable(status: ApplicationStatus): boolean {
  return WITHDRAWABLE_STATUSES.includes(status);
}

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
