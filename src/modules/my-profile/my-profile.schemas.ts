import { z } from 'zod';

import { userDtoSchema, updateUserBodySchema } from '../users/users.schemas.js';
import { PROFILE_MESSAGES } from './my-profile.constants.js';

export const basicMyProfileSchema = z.strictObject({
  access: z.literal('basic'),
  id: z.string(),
  email: z.string().email(),
  username: z.string(),
  fullName: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  role: z.string(),
  status: z.string(),
  emailVerified: z.boolean(),
});

export const fullMyProfileSchema = userDtoSchema.extend({
  access: z.literal('full'),
  avatarUrl: z.string().url().nullable(),
  hasPassword: z.boolean(),
  enterpriseId: z.string().nullable(),
  enterpriseName: z.string().nullable(),
});

export const myProfileSchema = z.discriminatedUnion('access', [
  basicMyProfileSchema,
  fullMyProfileSchema,
]);
export type MyProfile = z.infer<typeof myProfileSchema>;

export const updateMyProfileSchema = updateUserBodySchema
  .refine(
    (value): boolean => value.fullName !== undefined || value.phone !== undefined,
    PROFILE_MESSAGES.NO_CHANGES,
  );
export type UpdateMyProfile = z.infer<typeof updateMyProfileSchema>;
