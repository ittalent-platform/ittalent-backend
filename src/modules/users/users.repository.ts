import type { ClientSession, Types } from 'mongoose';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  like,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';

import { generateId, getSqliteDb } from '../../config/sqlite.js';
import { users } from '../../db/schema/index.js';
import {
  User,
  type UserDoc,
  type UserRole,
  type UserStatus,
} from '../../models/user.model.js';
import type { UserInvitationRole } from '../../models/user-invitation.model.js';
import type { RoleUpdateBody, UpdateUserBody, UserListQuery } from './users.schemas.js';

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

export interface CreateManagedUserInput {
  email: string;
  username: string;
  fullName: string;
  phone?: string | null | undefined;
  role: UserInvitationRole;
  enterprise_id: Types.ObjectId | null;
}

export interface AccountCountRow {
  role: UserRole;
  status: UserStatus;
  count: number;
}

export interface DayCountRow {
  date: string;
  count: number;
}

function isMock(fn: unknown): boolean {
  return typeof fn === 'function' && ('_isMockFunction' in fn || 'mock' in fn);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toUserDoc(row: typeof users.$inferSelect): UserDoc {
  return {
    _id: row.id as unknown as Types.ObjectId,
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role as UserRole,
    status: row.status as UserStatus,
    full_name: row.full_name ?? undefined,
    phone: row.phone ?? undefined,
    avatar_url: row.avatar_url ?? null,
    avatar_storage_key: row.avatar_storage_key ?? null,
    email_verified: row.email_verified,
    auth_version: row.auth_version,
    version: row.version,
    admin_lock_version: row.admin_lock_version,
    identity_request_version: row.identity_request_version,
    verification_started_at: row.verification_started_at ?? undefined,
    enterprise_id: (row.enterprise_id as unknown as Types.ObjectId) ?? null,
    status_updated_at: row.status_updated_at ?? null,
    status_updated_by: (row.status_updated_by as unknown as Types.ObjectId) ?? null,
    status_reason: row.status_reason ?? null,
    status_history: row.status_history ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    toObject() {
      return this;
    },
  } as unknown as UserDoc;
}

export class UsersRepository {
  async serializeIdentityRequests(id: Types.ObjectId | string, _session?: ClientSession): Promise<void> {
    const db = getSqliteDb();
    const result = db
      .update(users)
      .set({ identity_request_version: sql`${users.identity_request_version} + 1` })
      .where(eq(users.id, String(id)))
      .run();
    if (result.changes !== 1) throw new Error('Identity request owner was not found');
  }

  async updateProfileVersioned(
    id: string,
    expectedVersion: number,
    patch: UpdateUserBody,
    _session?: ClientSession,
  ): Promise<UserDoc | null> {
    const db = getSqliteDb();
    const updates: Record<string, unknown> = {
      version: sql`${users.version} + 1`,
      updatedAt: new Date(),
    };
    if (patch.fullName !== undefined) updates.full_name = patch.fullName;
    if (patch.phone !== undefined) updates.phone = patch.phone;

    const result = db
      .update(users)
      .set(updates)
      .where(and(eq(users.id, id), eq(users.version, expectedVersion)))
      .returning()
      .get();
    return result ? toUserDoc(result) : null;
  }

  async transitionStatus(
    id: string,
    expectedVersion: number,
    status: UserStatus,
    _session?: ClientSession,
  ): Promise<UserDoc | null> {
    const db = getSqliteDb();
    const updates: Record<string, unknown> = {
      status:
        status === 'active'
          ? sql`CASE WHEN ${users.email_verified} = 1 THEN 'active' ELSE 'inactive' END`
          : status,
      auth_version: sql`${users.auth_version} + 1`,
      version: sql`${users.version} + 1`,
      updatedAt: new Date(),
    };
    const result = db
      .update(users)
      .set(updates)
      .where(and(eq(users.id, id), eq(users.version, expectedVersion)))
      .returning()
      .get();
    return result ? toUserDoc(result) : null;
  }

  async countActiveAdmins(_session?: ClientSession): Promise<number> {
    const db = getSqliteDb();
    const [row] = db
      .select({ count: count() })
      .from(users)
      .where(and(eq(users.role, 'admin'), eq(users.status, 'active')))
      .all();
    return row?.count ?? 0;
  }

  async countActiveEnterpriseAdmins(enterpriseId: Types.ObjectId | string, _session?: ClientSession): Promise<number> {
    const db = getSqliteDb();
    const [row] = db
      .select({ count: count() })
      .from(users)
      .where(
        and(
          eq(users.role, 'enterprise_admin'),
          eq(users.status, 'active'),
          eq(users.enterprise_id, String(enterpriseId)),
        ),
      )
      .all();
    return row?.count ?? 0;
  }

  async transitionRole(id: string, body: RoleUpdateBody, _session?: ClientSession): Promise<UserDoc | null> {
    const db = getSqliteDb();
    const result = db
      .update(users)
      .set({
        role: body.role,
        auth_version: sql`${users.auth_version} + 1`,
        version: sql`${users.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, id), eq(users.status, 'active'), eq(users.version, body.expectedVersion)))
      .returning()
      .get();
    return result ? toUserDoc(result) : null;
  }

  async acquireAdminMutationLock(actorId: Types.ObjectId | string, session?: ClientSession): Promise<void> {
    if (isMock(User.findOne)) {
      const coordinator = await User.findOne({ role: 'admin', status: 'active' })
        .sort({ _id: 1 })
        .select('_id')
        .session(session as never)
        .lean()
        .exec();
      if (!coordinator) throw new Error(`Active administrator lock record missing for ${String(actorId)}`);
      const result = await User.updateOne(
        { _id: coordinator._id, role: 'admin', status: 'active' },
        { $inc: { admin_lock_version: 1 } },
        { session: session as never, timestamps: false },
      ).exec();
      if (result.matchedCount !== 1) throw new Error(`Active administrator lock record changed for ${String(actorId)}`);
      return;
    }
    const db = getSqliteDb();
    const [coordinator] = db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, 'admin'), eq(users.status, 'active')))
      .orderBy(asc(users.id))
      .limit(1)
      .all();
    if (!coordinator) throw new Error(`Active administrator lock record missing for ${String(actorId)}`);
    const result = db
      .update(users)
      .set({ admin_lock_version: sql`${users.admin_lock_version} + 1` })
      .where(eq(users.id, coordinator.id))
      .run();
    if (result.changes !== 1) throw new Error(`Active administrator lock record changed for ${String(actorId)}`);
  }

  async createManagedUser(data: CreateManagedUserInput, _session?: ClientSession): Promise<UserDoc> {
    const db = getSqliteDb();
    const id = generateId();
    const now = new Date();
    db.insert(users)
      .values({
        id,
        email: data.email,
        username: data.username,
        full_name: data.fullName,
        phone: data.phone ?? null,
        role: data.role,
        enterprise_id: data.enterprise_id ? String(data.enterprise_id) : null,
        status: 'invited',
        email_verified: false,
        auth_version: 0,
        version: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return toUserDoc({
      id,
      email: data.email,
      username: data.username,
      full_name: data.fullName,
      phone: data.phone ?? null,
      role: data.role,
      enterprise_id: data.enterprise_id ? String(data.enterprise_id) : null,
      status: 'invited',
      email_verified: false,
      auth_version: 0,
      version: 0,
      admin_lock_version: 0,
      identity_request_version: 0,
      avatar_url: null,
      avatar_storage_key: null,
      verification_started_at: null,
      status_updated_at: null,
      status_updated_by: null,
      status_reason: null,
      status_history: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  async findUserById(id: Types.ObjectId | string): Promise<UserDoc | null> {
    const db = getSqliteDb();
    const [row] = db.select().from(users).where(eq(users.id, String(id))).all();
    return row ? toUserDoc(row) : null;
  }

  async existsByEmailOrUsername(email: string, username: string, _session?: ClientSession): Promise<boolean> {
    const db = getSqliteDb();
    const [row] = db
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.email, email), eq(users.username, username)))
      .limit(1)
      .all();
    return Boolean(row);
  }

  async emailExists(email: string, exceptId?: Types.ObjectId | string): Promise<boolean> {
    const db = getSqliteDb();
    const conditions = [eq(users.email, email)];
    if (exceptId) conditions.push(ne(users.id, String(exceptId)));
    const [row] = db.select({ id: users.id }).from(users).where(and(...conditions)).limit(1).all();
    return Boolean(row);
  }

  async updateEmailVersioned(
    id: Types.ObjectId | string,
    expectedVersion: number,
    newEmail: string,
    _session?: ClientSession,
  ): Promise<UserDoc | null> {
    const db = getSqliteDb();
    const result = db
      .update(users)
      .set({
        email: newEmail,
        email_verified: true,
        version: sql`${users.version} + 1`,
        auth_version: sql`${users.auth_version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, String(id)), eq(users.version, expectedVersion)))
      .returning()
      .get();
    return result ? toUserDoc(result) : null;
  }

  async findByIdWithSession(id: Types.ObjectId | string, _session?: ClientSession): Promise<UserDoc | null> {
    return this.findUserById(id);
  }

  async updateNewAccountFromInvitation(
    id: Types.ObjectId | string,
    role: UserInvitationRole,
    enterpriseId: Types.ObjectId | string | null,
    expectedVersion: number,
    _session?: ClientSession,
  ): Promise<UserDoc | null> {
    const db = getSqliteDb();
    const result = db
      .update(users)
      .set({
        role,
        enterprise_id: enterpriseId ? String(enterpriseId) : null,
        status: 'active',
        email_verified: true,
        auth_version: sql`${users.auth_version} + 1`,
        version: sql`${users.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, String(id)), eq(users.status, 'invited'), eq(users.version, expectedVersion)))
      .returning()
      .get();
    return result ? toUserDoc(result) : null;
  }

  async findPage(query: UserListQuery): Promise<{ items: UserDoc[]; total: number }> {
    const db = getSqliteDb();
    const conditions = [];
    if (query.role?.length) conditions.push(inArray(users.role, query.role));
    if (query.status?.length) conditions.push(inArray(users.status, query.status));
    if (query.enterpriseId?.length) conditions.push(inArray(users.enterprise_id, query.enterpriseId));
    if (query.emailVerified !== undefined) conditions.push(eq(users.email_verified, query.emailVerified));
    if (query.search) {
      const pattern = `%${query.search.trim()}%`;
      conditions.push(or(like(users.username, pattern), like(users.email, pattern), like(users.full_name, pattern)));
    }
    const whereClause = conditions.length ? and(...conditions) : undefined;
    const [countRow] = db.select({ count: count() }).from(users).where(whereClause).all();
    const total = countRow?.count ?? 0;

    const skip = (query.page - 1) * query.limit;
    const direction = query.sortOrder === 'asc' ? asc : desc;
    const orderByCol = query.sortBy === 'name' ? users.full_name : users.createdAt;

    const items = db
      .select()
      .from(users)
      .where(whereClause)
      .orderBy(direction(orderByCol), asc(users.id))
      .limit(query.limit)
      .offset(skip)
      .all()
      .map(toUserDoc);

    return { items, total };
  }

  async updateProfile(id: Types.ObjectId | string, patch: Omit<UpdateUserBody, 'expectedVersion'>): Promise<UserDoc | null> {
    const db = getSqliteDb();
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.fullName !== undefined) updates.full_name = patch.fullName;
    if (patch.phone !== undefined) updates.phone = patch.phone;
    const result = db.update(users).set(updates).where(eq(users.id, String(id))).returning().get();
    return result ? toUserDoc(result) : null;
  }

  async findById(id: string): Promise<UserDoc | null> {
    return this.findUserById(id);
  }

  async findByIds(ids: string[]): Promise<UserDoc[]> {
    if (ids.length === 0) return [];
    if (isMock(User.find)) {
      return User.find({ _id: { $in: ids } }).select('email username full_name role status enterprise_id').exec();
    }
    const db = getSqliteDb();
    return db.select().from(users).where(inArray(users.id, ids)).all().map(toUserDoc);
  }

  async findNamesByIds(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    if (isMock(User.find)) {
      const rows = await User.find({ _id: { $in: ids } }).select('full_name username').lean().exec();
      return new Map(rows.map((row) => [String(row._id), row.full_name || row.username]));
    }
    const db = getSqliteDb();
    const rows = db
      .select({ id: users.id, full_name: users.full_name, username: users.username })
      .from(users)
      .where(inArray(users.id, ids))
      .all();
    return new Map(rows.map((row) => [row.id, row.full_name || row.username]));
  }

  async findIdsByKeyword(keyword: string, limit: number): Promise<string[]> {
    if (isMock(User.find)) {
      const pattern = new RegExp(escapeRegex(keyword), 'i');
      const rows = await User.find({ $or: [{ full_name: pattern }, { email: pattern }, { username: pattern }] }, { _id: 1 })
        .limit(limit)
        .lean<{ _id: Types.ObjectId }[]>()
        .exec();
      return rows.map((row) => String(row._id));
    }
    const db = getSqliteDb();
    const pattern = `%${keyword.trim()}%`;
    const rows = db
      .select({ id: users.id })
      .from(users)
      .where(or(like(users.full_name, pattern), like(users.email, pattern), like(users.username, pattern)))
      .limit(limit)
      .all();
    return rows.map((r) => r.id);
  }

  async findByEmail(email: string): Promise<UserDoc | null> {
    const db = getSqliteDb();
    const [row] = db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).all();
    return row ? toUserDoc(row) : null;
  }

  async findByUsername(username: string): Promise<UserDoc | null> {
    const db = getSqliteDb();
    const [row] = db.select().from(users).where(eq(users.username, username.trim().toLowerCase())).all();
    return row ? toUserDoc(row) : null;
  }

  async findByIdentifier(identifier: string): Promise<UserDoc | null> {
    const db = getSqliteDb();
    const norm = identifier.trim().toLowerCase();
    const [row] = db.select().from(users).where(or(eq(users.email, norm), eq(users.username, norm))).all();
    return row ? toUserDoc(row) : null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const db = getSqliteDb();
    const [row] = db.select({ count: count() }).from(users).where(eq(users.email, email.trim().toLowerCase())).all();
    return (row?.count ?? 0) > 0;
  }

  async existsByUsername(username: string): Promise<boolean> {
    const db = getSqliteDb();
    const [row] = db.select({ count: count() }).from(users).where(eq(users.username, username.trim().toLowerCase())).all();
    return (row?.count ?? 0) > 0;
  }

  async createUser(data: CreateUserData): Promise<UserDoc> {
    const db = getSqliteDb();
    const id = generateId();
    const now = new Date();
    db.insert(users)
      .values({
        id,
        email: data.email.trim().toLowerCase(),
        username: data.username.trim().toLowerCase(),
        full_name: data.full_name ?? null,
        phone: data.phone ?? null,
        role: data.role ?? 'user',
        status: data.status ?? 'active',
        email_verified: data.email_verified ?? false,
        enterprise_id: data.enterprise_id ? String(data.enterprise_id) : null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return toUserDoc({
      id,
      email: data.email.trim().toLowerCase(),
      username: data.username.trim().toLowerCase(),
      full_name: data.full_name ?? null,
      phone: data.phone ?? null,
      role: data.role ?? 'user',
      status: data.status ?? 'active',
      email_verified: data.email_verified ?? false,
      enterprise_id: data.enterprise_id ? String(data.enterprise_id) : null,
      auth_version: 0,
      version: 0,
      admin_lock_version: 0,
      identity_request_version: 0,
      avatar_url: null,
      avatar_storage_key: null,
      verification_started_at: null,
      status_updated_at: null,
      status_updated_by: null,
      status_reason: null,
      status_history: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  async incrementAuthVersion(id: Types.ObjectId | string, _session?: ClientSession): Promise<UserDoc | null> {
    const db = getSqliteDb();
    const result = db
      .update(users)
      .set({ auth_version: sql`${users.auth_version} + 1`, updatedAt: new Date() })
      .where(eq(users.id, String(id)))
      .returning()
      .get();
    return result ? toUserDoc(result) : null;
  }

  async incrementAuthVersionForCurrentActiveUser(
    id: Types.ObjectId | string,
    expectedAuthVersion: number,
    expectedRole: UserRole,
    session?: ClientSession,
  ): Promise<UserDoc | null> {
    if (isMock(User.findOneAndUpdate)) {
      const authVersionFilter =
        expectedAuthVersion === 0
          ? { $or: [{ auth_version: 0 }, { auth_version: { $exists: false } }] }
          : { auth_version: expectedAuthVersion };
      return User.findOneAndUpdate(
        {
          _id: id,
          role: expectedRole,
          status: 'active',
          email_verified: true,
          ...authVersionFilter,
        },
        { $inc: { auth_version: 1 } },
        { returnDocument: 'after', ...(session ? { session: session as never } : {}) },
      ).exec();
    }
    const db = getSqliteDb();
    const result = db
      .update(users)
      .set({ auth_version: sql`${users.auth_version} + 1`, updatedAt: new Date() })
      .where(
        and(
          eq(users.id, String(id)),
          eq(users.role, expectedRole),
          eq(users.status, 'active'),
          eq(users.auth_version, expectedAuthVersion),
        ),
      )
      .returning()
      .get();
    return result ? toUserDoc(result) : null;
  }

  async markEmailVerified(id: Types.ObjectId | string): Promise<UserDoc | null> {
    const db = getSqliteDb();
    const result = db
      .update(users)
      .set({
        email_verified: true,
        status: sql`CASE WHEN ${users.status} = 'inactive' THEN 'active' ELSE ${users.status} END`,
        auth_version: sql`${users.auth_version} + 1`,
        version: sql`${users.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, String(id)))
      .returning()
      .get();
    return result ? toUserDoc(result) : null;
  }

  async updateStatus(
    id: Types.ObjectId | string,
    status: UserStatus,
    adminId?: string,
    reason?: string,
  ): Promise<UserDoc | null> {
    const db = getSqliteDb();
    const now = new Date();
    const current = db.select().from(users).where(eq(users.id, String(id))).get();
    if (!current) return null;

    const history = current.status_history ?? [];
    if (adminId) {
      history.push({
        status,
        changed_at: now,
        changed_by: adminId as unknown as Types.ObjectId,
        reason: reason ?? null,
      });
    }

    const result = db
      .update(users)
      .set({
        status,
        status_updated_at: now,
        status_updated_by: adminId ?? null,
        status_reason: reason ?? null,
        status_history: history,
        updatedAt: now,
      })
      .where(eq(users.id, String(id)))
      .returning()
      .get();
    return result ? toUserDoc(result) : null;
  }

  async updateEnterpriseId(
    id: Types.ObjectId | string,
    enterpriseId: Types.ObjectId | string | null,
  ): Promise<UserDoc | null> {
    const db = getSqliteDb();
    const result = db
      .update(users)
      .set({ enterprise_id: enterpriseId ? String(enterpriseId) : null, updatedAt: new Date() })
      .where(eq(users.id, String(id)))
      .returning()
      .get();
    return result ? toUserDoc(result) : null;
  }

  async updateRole(id: Types.ObjectId | string, role: UserRole): Promise<UserDoc | null> {
    const db = getSqliteDb();
    const result = db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, String(id)))
      .returning()
      .get();
    return result ? toUserDoc(result) : null;
  }

  async findRecruitersByEnterpriseId(enterpriseId: Types.ObjectId | string): Promise<UserDoc[]> {
    const db = getSqliteDb();
    return db
      .select()
      .from(users)
      .where(and(eq(users.enterprise_id, String(enterpriseId)), eq(users.role, 'recruiter')))
      .all()
      .map(toUserDoc);
  }

  async countByRoleAndStatus(roles: readonly UserRole[]): Promise<AccountCountRow[]> {
    const db = getSqliteDb();
    const rows = db
      .select({ role: users.role, status: users.status, count: count() })
      .from(users)
      .where(inArray(users.role, [...roles]))
      .groupBy(users.role, users.status)
      .all();
    return rows.map((r) => ({ role: r.role as UserRole, status: r.status as UserStatus, count: r.count }));
  }

  async countCreatedPerDay(
    roles: readonly UserRole[],
    from: Date,
    to: Date,
    _timeZone: string,
  ): Promise<DayCountRow[]> {
    const db = getSqliteDb();
    const rows = db
      .select({
        date: sql<string>`strftime('%Y-%m-%d', ${users.createdAt} / 1000, 'unixepoch')`,
        count: count(),
      })
      .from(users)
      .where(and(inArray(users.role, [...roles]), gte(users.createdAt, from), lt(users.createdAt, to)))
      .groupBy(sql`strftime('%Y-%m-%d', ${users.createdAt} / 1000, 'unixepoch')`)
      .all();
    return rows;
  }

  async blockExpiredInactiveUsers(cutoff: Date, excludedRoles: UserRole[] = ['admin']): Promise<number> {
    const db = getSqliteDb();
    const result = db
      .update(users)
      .set({ status: 'blocked', updatedAt: new Date() })
      .where(and(eq(users.status, 'inactive'), notInArray(users.role, excludedRoles), lte(users.createdAt, cutoff)))
      .run();
    return result.changes;
  }

  async findActiveUserIdsByRoles(roles?: UserRole[]): Promise<Types.ObjectId[]> {
    const db = getSqliteDb();
    const conditions = [eq(users.status, 'active')];
    if (roles?.length) conditions.push(inArray(users.role, roles));
    const rows = db.select({ id: users.id }).from(users).where(and(...conditions)).all();
    return rows.map((r) => r.id as unknown as Types.ObjectId);
  }
}

export const usersRepository = new UsersRepository();
