export const USER_LIST_SEARCH_MAX_LENGTH = 100;

export const USER_MESSAGES = {
  NOT_FOUND: 'User not found',
  STORE_UNAVAILABLE: 'Unable to load user accounts right now. Please try again later.',
  PROJECTION_FAILED: 'Unable to prepare user account data.',
} as const;

export const USER_LOG_TAGS = {
  STORE_ERROR: '[users:store:error]',
  PROJECTION_ERROR: '[users:projection:error]',
} as const;
