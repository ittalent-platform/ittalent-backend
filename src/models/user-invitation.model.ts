import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export const userInvitationRoles = ['user', 'recruiter', 'enterprise_admin'] as const;
export type UserInvitationRole = (typeof userInvitationRoles)[number];
export const userInvitationStatuses = ['pending', 'accepted', 'revoked', 'cancelled', 'expired'] as const;
export type UserInvitationStatus = (typeof userInvitationStatuses)[number];
export const userInvitationKinds = ['new_account', 'enterprise_membership'] as const;
export type UserInvitationKind = (typeof userInvitationKinds)[number];

export interface UserInvitationData {
  target_user_id: Types.ObjectId;
  invited_by: Types.ObjectId;
  kind: UserInvitationKind;
  role: UserInvitationRole;
  enterprise_id?: Types.ObjectId | null;
  token_hash: string;
  status: UserInvitationStatus;
  expires_at: Date;
  accepted_at?: Date;
  revoked_at?: Date;
  delivery_status: 'pending' | 'sent' | 'failed';
  delivery_attempts: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const userInvitationSchema = new Schema<UserInvitationData>(
  {
    target_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    invited_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: userInvitationKinds, required: true },
    role: { type: String, enum: userInvitationRoles, required: true },
    enterprise_id: { type: Schema.Types.ObjectId, ref: 'Enterprise', default: null },
    token_hash: { type: String, required: true, select: false, unique: true },
    status: { type: String, enum: userInvitationStatuses, required: true, default: 'pending', index: true },
    expires_at: { type: Date, required: true },
    accepted_at: Date,
    revoked_at: Date,
    delivery_status: { type: String, enum: ['pending', 'sent', 'failed'], required: true, default: 'pending' },
    delivery_attempts: { type: Number, required: true, default: 0 },
  },
  { timestamps: true, collection: 'user_invitations' },
);

userInvitationSchema.index({ target_user_id: 1, status: 1 });
userInvitationSchema.index({ target_user_id: 1, createdAt: -1, _id: -1 });
userInvitationSchema.index({ expires_at: 1 });

export const UserInvitation = model('UserInvitation', userInvitationSchema);
export type UserInvitationDoc = ReturnType<typeof UserInvitation.prototype.toObject> & { _id: Types.ObjectId };
