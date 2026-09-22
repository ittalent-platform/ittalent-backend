import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export const authProviders = ['local', 'google'] as const;
export type AuthProvider = (typeof authProviders)[number];

export interface AccountData {
  user_id: Types.ObjectId;
  provider: AuthProvider;
  provider_account_id?: string;
  password_hash?: string;
}

const accountSchema = new Schema<AccountData>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: authProviders,
      required: true,
    },
    provider_account_id: {
      type: String,
      trim: true,
    },
    password_hash: {
      type: String,
      select: false,
    },
  },
  {
    timestamps: true,
    collection: 'accounts',
  },
);

accountSchema.index({ provider: 1, provider_account_id: 1 }, { unique: true, sparse: true });
accountSchema.index({ user_id: 1, provider: 1 }, { unique: true });

export const Account = model('Account', accountSchema);
export type AccountDoc = ReturnType<typeof Account.prototype.toObject> & {
  _id: Types.ObjectId;
};
