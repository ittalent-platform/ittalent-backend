import { Types, type QueryFilter } from 'mongoose';

import {
  User,
  type UserData,
  type UserDoc,
  type UserRole,
  type UserStatus,
  type UserStatusHistoryEntry,
} from '../../models/user.model.js';
import { USER_PHONE_NOISE, USER_SORT_COLUMNS } from './users.constants.js';
import type { UpdateUserBody, UserListQuery } from './users.schemas.js';

export interface CreateUserData {
  email: string;
  username: string;
  full_name?: string | undefined;
  phone?: string | undefined;
  role?: UserRole | undefined;
  status?: UserStatus | undefined;
  email_verified?: boolean | undefined;
  enterprise_id?: Types.ObjectId | string | null | undefined;
}

// Allow-list of fields an administrator may read; credentials and tokens live in other collections.
const ADMIN_USER_FIELDS =
  'email username full_name phone role status email_verified enterprise_id status_reason status_updated_at status_updated_by status_history createdAt updatedAt';
const ADMIN_USER_PROJECTION = Object.fromEntries(ADMIN_USER_FIELDS.split(' ').map((field) => [field, 1]));

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class UsersRepository {
  async findPage(query: UserListQuery): Promise<{ items: UserDoc[]; total: number }> {
    const filter: QueryFilter<UserData> = {};

    if (query.role) {
      filter.role = query.role;
    }
    if (query.status) {
      filter.status = query.status;
    }
    if (query.emailVerified !== undefined) {
      // Accounts created before the field existed have no value and count as not verified.
      filter.email_verified = query.emailVerified ? true : { $ne: true };
    }
    if (query.enterpriseId) {
      filter.enterprise_id = new Types.ObjectId(query.enterpriseId);
    }
    if (query.search) {
      const pattern = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ username: pattern }, { email: pattern }, { full_name: pattern }];
      const digits = query.search.replace(USER_PHONE_NOISE, '');
      if (digits) filter.$or.push({ phone: new RegExp(escapeRegex(digits), 'i') });
    }

    const direction = query.sortOrder === 'asc' ? 1 : -1;

    const collation = { locale: 'en', strength: 2 } as const;
    const skip = (query.page - 1) * query.limit;
    const readPage = async (): Promise<UserDoc[]> => {
      if (query.sortBy === 'name') {
        const rows = await User.aggregate<Record<string, unknown>>([
          { $match: filter },
          { $addFields: { sort_name: { $ifNull: ['$full_name', '$username'] } } },
          { $sort: { sort_name: direction, _id: direction } },
          { $skip: skip },
          { $limit: query.limit },
          { $project: ADMIN_USER_PROJECTION },
        ]).collation(collation);
        return rows.map((row) => User.hydrate(row) as unknown as UserDoc);
      }
      return User.find(filter)
        .select(ADMIN_USER_FIELDS)
        .sort({ [USER_SORT_COLUMNS[query.sortBy]]: direction, _id: direction })
        .collation(collation)
        .skip(skip)
        .limit(query.limit)
        .exec();
    };
    const [items, total] = await Promise.all([
      readPage(),
      User.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async updateProfile(id: Types.ObjectId | string, patch: UpdateUserBody): Promise<UserDoc | null> {
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ''> = {};
    if (patch.fullName !== undefined) $set.full_name = patch.fullName;
    if (patch.role !== undefined) $set.role = patch.role;
    if (patch.phone === null) $unset.phone = '';
    else if (patch.phone !== undefined) $set.phone = patch.phone;
    return User.findByIdAndUpdate(
      id,
      { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) },
      { returnDocument: 'after' },
    ).exec();
  }

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
      ...(data.full_name ? { full_name: data.full_name } : {}),
      ...(data.phone ? { phone: data.phone } : {}),
      ...(data.role ? { role: data.role } : {}),
      ...(data.status ? { status: data.status } : {}),
      ...(data.email_verified !== undefined ? { email_verified: data.email_verified } : {}),
      ...(data.enterprise_id ? { enterprise_id: data.enterprise_id } : {}),
    });
    return user.save();
  }

  // Email verification activates the account and records the verified address (UC-AUTH verify / reset).
  async markEmailVerified(id: Types.ObjectId | string): Promise<UserDoc | null> {
    return User.findByIdAndUpdate(
      id,
      { $set: { status: 'active', email_verified: true } },
      { returnDocument: 'after' },
    ).exec();
  }

  async updateStatus(
    id: Types.ObjectId | string,
    status: UserStatus,
    adminId?: string,
    reason?: string,
  ): Promise<UserDoc | null> {
    const now = new Date();
    const adminObjectId = adminId ? new Types.ObjectId(adminId) : null;
    const historyEntry: UserStatusHistoryEntry | null = adminObjectId
      ? {
          status,
          changed_at: now,
          changed_by: adminObjectId,
          reason: reason ?? null,
        }
      : null;

    const $set: Record<string, unknown> = {
      status,
      status_updated_at: now,
      ...(adminObjectId ? { status_updated_by: adminObjectId } : {}),
      ...(reason !== undefined ? { status_reason: reason } : {}),
    };

    const updateQuery: Record<string, unknown> = { $set };
    if (historyEntry) {
      updateQuery.$push = { status_history: historyEntry };
    }

    return User.findByIdAndUpdate(id, updateQuery, { returnDocument: 'after' }).exec();
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

  async updateRole(
    id: Types.ObjectId | string,
    role: UserRole,
  ): Promise<UserDoc | null> {
    return User.findByIdAndUpdate(
      id,
      { $set: { role } },
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
