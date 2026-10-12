import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export type UserEmailChangeStatus = 'pending' | 'completed' | 'revoked';

export interface UserEmailChangeData {
  target_user_id: Types.ObjectId;
  requested_by: Types.ObjectId;
  current_email: string;
  new_email: string;
  token_hash: string;
  expected_version: number;
  status: UserEmailChangeStatus;
  expires_at: Date;
  completed_at?: Date;
  createdAt?: Date;
}

const userEmailChangeSchema = new Schema<UserEmailChangeData>(
  {
    target_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    requested_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    current_email: { type: String, required: true, trim: true, lowercase: true },
    new_email: { type: String, required: true, trim: true, lowercase: true },
    token_hash: { type: String, required: true, select: false, unique: true },
    expected_version: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'completed', 'revoked'], required: true, default: 'pending', index: true },
    expires_at: { type: Date, required: true },
    completed_at: Date,
  },
  { timestamps: true, collection: 'user_email_changes' },
);

userEmailChangeSchema.index({ target_user_id: 1, status: 1 });

export const UserEmailChange = model('UserEmailChange', userEmailChangeSchema);
