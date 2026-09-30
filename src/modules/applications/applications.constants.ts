import type { ApplicationStatus } from '../../models/application.model.js';
import type { UserRole } from '../../models/user.model.js';

// In this codebase an Applicant is a user with the default `user` role.
export const APPLICANT_ROLE: UserRole = 'user';

export const APPLICATION_INITIAL_STATUS: ApplicationStatus = 'submitted';
export const APPLICATION_HIRED_STATUS: ApplicationStatus = 'hired';

// An applicant may apply again only after the previous application is Withdrawn or Rejected.
export const REAPPLY_ALLOWED_STATUSES: readonly ApplicationStatus[] = ['withdrawn', 'rejected'];

export const APPLICATION_CONFIG = {
  MESSAGE_MAX_LENGTH: 1000,
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
} as const;

export const APPLICATION_ERROR_CODES = {
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  ACCOUNT_NOT_ACTIVE: 'ACCOUNT_NOT_ACTIVE',
  JOB_UNAVAILABLE: 'JOB_UNAVAILABLE',
  POSITION_FILLED: 'POSITION_FILLED',
  INVALID_CV: 'INVALID_CV',
  INVALID_COVER_LETTER: 'INVALID_COVER_LETTER',
  ALREADY_APPLIED: 'ALREADY_APPLIED',
} as const;

export const APPLICATION_SUBMITTED_LABEL = 'Submitted';
export const APPLICATION_EMAIL_FAILED_LOG = '[applications:email:error]';