import type { UserRole } from '../../models/user.model.js';

export const CANDIDATE_ROLES: readonly UserRole[] = ['user', 'applicant'] as const;

export const REPORT_TARGET_TYPES = ['job', 'company', 'user'] as const;
export const reportTargetTypes = ['job', 'enterprise', 'user'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number] | (typeof reportTargetTypes)[number];

export const REPORT_REASON_CATEGORIES = [
  'scam_fraud',
  'fee_extortion',
  'misleading_info',
  'offensive_content',
  'impersonation',
  'harassment',
  'other',
] as const;
export type ReportReasonCategory = (typeof REPORT_REASON_CATEGORIES)[number];
export const reportReasonCategories = REPORT_REASON_CATEGORIES;

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
  scam_fraud: 'Scam / Fraud',
  fee_extortion: 'Fee extortion',
  misleading_info: 'Misleading information',
  offensive_content: 'Offensive content',
  impersonation: 'Impersonation',
  harassment: 'Harassment',
  other: 'Other',
};

export const REPORT_STATUSES = [
  'pending',
  'reviewing',
  'resolved',
  'rejected',
  'withdrawn',
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const reportStatuses = REPORT_STATUSES;

export const REPORT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  reviewing: 'Reviewing',
  resolved: 'Resolved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

export const REPORT_RESOLUTION_DECISIONS = ['resolved', 'rejected'] as const;
export type ReportResolutionDecision = (typeof REPORT_RESOLUTION_DECISIONS)[number];
export const reportResolutionDecisions = REPORT_RESOLUTION_DECISIONS;

export const REPORT_ACTIONS_TAKEN = [
  'warning_issued',
  'content_takedown',
  'account_suspended',
  'none',
] as const;
export type ReportActionTaken = (typeof REPORT_ACTIONS_TAKEN)[number];
export const reportActionsTaken = REPORT_ACTIONS_TAKEN;

export const OPEN_REPORT_STATUSES: readonly ReportStatus[] = ['pending', 'reviewing'] as const;
export const CLOSED_REPORT_STATUSES: readonly ReportStatus[] = ['resolved', 'rejected', 'withdrawn'] as const;

export const REPORT_STATUS_FILTERS = ['all', 'open', 'closed'] as const;
export type ReportStatusFilter = (typeof REPORT_STATUS_FILTERS)[number];

export const REPORT_LIMITS = {
  TITLE_MIN: 5,
  TITLE_MAX: 100,
  DESC_MIN: 20,
  DESC_MAX: 2000,
  MAX_EVIDENCE_FILES: 5,
  WITHDRAWAL_REASON_MAX: 200,
  INTERNAL_NOTES_MIN: 5,
  INTERNAL_NOTES_MAX: 1000,
  MESSAGE_TO_REPORTER_MIN: 10,
  MESSAGE_TO_REPORTER_MAX: 500,
} as const;

export const REPORT_PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
} as const;

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
  REFERENCE_PATTERN: /^(RPT|REP)-\d{4}-.+$/,
} as const;

export const REPORT_TIME_LIMITS = {
  TWENTY_FOUR_HOURS_MS: 86_400_000, // 24 * 60 * 60 * 1000
} as const;

export const REPORT_CRYPTO = {
  RANDOM_TICKET_BYTES: 2,
} as const;

export const REPORT_MESSAGES = {
  AUTH_REQUIRED: 'Authentication required',
  FORBIDDEN_ROLE: 'Reporting is available for applicant accounts',
  TARGET_NOT_FOUND: 'Target entity not found or inactive',
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
  CREATED: 'Report submitted successfully. Our safety team will review it.',
  WITHDRAWN: 'Report withdrawn successfully',
  DELETED: 'Report removed from your history',
  RESOLVED: 'Report resolved and enforcement actions applied successfully',
  CLAIMED: 'Report claimed for investigation',
  NOT_FOUND: 'Report not found',
  SELF_REPORT_FORBIDDEN: 'You cannot report your own job posting, company, or profile',
  DUPLICATE_PENDING: 'You already have an active pending report for this item. Please wait for our team to complete review',
  NOT_PENDING_CANNOT_WITHDRAW: 'This report is already under investigation or has been resolved and cannot be withdrawn',
  NOT_TERMINAL_CANNOT_DELETE: 'Active reports cannot be deleted. Please withdraw the report first if you wish to cancel it',
  FORBIDDEN_VIEW: 'Access denied: You do not have permission to view this report',
  ADMIN_ONLY: 'Access denied: Administrator privileges required',
  ALREADY_RESOLVED: 'This report ticket has already been resolved or rejected',
  EVIDENCE_LIMIT_EXCEEDED: 'Maximum of 5 evidence files allowed',
} as const;

export const REPORT_ERROR_CODES = {
  TARGET_UNAVAILABLE: 'TARGET_UNAVAILABLE',
  REPORT_NOT_FOUND: 'REPORT_NOT_FOUND',
  INVALID_FILTER: 'INVALID_FILTER',
  REVIEW_ALREADY_STARTED: 'REVIEW_ALREADY_STARTED',
  REPORT_NOT_CLOSED: 'REPORT_NOT_CLOSED',
} as const;
