import type { UserStatus } from '../../models/user.model.js';

export const USER_LIST_SEARCH_MAX_LENGTH = 100;
export const USER_LIST_SEARCH_MIN_LENGTH = 2;

// Columns an administrator may sort by (UC-USER-01). `id` sorts by the account identifier.
export const USER_SORT_FIELDS = ['createdAt', 'id', 'name', 'username', 'email'] as const;
export type UserSortField = (typeof USER_SORT_FIELDS)[number];
export const USER_SORT_ORDERS = ['asc', 'desc'] as const;
export type UserSortOrder = (typeof USER_SORT_ORDERS)[number];
export const USER_DEFAULT_SORT: { sortBy: UserSortField; sortOrder: UserSortOrder } = { sortBy: 'createdAt', sortOrder: 'desc' };
export const USER_SORT_COLUMNS: Record<UserSortField, string> = {
  createdAt: 'createdAt',
  id: '_id',
  name: 'name',
  username: 'username',
  email: 'email',
};

export const USER_FULL_NAME_LENGTH = { min: 2, max: 100 } as const;
export const USER_INVITATION_TOKEN_LENGTH = 64;
export const USER_STATUS_REASON_MIN_LENGTH = 10;
export const USER_STATUS_REASON_MAX_LENGTH = 500;
export const USER_FILTER_MAX_VALUES = 10;
// Vietnamese mobile number: 10 digits, starts with 0 and a valid carrier prefix (03, 05, 07, 08, 09).
export const USER_PHONE_PATTERN = /^0[35789]\d{8}$/;
export const USER_PHONE_NOISE = /[\s().-]/g;
export const USER_EMAIL_MAX_LENGTH = 254;
export const USER_EDITABLE_ROLES = ['admin', 'user', 'recruiter', 'enterprise_admin'] as const;
export const EMPLOYEE_ROLES = ['recruiter'] as const;
export const USER_MANAGED_ROLES = ['recruiter', 'enterprise_admin'] as const;

export const VALID_USER_STATUS_TRANSITIONS: Record<UserStatus, readonly UserStatus[]> = {
  active: ['suspended', 'inactive'],
  inactive: ['active', 'suspended', 'blocked'],
  invited: ['active', 'suspended', 'inactive'],
  suspended: ['active', 'inactive'],
  blocked: [],
};

export const USER_MESSAGES = {
  NO_CHANGES: 'Provide at least one field to update',
  INVALID_PHONE: 'Enter a valid Vietnamese mobile number (10 digits, starting with 0)',
  SELF_ROLE_CHANGE: "You can't change your own role",
  NOT_FOUND: 'User not found',
  STORE_UNAVAILABLE: 'Unable to load user accounts right now. Please try again later.',
  PROJECTION_FAILED: 'Unable to prepare user account data.',
  EMAIL_EXISTS: 'This email address is already registered in the system',
  SELF_SUSPENSION: 'Cannot suspend your own account',
  TENANCY_FORBIDDEN: 'Access denied: insufficient permissions to manage this employee account',
  NO_ENTERPRISE: 'Caller does not belong to any enterprise',
  INVALID_STATUS_TRANSITION: 'Invalid status transition',
  INVALID_TRANSITION: 'Unsupported account status transition',
  LAST_ADMIN: 'The final active System Administrator cannot be suspended',
  LAST_ENTERPRISE_ADMIN: 'Activate another Enterprise Administrator before changing this account',
  REASON_REQUIRED: 'A justification reason is required when suspending an account',
  ADMIN_CREATE_RESTRICTED: 'Enterprise administrators cannot create system administrators',
  EMAIL_IMMUTABLE: 'Email address cannot be modified',
  VERSION_CONFLICT: 'The account changed. Reload and try again.',
} as const;

// `$dateToString` format that groups accounts by the calendar day they were created on.
export const USER_LOCAL_DAY_FORMAT = '%Y-%m-%d';
// Accounts saved before `status` existed count as active, as the schema default does for new ones.
export const USER_DEFAULT_STATUS: UserStatus = 'active';

export const USER_LOG_TAGS = {
  STORE_ERROR: '[users:store:error]',
  PROJECTION_ERROR: '[users:projection:error]',
} as const;
