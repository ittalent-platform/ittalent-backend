export const INTERVIEW_MESSAGES = {
  AUTH_REQUIRED: 'Authentication required',
  NOT_FOUND: 'Interview not found',
  RESPONSE_NOT_ALLOWED:
    'Only a scheduled interview awaiting a response can be answered.',
  RESPONSE_CONFLICT: 'Interview response changed before the request completed.',
  RESCHEDULE_FIELDS_REQUIRED:
    'A proposed date/time and reason are required to request rescheduling.',
} as const;

export const INTERVIEW_LIMITS = {
  REASON_MAX_LENGTH: 500,
} as const;
