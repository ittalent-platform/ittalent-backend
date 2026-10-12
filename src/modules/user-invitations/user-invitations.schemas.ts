import { z } from 'zod';

import { passwordSchema } from '../auth/auth.schemas.js';
import { USER_INVITATION_TOKEN_LENGTH } from '../users/users.constants.js';
import { userIdParamSchema } from '../users/users.schemas.js';

export const acceptNewAccountInvitationSchema = z.strictObject({ token: z.string().length(USER_INVITATION_TOKEN_LENGTH), password: passwordSchema });
export const invitationPreviewQuerySchema = z.strictObject({ token: z.string().length(USER_INVITATION_TOKEN_LENGTH) });
export const invitationUserParamSchema = userIdParamSchema;
export const invitationIdParamSchema = userIdParamSchema;
export type AcceptNewAccountInvitationBody = z.infer<typeof acceptNewAccountInvitationSchema>;
export type InvitationPreviewQuery = z.infer<typeof invitationPreviewQuerySchema>;
