import { z } from 'zod';

import { passwordSchema } from '../auth/auth.schemas.js';

const INVITATION_TOKEN_LENGTH = 64;
export const existingRecruiterInvitationSchema = z.strictObject({ enterpriseId: z.string().regex(/^[0-9a-fA-F]{24}$/) });
export const acceptNewAccountInvitationSchema = z.strictObject({ token: z.string().length(INVITATION_TOKEN_LENGTH), password: passwordSchema });
export const acceptExistingAccountInvitationSchema = z.strictObject({ token: z.string().length(INVITATION_TOKEN_LENGTH) });
export type AcceptNewAccountInvitationBody = z.infer<typeof acceptNewAccountInvitationSchema>;
export type AcceptExistingAccountInvitationBody = z.infer<typeof acceptExistingAccountInvitationSchema>;
