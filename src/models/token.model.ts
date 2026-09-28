import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export const authTokenTypes = ['email_verification', 'password_reset'] as const;
export type AuthTokenType = (typeof authTokenTypes)[number];

export const authTokenStatuses = ['pending', 'used', 'revoked'] as const;
export type AuthTokenStatus = (typeof authTokenStatuses)[number];

export interface AuthTokenData {
  user_id: Types.ObjectId;
  type: AuthTokenType;
  token_hash: string;
  status?: AuthTokenStatus;
  expires_at: Date;
  consumed_at?: Date;
}

const tokenSchema = new Schema<AuthTokenData>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: authTokenTypes,
      required: true,
      index: true,
    },
    token_hash: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: authTokenStatuses,
      default: 'pending',
      index: true,
    },
    expires_at: {
      type: Date,
      required: true,
    },
    consumed_at: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: 'tokens',
  },
);

tokenSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
tokenSchema.index({ token_hash: 1, type: 1 });
tokenSchema.index({ user_id: 1, type: 1, status: 1 });

export const Token = model('Token', tokenSchema);
export type TokenDoc = ReturnType<typeof Token.prototype.toObject> & {
  _id: Types.ObjectId;
};
