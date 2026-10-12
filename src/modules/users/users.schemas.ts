import { z } from 'zod';

import { userRoles, userStatuses } from '../../models/user.model.js';
import { paginatedResponseSchema, paginationQueryShape } from '../../shared/schemas/pagination.schemas.js';
import {
  EMPLOYEE_ROLES,
  USER_DEFAULT_SORT,
  USER_EDITABLE_ROLES,
  USER_EMAIL_MAX_LENGTH,
  USER_FILTER_MAX_VALUES,
  USER_FULL_NAME_LENGTH,
  USER_LIST_SEARCH_MAX_LENGTH,
  USER_MANAGED_ROLES,
  USER_MESSAGES,
  USER_PHONE_NOISE,
  USER_PHONE_PATTERN,
  USER_SORT_FIELDS,
  USER_SORT_ORDERS,
  USER_STATUS_REASON_MAX_LENGTH,
  USER_STATUS_REASON_MIN_LENGTH,
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
  statusReason: z.string().nullable().optional(),
  statusUpdatedAt: z.string().nullable().optional(),
  statusUpdatedBy: z.string().nullable().optional(),
  enterpriseName: z.string().nullable().optional(),
  invitation: z
    .object({
      status: z.enum(['pending', 'accepted', 'revoked', 'cancelled', 'expired']),
      deliveryStatus: z.enum(['pending', 'sent', 'failed']),
      expiresAt: z.string().datetime(),
      sentAt: z.string().datetime().nullable().optional(),
    })
    .nullable()
    .optional(),
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

// UC-USER-01 / UC-EMP-04 / UC-EMP-07: administration & employee directory list.
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

// Fail-closed projection guard (UC-USER-01.EX.4 / UC-USER-02.EX.5 / BR-EMP-16)
export const strictUserDtoSchema = userDtoSchema.strict();

const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(USER_PHONE_NOISE, ''))
  .refine((value) => value === '' || USER_PHONE_PATTERN.test(value), USER_MESSAGES.INVALID_PHONE)
  .transform((value) => (value === '' ? null : value));

// UC-11 / UC-EMP-02: Update employee information
export const updateUserBodySchema = z
  .strictObject({
    fullName: z
      .string()
      .trim()
      .min(USER_FULL_NAME_LENGTH.min, `Full name must be at least ${USER_FULL_NAME_LENGTH.min} characters`)
      .max(USER_FULL_NAME_LENGTH.max, `Full name cannot exceed ${USER_FULL_NAME_LENGTH.max} characters`)
      .optional(),
    phone: phoneSchema.nullable().optional(),
    expectedVersion: z.number().int().nonnegative().optional(),
  });

export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;

// UC-10 / UC-EMP-01: Create employee account
export const createEmployeeBodySchema = z.strictObject({
  fullName: z
    .string()
    .trim()
    .min(USER_FULL_NAME_LENGTH.min, `Full name must be at least ${USER_FULL_NAME_LENGTH.min} characters`)
    .max(USER_FULL_NAME_LENGTH.max, `Full name cannot exceed ${USER_FULL_NAME_LENGTH.max} characters`),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Invalid corporate email address')
    .max(USER_EMAIL_MAX_LENGTH, `Email cannot exceed ${USER_EMAIL_MAX_LENGTH} characters`),
  phone: z
    .string()
    .trim()
    .transform((value) => value.replace(USER_PHONE_NOISE, ''))
    .refine((value) => value === '' || USER_PHONE_PATTERN.test(value), USER_MESSAGES.INVALID_PHONE)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional(),
  role: z.enum(EMPLOYEE_ROLES).default('recruiter'),
  enterpriseId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid enterprise ID format')
    .optional(),
  status: z.enum(['active', 'inactive']).default('active').optional(),
});

export type CreateEmployeeBody = z.infer<typeof createEmployeeBodySchema>;

// UC-12 / UC-EMP-03: Update employee status (reason mandatory when suspending)
export const updateUserStatusBodySchema = z
  .strictObject({
    status: z.enum(['active', 'suspended', 'inactive']),
    reason: z.string().trim().max(USER_STATUS_REASON_MAX_LENGTH).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'suspended' && (!data.reason || data.reason.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: USER_MESSAGES.REASON_REQUIRED,
      });
    }
  });

export type UpdateUserStatusBody = z.infer<typeof updateUserStatusBodySchema>;

// UC-15 / UC-EMP-06: View employee history
export const userHistoryItemSchema = z.object({
  id: z.string(),
  action: z.string(),
  description: z.string(),
  timestamp: z.string(),
  actorId: z.string().nullable().optional(),
  actorName: z.string().nullable().optional(),
});

export type UserHistoryItemDTO = z.infer<typeof userHistoryItemSchema>;

export const userHistoryResponseSchema = z.object({
  items: z.array(userHistoryItemSchema),
});

export type UserHistoryResponse = z.infer<typeof userHistoryResponseSchema>;

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
