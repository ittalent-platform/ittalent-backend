import { TIME_MS } from '../../shared/constants/time.js';

export const USER_AUDIT_MESSAGES = {
  NOT_FOUND: 'User not found',
  STORE_UNAVAILABLE: 'Unable to load account history right now. Please try again later.',
} as const;

export const USER_AUDIT_GROUPS = {
  account: ['account_invited', 'status_suspended', 'status_reopened', 'role_changed'],
  profile: ['profile_updated'],
  email: ['account_invited', 'invitation_accepted', 'invitation_revoked', 'email_change_requested', 'email_changed'],
} as const;
export type UserAuditGroup = keyof typeof USER_AUDIT_GROUPS;
export const USER_AUDIT_ACTORS = ['admin', 'self'] as const;
export const USER_AUDIT_MAX_RANGE_DAYS = 366;
export const USER_AUDIT_MAX_RANGE_MS = USER_AUDIT_MAX_RANGE_DAYS * TIME_MS.ONE_DAY;
