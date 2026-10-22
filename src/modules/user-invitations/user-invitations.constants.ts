import { TIME_MS } from '../../shared/constants/time.js';

export const USER_INVITATION_TTL_MS = TIME_MS.ONE_DAY;
export const USER_INVITATION_MESSAGES = {
  ONBOARDING_PENDING: 'Complete enterprise registration onboarding before inviting this account',
  INVALID: 'Invitation is invalid, expired, revoked, or already used',
  ACCOUNT_CONFLICT: 'The email address or username is already in use',
  INVALID_ACCEPTANCE: 'Invitation cannot be accepted by this account',
  COMPANY_UNAVAILABLE: 'The requested enterprise is missing or inactive',
  DELIVERY_FAILED: 'Account invitation is committed but email delivery failed',
} as const;
