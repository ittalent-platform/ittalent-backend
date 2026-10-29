export const PORTFOLIO_LINKS = {
  CANDIDATE_ROLE: 'user',
  INITIAL_VERSION: 1,
  TITLE_MAX_LENGTH: 200,
  DESCRIPTION_MAX_LENGTH: 1000,
  URL_MAX_LENGTH: 2048,
  KEYWORD_MAX_LENGTH: 100,
  IDEMPOTENCY_KEY_MAX_LENGTH: 128,
  MONGO_DUPLICATE_KEY_ERROR_CODE: 11_000,
} as const;

export const PORTFOLIO_LINK_MESSAGES = {
  CANDIDATE_REQUIRED: 'An active, verified Candidate account is required',
  IDEMPOTENCY_KEY_REQUIRED: 'A valid Idempotency-Key header is required',
  IDEMPOTENCY_KEY_REUSED: 'Idempotency-Key was already used with a different request',
  DUPLICATE_URL: 'A portfolio link with this URL already exists',
  STORE_UNAVAILABLE: 'Portfolio link storage is unavailable',
  NOT_FOUND: 'Portfolio link not found',
  VERSION_CONFLICT: 'This portfolio changed since it was loaded. Refresh and try again',
  NO_CHANGES: 'Provide at least one of title, url or description to update',
} as const;
