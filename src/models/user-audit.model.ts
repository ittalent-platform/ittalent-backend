import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export const userAuditActions = ['account_invited', 'profile_updated', 'status_suspended', 'status_reopened', 'invitation_accepted', 'email_change_requested', 'email_changed'] as const;
export type UserAuditAction = (typeof userAuditActions)[number];

export interface UserAuditData {
  target_user_id: Types.ObjectId;
  actor_user_id: Types.ObjectId;
  action: UserAuditAction;
  result: 'success';
  reason?: string;
  changes?: Record<string, string | null>;
  version: number;
  occurred_at: Date;
}

const userAuditSchema = new Schema<UserAuditData>(
  {
    target_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actor_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: userAuditActions, required: true },
    result: { type: String, enum: ['success'], required: true },
    reason: { type: String, trim: true },
    changes: { type: Schema.Types.Mixed },
    version: { type: Number, required: true },
    occurred_at: { type: Date, required: true, index: true },
  },
  { versionKey: false, collection: 'user_audits' },
);

userAuditSchema.index({ target_user_id: 1, occurred_at: -1, _id: -1 });

export const UserAudit = model('UserAudit', userAuditSchema);
export type UserAuditDoc = ReturnType<typeof UserAudit.prototype.toObject> & { _id: Types.ObjectId };
