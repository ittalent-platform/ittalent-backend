import type { EnterpriseStatus } from '../../models/enterprise.model.js';

export const ENTERPRISE_MESSAGES = {
  NOT_FOUND: 'Enterprise not found',
} as const;

export const ENTERPRISE_CONFIG = {
  KEYWORD_MIN_LENGTH: 1,
  KEYWORD_MAX_LENGTH: 100,
} as const;

// BR-10/BR-11: only Active enterprises are publicly visible.
export const PUBLIC_ENTERPRISE_STATUS: EnterpriseStatus = 'active';