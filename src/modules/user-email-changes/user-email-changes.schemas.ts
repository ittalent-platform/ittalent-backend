import { z } from 'zod';

const USER_EMAIL_TOKEN_LENGTH = 64;

export const confirmUserEmailChangeSchema = z.strictObject({
  token: z.string().length(USER_EMAIL_TOKEN_LENGTH),
  currentPassword: z.string().min(1),
});
export type ConfirmUserEmailChangeBody = z.infer<typeof confirmUserEmailChangeSchema>;
