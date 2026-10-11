import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export const userRoles = [
  'user',
  'admin',
  'recruiter',
  'enterprise_admin',
  'applicant',
  'interviewer',
] as const;
export type UserRole = (typeof userRoles)[number];

export const userStatuses = ['active', 'inactive', 'invited', 'suspended', 'blocked'] as const;
export type UserStatus = (typeof userStatuses)[number];

export interface UserData {
  email: string;
  username: string;
  role?: UserRole;
  status?: UserStatus;
  full_name?: string;
  phone?: string;
  email_verified?: boolean;
  auth_version?: number;
  version?: number;
  admin_lock_version?: number;
  identity_request_version?: number;
  createdAt?: Date;
  updatedAt?: Date;
  enterprise_id?: Types.ObjectId | null | undefined;
}

const userSchema = new Schema<UserData>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    role: {
      type: String,
      enum: userRoles,
      default: 'user',
      index: true,
    },
    status: {
      type: String,
      enum: userStatuses,
      default: 'active',
      index: true,
    },
    full_name: { type: String, trim: true },
    phone: { type: String, trim: true },
    email_verified: {
      type: Boolean,
      default: false,
      index: true,
    },
    auth_version: { type: Number, default: 0, required: true },
    version: { type: Number, default: 0, required: true },
    admin_lock_version: { type: Number, default: 0, required: true },
    identity_request_version: { type: Number, default: 0, required: true },
    enterprise_id: {
      type: Schema.Types.ObjectId,
      ref: 'Enterprise',
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'users',
  },
);

export const User = model('User', userSchema);
export type UserDoc = ReturnType<typeof User.prototype.toObject> & {
  _id: Types.ObjectId;
};
