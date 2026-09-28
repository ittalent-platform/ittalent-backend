import type { Types } from 'mongoose';

import { User, type UserDoc, type UserStatus } from '../../models/user.model.js';

export interface CreateUserData {
  email: string;
  username: string;
  status?: UserStatus;
}

export class UsersRepository {
  async findById(id: string): Promise<UserDoc | null> {
    return User.findById(id).exec();
  }

  async findByEmail(email: string): Promise<UserDoc | null> {
    return User.findOne({ email }).exec();
  }

  async findByUsername(username: string): Promise<UserDoc | null> {
    return User.findOne({ username }).exec();
  }

  async findByIdentifier(identifier: string): Promise<UserDoc | null> {
    return User.findOne({
      $or: [{ email: identifier }, { username: identifier }],
    }).exec();
  }

  async existsByEmail(email: string): Promise<boolean> {
    const count = await User.countDocuments({ email }).exec();
    return count > 0;
  }

  async existsByUsername(username: string): Promise<boolean> {
    const count = await User.countDocuments({ username }).exec();
    return count > 0;
  }

  async createUser(data: CreateUserData): Promise<UserDoc> {
    const user = new User({
      email: data.email,
      username: data.username,
      ...(data.status ? { status: data.status } : {}),
    });
    return user.save();
  }

  async updateStatus(id: Types.ObjectId | string, status: UserStatus): Promise<UserDoc | null> {
    return User.findByIdAndUpdate(id, { $set: { status } }, { returnDocument: 'after' }).exec();
  }
}

export const usersRepository = new UsersRepository();
