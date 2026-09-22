import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export const userRoles = ['user', 'admin'] as const;
export type UserRole = (typeof userRoles)[number];

export const userStatuses = ['active', 'inactive', 'suspended'] as const;
export type UserStatus = (typeof userStatuses)[number];

export interface UserData {
  email: string;
  username: string;
  role?: UserRole;
  status?: UserStatus;
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
