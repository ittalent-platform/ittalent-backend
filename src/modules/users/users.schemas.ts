import { z } from 'zod';

import { userRoles, userStatuses } from '../../models/user.model.js';
import { paginatedResponseSchema, paginationQueryShape } from '../../shared/schemas/pagination.schemas.js';
import { USER_DEFAULT_SORT, USER_FULL_NAME_LENGTH, USER_LIST_SEARCH_MAX_LENGTH, USER_MANAGED_ROLES, USER_MESSAGES, USER_PHONE_NOISE, USER_PHONE_PATTERN, USER_SORT_FIELDS, USER_SORT_ORDERS, USER_STATUS_REASON_MAX_LENGTH, USER_STATUS_REASON_MIN_LENGTH, USER_FILTER_MAX_VALUES } from './users.constants.js';

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
  enterpriseName: z.string().nullable().optional(),
  invitation: z.object({ status: z.enum(['pending', 'accepted', 'revoked', 'cancelled', 'expired']), deliveryStatus: z.enum(['pending', 'sent', 'failed']), expiresAt: z.string().datetime(), sentAt: z.string().datetime().nullable().optional() }).nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  version: z.number().int().nonnegative().optional(),
});

export type UserDTO = z.infer<typeof userDtoSchema>;

// Filters accept repeated (`role=a&role=b`) or comma-separated (`role=a,b`) values, bounded to USER_FILTER_MAX_VALUES.
const multiValue = <T extends z.ZodType>(item: T): z.ZodOptional<z.ZodArray<T>> =>
  z.preprocess(
    (value) => (value === undefined ? undefined : (Array.isArray(value) ? value : [value]).flatMap((entry) => String(entry).split(',')).map((entry) => entry.trim()).filter(Boolean)),
    z.array(item).min(1).max(USER_FILTER_MAX_VALUES).optional(),
  ) as unknown as z.ZodOptional<z.ZodArray<T>>;

// UC-USER-01: administration list. Default order is newest first; `sortBy` is limited to a whitelist.
export const userListQuerySchema = z.strictObject({
  ...paginationQueryShape,
  search: z
    .string()
    .trim()
    .min(1, 'Search value must not be empty')
    .max(USER_LIST_SEARCH_MAX_LENGTH, `Search value cannot exceed ${USER_LIST_SEARCH_MAX_LENGTH} characters`)
    .optional(),
  role: multiValue(z.enum(userRoles)),
  status: multiValue(z.enum(userStatuses)),
  enterpriseId: multiValue(z.string().regex(/^[0-9a-fA-F]{24}$/)),
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

const phoneSchema = z.string().trim().transform((value) => value.replace(USER_PHONE_NOISE, '')).refine((value) => value === '' || USER_PHONE_PATTERN.test(value), USER_MESSAGES.INVALID_PHONE).transform((value) => (value === '' ? null : value));

export const updateUserBodySchema = z
  .strictObject({
    fullName: z.string().trim().min(USER_FULL_NAME_LENGTH.min, `Full name must be at least ${USER_FULL_NAME_LENGTH.min} characters`).max(USER_FULL_NAME_LENGTH.max, `Full name cannot exceed ${USER_FULL_NAME_LENGTH.max} characters`).optional(),
    phone: phoneSchema.nullable().optional(),
    expectedVersion: z.number().int().nonnegative(),
  });
export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;

export const updateUserEmailBodySchema = z.strictObject({
  newEmail: z.string().trim().email().toLowerCase(),
  expectedVersion: z.number().int().nonnegative(),
});
export type UpdateUserEmailBody = z.infer<typeof updateUserEmailBodySchema>;

export const statusUpdateBodySchema = z.strictObject({
  status: z.enum(['suspended', 'active']),
  reason: z.string().trim().min(USER_STATUS_REASON_MIN_LENGTH).max(USER_STATUS_REASON_MAX_LENGTH),
  expectedVersion: z.number().int().nonnegative(),
});
export type StatusUpdateBody = z.infer<typeof statusUpdateBodySchema>;

export const roleUpdateBodySchema = z.strictObject({
  role: z.enum(USER_MANAGED_ROLES),
  reason: z.string().trim().min(USER_STATUS_REASON_MIN_LENGTH).max(USER_STATUS_REASON_MAX_LENGTH),
  expectedVersion: z.number().int().nonnegative(),
});
export type RoleUpdateBody = z.infer<typeof roleUpdateBodySchema>;

export const emergencySuspensionBodySchema = z.strictObject({
  reason: z.string().trim().min(USER_STATUS_REASON_MIN_LENGTH).max(USER_STATUS_REASON_MAX_LENGTH),
  expectedVersion: z.number().int().nonnegative(),
});
export type EmergencySuspensionBody = z.infer<typeof emergencySuspensionBodySchema>;
