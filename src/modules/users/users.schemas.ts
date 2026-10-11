import { z } from 'zod';

import { userRoles, userStatuses } from '../../models/user.model.js';
import { paginatedResponseSchema, paginationQueryShape } from '../../shared/schemas/pagination.schemas.js';
import {
  EMPLOYEE_ROLES,
  USER_DEFAULT_SORT,
  USER_EDITABLE_ROLES,
  USER_EMAIL_MAX_LENGTH,
  USER_FULL_NAME_LENGTH,
  USER_LIST_SEARCH_MAX_LENGTH,
  USER_MESSAGES,
  USER_PHONE_NOISE,
  USER_PHONE_PATTERN,
  USER_SORT_FIELDS,
  USER_SORT_ORDERS,
  USER_STATUS_REASON_MAX_LENGTH,
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
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type UserDTO = z.infer<typeof userDtoSchema>;

// UC-USER-01 / UC-EMP-04 / UC-EMP-07: administration & employee directory list.
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
  enterpriseId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid enterprise ID format')
    .optional(),
  sortBy: z.enum(USER_SORT_FIELDS).default(USER_DEFAULT_SORT.sortBy),
  sortOrder: z.enum(USER_SORT_ORDERS).default(USER_DEFAULT_SORT.sortOrder),
});

export type UserListQuery = z.infer<typeof userListQuerySchema>;

export const userListResponseSchema = paginatedResponseSchema(userDtoSchema);

// Fail-closed projection guard (UC-USER-01.EX.4 / UC-USER-02.EX.5 / BR-EMP-16)
export const strictUserDtoSchema = userDtoSchema.strict();

// UC-11 / UC-EMP-02: Update employee information (status updates strictly forbidden here)
export const updateUserBodySchema = z
  .strictObject({
    fullName: z
      .string()
      .trim()
      .min(USER_FULL_NAME_LENGTH.min, `Full name must be at least ${USER_FULL_NAME_LENGTH.min} characters`)
      .max(USER_FULL_NAME_LENGTH.max, `Full name cannot exceed ${USER_FULL_NAME_LENGTH.max} characters`)
      .optional(),
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
