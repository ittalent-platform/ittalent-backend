export const JOB_POSTING_MESSAGES = {
  CANNOT_DELETE_WITH_APPLICATIONS: 'Cannot delete job posting because applications already exist for this job.',
  ENTERPRISE_NOT_ACTIVE: 'The enterprise is not active, so it cannot publish job postings.',
  ARCHIVED_NOT_EDITABLE: 'Archived job postings cannot be edited.',
  DEADLINE_IN_PAST: 'Deadline must be today or later.',
  DEADLINE_INVALID: 'Deadline must be a valid date (YYYY-MM-DD).',
  PUBLISHED_FIELDS_REQUIRED:
    'Published job posting requires description, requirements, benefits, location, employment type, and deadline',
  AUDIT_FAILED: 'The request could not be completed. Please try again.',
  NOT_FOUND: 'Job posting not found',
} as const;

/** Job types HR/Recruiter can choose (AC-JOB-01-04). */
export const JOB_EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Internship', 'Contract', 'Remote'] as const;
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

export const JOB_AUDIT_ACTIONS = ['create', 'update', 'delete'] as const;
export type JobAuditAction = (typeof JOB_AUDIT_ACTIONS)[number];
