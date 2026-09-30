import { z } from 'zod';

import { userRoles, userStatuses } from '../../models/user.model.js';
import { paginatedResponseSchema, paginationQueryShape } from '../../shared/schemas/pagination.schemas.js';
import {
  USER_DEFAULT_SORT,
  USER_EDITABLE_ROLES,
  USER_FULL_NAME_LENGTH,
  USER_LIST_SEARCH_MAX_LENGTH,
  USER_MESSAGES,
  USER_PHONE_NOISE,
  USER_PHONE_PATTERN,
  USER_SORT_FIELDS,
  USER_SORT_ORDERS,
} from './users.constants.js';

export const userIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID format'),
});

export type UserIdParam = z.infer<typeof userIdParamSchema>;

export const userDtoSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  username: z.string(),
  fullName: z.string().nullable(),
  phone: z.string().nullable(),
  role: z.string(),
  status: z.string(),
  emailVerified: z.boolean(),
  enterpriseId: z.string().nullable(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type UserDTO = z.infer<typeof userDtoSchema>;

// UC-USER-01: administration list. Default order is newest first; `sortBy` is limited to a whitelist.
export const userListQuerySchema = z.strictObject({
  ...paginationQueryShape,
  search: z
    .string()
    .trim()
    .min(1, 'Search value must not be empty')
    .max(USER_LIST_SEARCH_MAX_LENGTH, `Search value cannot exceed ${USER_LIST_SEARCH_MAX_LENGTH} characters`)
    .optional(),
  role: z.enum(userRoles).optional(),
  status: z.enum(userStatuses).optional(),
  emailVerified: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  sortBy: z.enum(USER_SORT_FIELDS).default(USER_DEFAULT_SORT.sortBy),
  sortOrder: z.enum(USER_SORT_ORDERS).default(USER_DEFAULT_SORT.sortOrder),
});

export type UserListQuery = z.infer<typeof userListQuerySchema>;

export const userListResponseSchema = paginatedResponseSchema(userDtoSchema);

// Fail-closed projection guard (UC-USER-01.EX.4 / UC-USER-02.EX.5): a result must match this exact shape.
export const strictUserDtoSchema = userDtoSchema.strict();

// UC-USER-03: an administrator edits a user's personal details and role. Email and status are not editable here.
export const updateUserBodySchema = z
  .strictObject({
    fullName: z
      .string()
      .trim()
      .min(USER_FULL_NAME_LENGTH.min, `Full name must be at least ${USER_FULL_NAME_LENGTH.min} characters`)
      .max(USER_FULL_NAME_LENGTH.max, `Full name cannot exceed ${USER_FULL_NAME_LENGTH.max} characters`)
      .optional(),
    // null (or an empty string) clears the number.
    phone: z
      .string()
      .trim()
      .transform((value) => value.replace(USER_PHONE_NOISE, ''))
      .refine((value) => value === '' || USER_PHONE_PATTERN.test(value), USER_MESSAGES.INVALID_PHONE)
      .transform((value) => (value === '' ? null : value))
      .nullable()
      .optional(),
    role: z.enum(USER_EDITABLE_ROLES).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, USER_MESSAGES.NO_CHANGES);

export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;
