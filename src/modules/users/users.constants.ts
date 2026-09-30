export const USER_LIST_SEARCH_MAX_LENGTH = 100;

// Columns an administrator may sort by (UC-USER-01). `id` sorts by the account identifier.
export const USER_SORT_FIELDS = ['createdAt', 'id', 'name', 'username', 'email'] as const;
export type UserSortField = (typeof USER_SORT_FIELDS)[number];
export const USER_SORT_ORDERS = ['asc', 'desc'] as const;
export type UserSortOrder = (typeof USER_SORT_ORDERS)[number];
export const USER_DEFAULT_SORT: { sortBy: UserSortField; sortOrder: UserSortOrder } = { sortBy: 'createdAt', sortOrder: 'desc' };
export const USER_SORT_COLUMNS: Record<UserSortField, string> = {
  createdAt: 'createdAt',
  id: '_id',
  // `name` is the display name: the full name, or the username when there is none (handled in the repository).
  name: 'name',
  username: 'username',
  email: 'email',
};

export const USER_FULL_NAME_LENGTH = { min: 2, max: 100 } as const;
// Digits with an optional leading +; spaces, dots, dashes and brackets typed by the user are removed first.
export const USER_PHONE_PATTERN = /^\+?\d{9,15}$/;
export const USER_PHONE_NOISE = /[\s().-]/g;
export const USER_EDITABLE_ROLES = ['admin', 'user'] as const;

export const USER_MESSAGES = {
  NO_CHANGES: 'Provide at least one field to update',
  INVALID_PHONE: 'Enter a valid mobile number (9–15 digits, optional leading +)',
  SELF_ROLE_CHANGE: "You can't change your own role",
  NOT_FOUND: 'User not found',
  STORE_UNAVAILABLE: 'Unable to load user accounts right now. Please try again later.',
  PROJECTION_FAILED: 'Unable to prepare user account data.',
} as const;

export const USER_LOG_TAGS = {
  STORE_ERROR: '[users:store:error]',
  PROJECTION_ERROR: '[users:projection:error]',
} as const;
