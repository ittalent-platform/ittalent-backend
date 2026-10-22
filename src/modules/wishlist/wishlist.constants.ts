import type { UserRole } from '../../models/user.model.js';

export const WISHLIST_CONFIG = {
  MAX_CAPACITY: 500,
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  KEYWORD_MAX_LENGTH: 100,
  LOCATION_MAX_LENGTH: 100,
  CLOSING_SOON_THRESHOLD_MS: 259_200_000, // 3 days (72 hours)
  MONGO_DUPLICATE_KEY_ERROR_CODE: 11000,
} as const;

export const CANDIDATE_ROLES: readonly UserRole[] = ['user', 'applicant'];

export const WISHLIST_STATUS_FILTERS = ['all', 'available', 'unavailable'] as const;
export type WishlistStatusFilter = (typeof WISHLIST_STATUS_FILTERS)[number];

export const WISHLIST_AVAILABILITY = {
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
} as const;
export type WishlistAvailability = (typeof WISHLIST_AVAILABILITY)[keyof typeof WISHLIST_AVAILABILITY];

export const WISHLIST_MESSAGES = {
  AUTH_REQUIRED: 'Authentication required',
  FORBIDDEN_ROLE: 'Saving jobs is for candidate accounts',
  JOB_NOT_FOUND: 'Job posting not found',
  JOB_CLOSED: 'This job is no longer open, so it can’t be saved',
  ENTERPRISE_INACTIVE: 'This job is no longer available',
  CAPACITY_EXCEEDED: 'Wishlist capacity limit reached (maximum 500 saved jobs)',
  SAVED_SUCCESS: 'Job added to wishlist successfully',
  UNSAVED_SUCCESS: 'Job removed from wishlist',
  ALREADY_SAVED: 'Already in your saved jobs',
} as const;
