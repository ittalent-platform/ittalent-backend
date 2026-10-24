export const AVATAR_PREFIX = 'avatar';
export const PROFILE_MESSAGES = {
  AUTH_REQUIRED: 'Authentication required',
  NOT_FOUND: 'Profile not found',
  NO_CHANGES: 'At least one field must be provided',
  VERSION_CONFLICT: 'The account changed. Reload and try again.',
  EMAIL_NOT_VERIFIED: 'Email verification is required for this operation',
  ACCOUNT_INACTIVE: 'An active account is required for this operation',
  PROFILE_ACCESS_DENIED: 'Profile access is not available for the current account state',
  STORAGE_OWNERSHIP_MISMATCH: 'Avatar upload ownership could not be verified',
} as const;

export const PROFILE_ERROR_CODES = {
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  ACCOUNT_BLOCKED: 'ACCOUNT_BLOCKED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  STORAGE_OWNERSHIP_MISMATCH: 'STORAGE_OWNERSHIP_MISMATCH',
} as const;
