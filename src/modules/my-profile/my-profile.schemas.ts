import { z } from 'zod';

import { userDtoSchema, updateUserBodySchema } from '../users/users.schemas.js';
import { PROFILE_MESSAGES } from './my-profile.constants.js';

export const myProfileSchema = userDtoSchema.extend({
  avatarUrl: z.string().url().nullable(),
  hasPassword: z.boolean(),
});
export type MyProfile = z.infer<typeof myProfileSchema>;

export const updateMyProfileSchema = updateUserBodySchema.omit({ expectedVersion: true }).refine(
  (value) => value.fullName !== undefined || value.phone !== undefined,
  PROFILE_MESSAGES.NO_CHANGES,
);
export type UpdateMyProfile = z.infer<typeof updateMyProfileSchema>;
