import type { ApplicationStatus } from '../../models/application.model.js';
import type { InterviewStatus } from '../../models/interview.model.js';
import type { UserRole } from '../../models/user.model.js';

// Only a recruiter (HR) schedules, reads, changes and deletes the interviews of their enterprise. An interviewer is
// also a recruiter, of the same enterprise.
export const INTERVIEW_MANAGER_ROLE: UserRole = 'recruiter';
// Interviewers and applicants must have an active account.
export const ACTIVE_USER_STATUS = 'active';

// An interview can be scheduled while the application is still in play. The application status is not changed.
export const SCHEDULABLE_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  'submitted',
  'under_review',
  'interviewing',
];

export const INTERVIEW_INITIAL_STATUS: InterviewStatus = 'scheduled';
export const INTERVIEW_EDITABLE_STATUS: InterviewStatus = 'scheduled';
export const INTERVIEW_COMPLETED_STATUS: InterviewStatus = 'completed';
// Statuses that say "the interview took place (or the applicant did not come)". They cannot be set before the
// interview has ended. Cancelling is allowed at any time while the interview is still scheduled.
export const TIME_GATED_STATUSES: readonly InterviewStatus[] = ['completed', 'no_show'];
// Statuses a recruiter can move a scheduled interview to.
export const SETTABLE_STATUSES = ['completed', 'cancelled', 'no_show'] as const satisfies readonly InterviewStatus[];

export const INTERVIEW_SORT_FIELDS = ['scheduledAt', 'createdAt', 'status'] as const;
export type InterviewSortField = (typeof INTERVIEW_SORT_FIELDS)[number];
export const INTERVIEW_SORT_ORDERS = ['asc', 'desc'] as const;
export type InterviewSortOrder = (typeof INTERVIEW_SORT_ORDERS)[number];
export const INTERVIEW_SORT_COLUMNS: Record<InterviewSortField, string> = {
  scheduledAt: 'scheduled_at',
  createdAt: 'createdAt',
  status: 'status',
};

export const INTERVIEW_CONFIG = {
  MIN_DURATION_MINUTES: 15,
  MAX_DURATION_MINUTES: 480,
  DEFAULT_DURATION_MINUTES: 60,
  MAX_INTERVIEWERS: 10,
  MEETING_LINK_MAX_LENGTH: 2048,
  LOCATION_MAX_LENGTH: 255,
  NOTES_MAX_LENGTH: 2000,
  NOTE_MAX_LENGTH: 500,
  KEYWORD_MIN_LENGTH: 1,
  KEYWORD_MAX_LENGTH: 100,
  STATUS_FILTER_SEPARATOR: ',',
  // The calendar view returns every interview in the window, so the window and the result are bounded.
  CALENDAR_MAX_RANGE_DAYS: 62,
  CALENDAR_MAX_ITEMS: 500,
  // Upper bound on users/jobs a search keyword may resolve to before it is applied to the interviews.
  SEARCH_MATCH_LIMIT: 200,
  MS_PER_MINUTE: 60_000,
  MS_PER_DAY: 86_400_000,
} as const;

export const INTERVIEW_MESSAGES = {
  AUTH_REQUIRED: 'Authentication required',
  RECRUITER_ONLY: 'Only recruiters can schedule and manage interviews',
  NO_ENTERPRISE: 'Your account is not assigned to an enterprise',
  NOT_FOUND: 'Interview not found',
  APPLICATION_NOT_FOUND: 'Application not found',
  APPLICATION_NOT_SCHEDULABLE: 'Interviews can only be scheduled for submitted, under review or interviewing applications',
  APPLICANT_UNAVAILABLE: 'The applicant account is not available',
  INVALID_INTERVIEWERS: 'Every interviewer must be an active recruiter of your enterprise',
  TIME_IN_PAST: 'The interview time must be in the future',
  ONLINE_LINK_REQUIRED: 'An online interview needs a meeting link',
  ONSITE_LOCATION_REQUIRED: 'An onsite interview needs a location',
  INTERVIEWER_CONFLICT: 'An interviewer already has an interview during this time',
  APPLICANT_CONFLICT: 'The applicant already has an interview during this time',
  NOT_EDITABLE: 'Only a scheduled interview can be changed',
  ALREADY_FINAL: 'The interview status is final and cannot be changed',
  NOT_ENDED: 'An interview can only be marked completed or no-show once it has ended',
  STATE_CHANGED: 'The interview changed before this request could be applied',
  COMPLETED_NOT_DELETABLE: 'A completed interview cannot be deleted',
  INVALID_STATUS_FILTER: 'Status filter must be a comma-separated list of supported interview statuses',
  INVALID_MEETING_LINK: 'Meeting link must be a valid https URL',
  DUPLICATE_INTERVIEWERS: 'Interviewers must not be repeated',
  EMPTY_UPDATE: 'Provide at least one field to update',
  RANGE_ORDER: 'from must not be later than to',
  CALENDAR_RANGE_TOO_LARGE: `The calendar window cannot be longer than ${INTERVIEW_CONFIG.CALENDAR_MAX_RANGE_DAYS} days`,
} as const;

export const INTERVIEW_ERROR_CODES = {
  APPLICATION_NOT_SCHEDULABLE: 'APPLICATION_NOT_SCHEDULABLE',
  APPLICANT_UNAVAILABLE: 'APPLICANT_UNAVAILABLE',
  INVALID_INTERVIEWERS: 'INVALID_INTERVIEWERS',
  TIME_IN_PAST: 'INTERVIEW_TIME_IN_PAST',
  INTERVIEWER_CONFLICT: 'INTERVIEWER_CONFLICT',
  APPLICANT_CONFLICT: 'APPLICANT_CONFLICT',
  NOT_EDITABLE: 'INTERVIEW_NOT_EDITABLE',
  ALREADY_FINAL: 'INTERVIEW_STATUS_FINAL',
  NOT_ENDED: 'INTERVIEW_NOT_ENDED',
  STATE_CHANGED: 'INTERVIEW_STATE_CHANGED',
  COMPLETED_NOT_DELETABLE: 'INTERVIEW_COMPLETED',
} as const;

export const INTERVIEW_EMAIL_FAILED_LOG = '[interviews:email:error]';
export const INTERVIEW_EMAIL_FALLBACKS = { COMPANY_NAME: 'the company', JOB_TITLE: 'the position' } as const;
