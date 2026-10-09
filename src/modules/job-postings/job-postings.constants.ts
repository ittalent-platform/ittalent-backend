export const JOB_POSTING_MESSAGES = {
  CANNOT_DELETE_WITH_APPLICATIONS:
    'Cannot delete job posting because applications already exist for this job.',
  ENTERPRISE_NOT_ACTIVE:
    'The enterprise is not active, so it cannot publish job postings.',
  ARCHIVED_NOT_EDITABLE: 'Archived job postings cannot be edited.',
  CLOSE_NOT_ALLOWED: 'Only an open published job posting can be closed.',
  REOPEN_NOT_ALLOWED: 'Only a closed job posting can be reopened.',
  ARCHIVE_NOT_ALLOWED: 'Only a closed job posting can be archived.',
  RESTORE_NOT_ALLOWED: 'Only an archived job posting can be restored.',
  PUBLICATION_CHANGE_NOT_ALLOWED:
    'Archived job postings must be restored before changing publication status.',
  DEADLINE_IN_PAST: 'Deadline must be today or later.',
  DEADLINE_INVALID: 'Deadline must be a valid date (YYYY-MM-DD).',
  PUBLISHED_FIELDS_REQUIRED:
    'Published job posting requires description, requirements, benefits, location, employment type, and deadline',
  AUDIT_FAILED: 'The request could not be completed. Please try again.',
  NOT_FOUND: 'Job posting not found',
} as const;

/** Deadlines use the selected calendar day in Asia/Ho_Chi_Minh (UTC+7, no daylight saving). */
export const JOB_DEADLINE = {
  DATE_ONLY_PATTERN: /^\d{4}-\d{2}-\d{2}$/,
  DATETIME_PREFIX_PATTERN: /^\d{4}-\d{2}-\d{2}T/,
  UTC_START_OF_DAY: 'T00:00:00.000Z',
  ICT_END_OF_DAY: 'T23:59:59.999+07:00',
  ICT_OFFSET_MS: 25_200_000,
  DATE_LENGTH: 'YYYY-MM-DD'.length,
} as const;

/** Job types HR/Recruiter can choose (AC-JOB-01-04). */
export const JOB_EMPLOYMENT_TYPES = [
  'Full-time',
  'Part-time',
  'Internship',
  'Contract',
  'Remote',
] as const;
export type JobEmploymentType = (typeof JOB_EMPLOYMENT_TYPES)[number];

export const JOB_LIMITS = {
  TITLE_MIN: 5,
  TITLE_MAX: 150,
  CONTENT_MIN: 20,
  CONTENT_MAX: 5000,
  LOCATION_MIN: 2,
  LOCATION_MAX: 150,
  SHORT_TEXT_MAX: 100,
  CURRENCY_MAX: 10,
} as const;

/** Recruitment status is derived, never stored: Open while Published and before the deadline. */
export const RECRUITMENT_STATUSES = ['open', 'closed'] as const;
export type RecruitmentStatus = (typeof RECRUITMENT_STATUSES)[number];

export const JOB_AUDIT_ACTIONS = [
  'create',
  'update',
  'delete',
  'publish',
  'draft',
  'close',
  'reopen',
  'archive',
  'restore',
] as const;
export type JobAuditAction = (typeof JOB_AUDIT_ACTIONS)[number];
