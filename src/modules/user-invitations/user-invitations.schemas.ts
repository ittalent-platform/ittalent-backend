import { z } from 'zod';

import { passwordSchema } from '../auth/auth.schemas.js';
import { USER_FULL_NAME_LENGTH, USER_INVITATION_TOKEN_LENGTH, USER_PHONE_NOISE, USER_PHONE_PATTERN, USER_STATUS_REASON_MAX_LENGTH, USER_STATUS_REASON_MIN_LENGTH, USER_MESSAGES } from '../users/users.constants.js';
import { userIdParamSchema } from '../users/users.schemas.js';

export const acceptNewAccountInvitationSchema = z.strictObject({ token: z.string().length(USER_INVITATION_TOKEN_LENGTH), password: passwordSchema });
export const invitationPreviewQuerySchema = z.strictObject({ token: z.string().length(USER_INVITATION_TOKEN_LENGTH) });
export const invitationUserParamSchema = userIdParamSchema;
export const invitationIdParamSchema = userIdParamSchema;
const ADMIN_USERNAME_LENGTH = { min: 3, max: 30 } as const;
export const createAdminUserBodySchema = z.strictObject({
  email: z.string().trim().email().toLowerCase(),
  username: z.string().trim().toLowerCase().min(ADMIN_USERNAME_LENGTH.min).max(ADMIN_USERNAME_LENGTH.max).regex(/^[a-z0-9_]+$/),
  fullName: z.string().trim().min(USER_FULL_NAME_LENGTH.min).max(USER_FULL_NAME_LENGTH.max),
  phone: z.string().trim().transform((value) => value.replace(USER_PHONE_NOISE, '')).refine((value) => value === '' || USER_PHONE_PATTERN.test(value), USER_MESSAGES.INVALID_PHONE).transform((value) => (value === '' ? null : value)).optional(),
  role: z.enum(['user', 'recruiter', 'enterprise_admin']),
  enterpriseId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
}).superRefine((body, ctx) => {
  if ((body.role === 'recruiter' || body.role === 'enterprise_admin') && !body.enterpriseId) ctx.addIssue({ code: 'custom', path: ['enterpriseId'], message: 'An active enterprise is required for an HR or Enterprise Administrator account' });
  if (body.role === 'user' && body.enterpriseId) ctx.addIssue({ code: 'custom', path: ['enterpriseId'], message: 'Candidate accounts cannot be assigned to an enterprise' });
});
export type CreateAdminUserBody = z.infer<typeof createAdminUserBodySchema>;
export const cancelInvitationBodySchema = z.strictObject({ reason: z.string().trim().min(USER_STATUS_REASON_MIN_LENGTH).max(USER_STATUS_REASON_MAX_LENGTH), expectedVersion: z.number().int().nonnegative() });
export type CancelInvitationBody = z.infer<typeof cancelInvitationBodySchema>;
export type AcceptNewAccountInvitationBody = z.infer<typeof acceptNewAccountInvitationSchema>;
export type InvitationPreviewQuery = z.infer<typeof invitationPreviewQuerySchema>;
