import { z } from 'zod';

import { userRoles, userStatuses } from '../../models/user.model.js';
import { paginatedResponseSchema, paginationQueryShape } from '../../shared/schemas/pagination.schemas.js';
import { USER_DEFAULT_SORT, USER_LIST_SEARCH_MAX_LENGTH, USER_SORT_FIELDS, USER_SORT_ORDERS } from './users.constants.js';

export const userIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID format'),
});

export type UserIdParam = z.infer<typeof userIdParamSchema>;

export const userDtoSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  username: z.string(),
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
