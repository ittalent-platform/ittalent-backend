import type { Types } from 'mongoose';

import { User, type UserDoc, type UserRole, type UserStatus } from '../../models/user.model.js';

export interface CreateUserData {
  email: string;
  username: string;
  status?: UserStatus;
  enterprise_id?: Types.ObjectId | string | null | undefined;
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
      ...(data.enterprise_id ? { enterprise_id: data.enterprise_id } : {}),
    });
    return user.save();
  }

  async updateStatus(id: Types.ObjectId | string, status: UserStatus): Promise<UserDoc | null> {
    return User.findByIdAndUpdate(id, { $set: { status } }, { returnDocument: 'after' }).exec();
  }

  async updateEnterpriseId(
    id: Types.ObjectId | string,
    enterpriseId: Types.ObjectId | string | null,
  ): Promise<UserDoc | null> {
    return User.findByIdAndUpdate(
      id,
      { $set: { enterprise_id: enterpriseId } },
      { returnDocument: 'after' },
    ).exec();
  }

  async findRecruitersByEnterpriseId(enterpriseId: Types.ObjectId | string): Promise<UserDoc[]> {
    return User.find({ enterprise_id: enterpriseId, role: 'recruiter' }).exec();
  }

  async blockExpiredInactiveUsers(cutoff: Date, excludedRoles: UserRole[] = ['admin']): Promise<number> {
    const result = await User.updateMany(
      {
        status: 'inactive',
        role: { $nin: excludedRoles },
        createdAt: { $lte: cutoff },
      },
      {
        $set: { status: 'blocked' },
      },
    ).exec();
    return result.modifiedCount;
  }
}

export const usersRepository = new UsersRepository();
