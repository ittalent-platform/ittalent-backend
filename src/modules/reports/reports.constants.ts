export const REPORT_TARGET_TYPES = ['job', 'enterprise', 'user'] as const;

export const REPORT_REASON_CATEGORIES = [
  'scam_fraud',
  'fee_extortion',
  'misleading_info',
  'offensive_content',
  'impersonation',
  'harassment',
  'other',
] as const;

export const REPORT_STATUSES = [
  'pending',
  'reviewing',
  'resolved',
  'rejected',
  'withdrawn',
] as const;

export const REPORT_RESOLUTION_DECISIONS = ['resolved', 'rejected'] as const;

export const REPORT_ACTIONS_TAKEN = [
  'warning_issued',
  'content_takedown',
  'account_suspended',
  'none',
] as const;

export const REPORT_LIMITS = {
  TITLE_MIN: 5,
  TITLE_MAX: 100,
  DESC_MIN: 20,
  DESC_MAX: 1500,
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

export const REPORT_TIME_LIMITS = {
  TWENTY_FOUR_HOURS_MS: 86_400_000, // 24 * 60 * 60 * 1000
} as const;

export const REPORT_CRYPTO = {
  RANDOM_TICKET_BYTES: 2,
} as const;

export const REPORT_MESSAGES = {
  CREATED: 'Report submitted successfully. Our safety team will review it.',
  WITHDRAWN: 'Report withdrawn successfully',
  DELETED: 'Report removed from your history',
  RESOLVED: 'Report resolved and enforcement actions applied successfully',
  CLAIMED: 'Report claimed for investigation',
  NOT_FOUND: 'Report not found',
  TARGET_NOT_FOUND: 'Target entity not found or inactive',
  SELF_REPORT_FORBIDDEN: 'You cannot report your own job posting, company, or profile',
  DUPLICATE_PENDING: 'You already have an active pending report for this item. Please wait for our team to complete review',
  NOT_PENDING_CANNOT_WITHDRAW: 'This report is already under investigation or has been resolved and cannot be withdrawn',
  NOT_TERMINAL_CANNOT_DELETE: 'Active reports cannot be deleted. Please withdraw the report first if you wish to cancel it',
  FORBIDDEN_VIEW: 'Access denied: You do not have permission to view this report',
  ADMIN_ONLY: 'Access denied: Administrator privileges required',
  ALREADY_RESOLVED: 'This report ticket has already been resolved or rejected',
  EVIDENCE_LIMIT_EXCEEDED: 'Maximum of 5 evidence files allowed',
} as const;
