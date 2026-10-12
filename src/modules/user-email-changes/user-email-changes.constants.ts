import { TIME_MS } from '../../shared/constants/time.js';

export const USER_EMAIL_CHANGE_TTL_MS = TIME_MS.ONE_DAY;
export const USER_EMAIL_CHANGE_MESSAGES = {
  EMAIL_CONFLICT: 'The requested email is already in use',
  CURRENT_PASSWORD: 'The account owner must confirm with the current password',
  INVALID_REQUEST: 'Email-change request is invalid, expired, revoked, or already used',
  DELIVERY_FAILED: 'The request was recorded but delivery to the new email failed',
} as const;
