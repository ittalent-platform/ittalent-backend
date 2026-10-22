import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export const userRoles = [
  'user',
  'admin',
  'recruiter',
  'enterprise_admin',
  'applicant',
] as const;
export type UserRole = (typeof userRoles)[number];

export const userStatuses = ['active', 'inactive', 'invited', 'suspended', 'blocked'] as const;
export type UserStatus = (typeof userStatuses)[number];

export interface UserStatusHistoryEntry {
  status: UserStatus;
  changed_at: Date;
  changed_by: Types.ObjectId;
  reason?: string | null | undefined;
}

export interface UserData {
  email: string;
  username: string;
  role?: UserRole;
  status?: UserStatus;
  full_name?: string;
  phone?: string;
  avatar_url?: string | null;
  avatar_storage_key?: string | null;
  email_verified?: boolean;
  auth_version?: number;
  version?: number;
  admin_lock_version?: number;
  identity_request_version?: number;
  verification_started_at?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  enterprise_id?: Types.ObjectId | null | undefined;
  status_updated_at?: Date | null | undefined;
  status_updated_by?: Types.ObjectId | null | undefined;
  status_reason?: string | null | undefined;
  status_history?: UserStatusHistoryEntry[];
}

const statusHistorySchema = new Schema<UserStatusHistoryEntry>(
  {
    status: { type: String, enum: userStatuses, required: true },
    changed_at: { type: Date, required: true },
    changed_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, trim: true, default: null },
  },
  { _id: false },
);

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
    avatar_url: { type: String, trim: true, default: null },
    avatar_storage_key: { type: String, trim: true, default: null, select: false },
    email_verified: {
      type: Boolean,
      default: false,
      index: true,
    },
    auth_version: { type: Number, default: 0, required: true },
    version: { type: Number, default: 0, required: true },
    admin_lock_version: { type: Number, default: 0, required: true },
    identity_request_version: { type: Number, default: 0, required: true },
    // Restarted when an administrator reopens an unverified account; falls back to createdAt.
    verification_started_at: { type: Date },
    enterprise_id: {
      type: Schema.Types.ObjectId,
      ref: 'Enterprise',
      default: null,
      index: true,
    },
    status_updated_at: {
      type: Date,
      default: null,
    },
    status_updated_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status_reason: {
      type: String,
      trim: true,
      default: null,
    },
    status_history: {
      type: [statusHistorySchema],
      default: [],
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
