export const USER_LIST_SEARCH_MAX_LENGTH = 100;

// Columns an administrator may sort by (UC-USER-01). `id` sorts by the account identifier.
export const USER_SORT_FIELDS = ['createdAt', 'id', 'username', 'email'] as const;
export type UserSortField = (typeof USER_SORT_FIELDS)[number];
export const USER_SORT_ORDERS = ['asc', 'desc'] as const;
export type UserSortOrder = (typeof USER_SORT_ORDERS)[number];
export const USER_DEFAULT_SORT: { sortBy: UserSortField; sortOrder: UserSortOrder } = { sortBy: 'createdAt', sortOrder: 'desc' };
export const USER_SORT_COLUMNS: Record<UserSortField, string> = {
  createdAt: 'createdAt',
  id: '_id',
  username: 'username',
  email: 'email',
};

export const USER_MESSAGES = {
  NOT_FOUND: 'User not found',
  STORE_UNAVAILABLE: 'Unable to load user accounts right now. Please try again later.',
  PROJECTION_FAILED: 'Unable to prepare user account data.',
} as const;

export const USER_LOG_TAGS = {
  STORE_ERROR: '[users:store:error]',
  PROJECTION_ERROR: '[users:projection:error]',
} as const;
