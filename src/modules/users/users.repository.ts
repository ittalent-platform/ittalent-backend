import { Types, type ClientSession, type QueryFilter } from 'mongoose';

import { User, type UserData, type UserDoc, type UserRole, type UserStatus } from '../../models/user.model.js';
import type { UserInvitationRole } from '../../models/user-invitation.model.js';
import { USER_PHONE_NOISE, USER_SORT_COLUMNS } from './users.constants.js';
import type { CreateAdminUserBody } from './users.schemas.js';
import type { RoleUpdateBody, UpdateUserBody, UserListQuery } from './users.schemas.js';

export interface CreateUserData {
  email: string;
  username: string;
  status?: UserStatus;
  enterprise_id?: Types.ObjectId | string | null | undefined;
}

export interface CreateManagedUserInput extends CreateAdminUserBody {
  enterprise_id: Types.ObjectId | null;
}

// Allow-list of fields an administrator may read; credentials and tokens live in other collections.
const ADMIN_USER_FIELDS = 'email username full_name phone role status email_verified enterprise_id version createdAt updatedAt';
const ADMIN_USER_PROJECTION = Object.fromEntries(ADMIN_USER_FIELDS.split(' ').map((field) => [field, 1]));

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class UsersRepository {
  async serializeIdentityRequests(id: Types.ObjectId, session: ClientSession): Promise<void> {
    // A shared user write makes concurrent token replacements conflict even when no pending token exists.
    const result = await User.updateOne({ _id: id }, { $inc: { identity_request_version: 1 } }, { session, timestamps: false }).exec();
    if (result.matchedCount !== 1) throw new Error('Identity request owner was not found');
  }

  async updateProfileVersioned(id: string, expectedVersion: number, patch: UpdateUserBody, session: ClientSession): Promise<UserDoc | null> {
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, string> = {};
    if (patch.fullName !== undefined) $set.full_name = patch.fullName;
    if (patch.phone === null) $unset.phone = '';
    else if (patch.phone !== undefined) $set.phone = patch.phone;
    const update: Record<string, unknown> = { $inc: { version: 1 } };
    if (Object.keys($set).length) update.$set = $set;
    if (Object.keys($unset).length) update.$unset = $unset;
    const versionFilter = expectedVersion === 0 ? { $or: [{ version: 0 }, { version: { $exists: false } }] } : { version: expectedVersion };
    return User.findOneAndUpdate({ _id: id, ...versionFilter }, update, { returnDocument: 'after', session, runValidators: true }).exec();
  }

  async transitionStatus(id: string, expectedVersion: number, status: UserStatus, session: ClientSession): Promise<UserDoc | null> {
    const versionFilter = expectedVersion === 0 ? { $or: [{ version: 0 }, { version: { $exists: false } }] } : { version: expectedVersion };
    if (status === 'active') {
      return User.findOneAndUpdate({ _id: id, ...versionFilter }, [{ $set: {
        status: { $cond: [{ $eq: ['$email_verified', true] }, 'active', 'inactive'] },
        verification_started_at: { $cond: [{ $eq: ['$email_verified', true] }, '$verification_started_at', '$$NOW'] },
        auth_version: { $add: [{ $ifNull: ['$auth_version', 0] }, 1] },
        version: { $add: [{ $ifNull: ['$version', 0] }, 1] },
      } }], { returnDocument: 'after', session, runValidators: true, updatePipeline: true }).exec();
    }
    return User.findOneAndUpdate({ _id: id, ...versionFilter }, { $set: { status }, $inc: { auth_version: 1, version: 1 } }, { returnDocument: 'after', session, runValidators: true }).exec();
  }

  async countActiveAdmins(session?: ClientSession): Promise<number> {
    const query = User.countDocuments({ role: 'admin', status: 'active' });
    if (session) query.session(session);
    return query.exec();
  }

  async countActiveEnterpriseAdmins(enterpriseId: Types.ObjectId, session: ClientSession): Promise<number> {
    return User.countDocuments({ role: 'enterprise_admin', status: 'active', enterprise_id: enterpriseId }).session(session).exec();
  }


  async transitionRole(id: string, body: RoleUpdateBody, session: ClientSession): Promise<UserDoc | null> {
    const versionFilter = body.expectedVersion === 0 ? { $or: [{ version: 0 }, { version: { $exists: false } }] } : { version: body.expectedVersion };
    return User.findOneAndUpdate(
      { _id: id, status: 'active', email_verified: true, role: { $in: ['recruiter', 'enterprise_admin'] }, enterprise_id: { $ne: null }, ...versionFilter },
      { $set: { role: body.role }, $inc: { auth_version: 1, version: 1 } },
      { returnDocument: 'after', session, runValidators: true },
    ).exec();
  }

  async acquireAdminMutationLock(actorId: Types.ObjectId, session: ClientSession): Promise<void> {
    const result = await User.updateMany(
      { role: 'admin', status: 'active' },
      { $inc: { admin_lock_version: 1 } },
      { session, timestamps: false },
    ).exec();
    if (result.matchedCount === 0) throw new Error(`Active administrator lock records missing for ${String(actorId)}`);
  }

  async createManagedUser(data: CreateManagedUserInput, session: ClientSession): Promise<UserDoc> {
    const user = new User({
      email: data.email,
      username: data.username,
      full_name: data.fullName,
      ...(data.phone ? { phone: data.phone } : {}),
      role: data.role,
      enterprise_id: data.enterprise_id,
      status: 'invited',
      email_verified: false,
      auth_version: 0,
      version: 0,
    });
    await user.save({ session });
    return user;
  }

  async findUserById(id: Types.ObjectId): Promise<UserDoc | null> {
    return User.findById(id).exec();
  }

  async existsByEmailOrUsername(email: string, username: string, session?: ClientSession): Promise<boolean> {
    const query = User.exists({ $or: [{ email }, { username }] });
    if (session) query.session(session);
    return Boolean(await query.exec());
  }

  async emailExists(email: string, exceptId?: Types.ObjectId): Promise<boolean> {
    return Boolean(await User.exists({ email, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).exec());
  }

  async updateEmailVersioned(id: Types.ObjectId, expectedVersion: number, newEmail: string, session: ClientSession): Promise<UserDoc | null> {
    const versionFilter = expectedVersion === 0 ? { $or: [{ version: 0 }, { version: { $exists: false } }] } : { version: expectedVersion };
    return User.findOneAndUpdate({ _id: id, ...versionFilter }, {
      $set: { email: newEmail, email_verified: true }, $inc: { version: 1, auth_version: 1 },
    }, { returnDocument: 'after', session, runValidators: true }).exec();
  }

  async findByIdWithSession(id: Types.ObjectId, session: ClientSession): Promise<UserDoc | null> {
    return User.findById(id).session(session).exec();
  }

  async updateNewAccountFromInvitation(id: Types.ObjectId, role: UserInvitationRole, enterpriseId: Types.ObjectId | null, expectedVersion: number, session: ClientSession): Promise<UserDoc | null> {
    const versionFilter = expectedVersion === 0 ? { $or: [{ version: 0 }, { version: { $exists: false } }] } : { version: expectedVersion };
    return User.findOneAndUpdate({ _id: id, status: 'invited', email_verified: false, ...versionFilter }, {
      $set: { role, enterprise_id: enterpriseId, status: 'active', email_verified: true }, $inc: { auth_version: 1, version: 1 },
    }, { returnDocument: 'after', session, runValidators: true }).exec();
  }

  async findPage(query: UserListQuery): Promise<{ items: UserDoc[]; total: number }> {
    const filter: QueryFilter<UserData> = {};

    if (query.enterpriseId) filter.enterprise_id = { $in: query.enterpriseId.map((id) => new Types.ObjectId(id)) };
    if (query.role) filter.role = { $in: query.role };
    if (query.status) filter.status = { $in: query.status };
    if (query.emailVerified !== undefined) {
      // Accounts created before the field existed have no value and count as not verified.
      filter.email_verified = query.emailVerified ? true : { $ne: true };
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
          { $project: { ...ADMIN_USER_PROJECTION, version: { $ifNull: ['$version', 0] } } },
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
    if (patch.phone === null) $unset.phone = '';
    else if (patch.phone !== undefined) $set.phone = patch.phone;
    return User.findByIdAndUpdate(id, { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) }, { returnDocument: 'after' }).exec();
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
      ...(data.status ? { status: data.status } : {}),
      ...(data.enterprise_id ? { enterprise_id: data.enterprise_id } : {}),
    });
    return user.save();
  }

  // Email verification must not undo a separately imposed account suspension.
  async markEmailVerified(id: Types.ObjectId | string): Promise<UserDoc | null> {
    return User.findOneAndUpdate(
      { _id: id },
      [{ $set: {
        email_verified: true,
        status: { $cond: [{ $eq: ['$status', 'inactive'] }, 'active', '$status'] },
        auth_version: { $add: [{ $ifNull: ['$auth_version', 0] }, 1] },
        version: { $add: [{ $ifNull: ['$version', 0] }, 1] },
      } }],
      { returnDocument: 'after', updatePipeline: true },
    ).exec();
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
        $expr: { $lte: [{ $ifNull: ['$verification_started_at', '$createdAt'] }, cutoff] },
      },
      {
        $set: { status: 'blocked' },
      },
    ).exec();
    return result.modifiedCount;
  }
}

export const usersRepository = new UsersRepository();
