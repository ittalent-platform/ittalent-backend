import type { UserRole } from '../../models/user.model.js';

export const CANDIDATE_ROLES: readonly UserRole[] = ['user', 'applicant'] as const;

export const REPORT_TARGET_TYPES = ['job', 'company', 'user'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASONS = [
  'scam_or_fraud',
  'misleading_information',
  'discrimination',
  'inappropriate_content',
  'something_else',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<string, string> = {
  scam_or_fraud: 'Scam or fraud',
  misleading_information: 'Misleading information',
  discrimination: 'Discrimination',
  inappropriate_content: 'Inappropriate content',
  something_else: 'Something else',
};

export const REPORT_STATUSES = [
  'pending',
  'reviewing',
  'resolved',
  'rejected',
  'withdrawn',
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  reviewing: 'Reviewing',
  resolved: 'Resolved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

export const OPEN_REPORT_STATUSES: readonly ReportStatus[] = ['pending', 'reviewing'] as const;
export const CLOSED_REPORT_STATUSES: readonly ReportStatus[] = ['resolved', 'rejected', 'withdrawn'] as const;

export const REPORT_STATUS_FILTERS = ['all', 'open', 'closed'] as const;
export type ReportStatusFilter = (typeof REPORT_STATUS_FILTERS)[number];

export const REPORT_CONFIG = {
  MAX_EVIDENCE_FILES: 5,
  MAX_FILE_SIZE_MB: 5,
  BYTES_PER_MB: 1_048_576,
  MAX_STATEMENT_LENGTH: 2000,
  MIN_STATEMENT_LENGTH: 1,
  MAX_SEARCH_KEYWORD_LENGTH: 100,
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 50,
  REFERENCE_PATTERN: /^RPT-\d{4}-\d{4,}$/,
} as const;

export const REPORT_MESSAGES = {
  AUTH_REQUIRED: 'Authentication required',
  FORBIDDEN_ROLE: 'Reporting is available for applicant accounts',
  TARGET_NOT_FOUND: 'Target not found',
  TARGET_UNAVAILABLE: 'This page is no longer available, so it can’t be reported.',
  REPORT_NOT_FOUND: 'This report isn’t available',
  INVALID_FILTER: 'That filter isn’t supported',
  STATEMENT_REQUIRED: 'Tell us what happened.',
  REASON_REQUIRED: 'Choose what’s wrong.',
  FILE_NOT_ACCEPTED: 'Use a screenshot or a document.',
  FILE_SIZE_LIMIT: 'Evidence file exceeds maximum allowed size (5 MB)',
  FILE_COUNT_LIMIT: 'A maximum of 5 evidence files can be uploaded',
  REVIEW_ALREADY_STARTED: 'Review has already started. This report can no longer be withdrawn. Its status has been updated.',
  CANNOT_WITHDRAW: 'Review has started, so this report can’t be withdrawn.',
  REPORT_NOT_CLOSED: 'You can hide this report once it’s closed.',
  CREATE_SUCCESS: 'Report received. You can follow it in My reports.',
  WITHDRAW_SUCCESS: 'Report withdrawn. Review stopped and record kept.',
  HIDE_SUCCESS: 'Hidden from your history. ITTalent still keeps the report.',
} as const;

export const REPORT_ERROR_CODES = {
  TARGET_UNAVAILABLE: 'TARGET_UNAVAILABLE',
  REPORT_NOT_FOUND: 'REPORT_NOT_FOUND',
  INVALID_FILTER: 'INVALID_FILTER',
  REVIEW_ALREADY_STARTED: 'REVIEW_ALREADY_STARTED',
  REPORT_NOT_CLOSED: 'REPORT_NOT_CLOSED',
} as const;
