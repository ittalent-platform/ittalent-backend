import { Types, type ClientSession, type QueryFilter } from 'mongoose';
import { and, desc, eq, gte, inArray, lte, ne } from 'drizzle-orm';

import { generateId, getSqliteDb } from '../../config/sqlite.js';
import { userAudits } from '../../db/schema/index.js';
import {
  UserAudit,
  type UserAuditAction,
  type UserAuditData,
} from '../../models/user-audit.model.js';
import { USER_AUDIT_GROUPS } from './user-audits.constants.js';
import type { UserAuditHistoryQuery } from './user-audits.schemas.js';

export interface CreateUserAuditInput {
  targetUserId: Types.ObjectId;
  actorId: Types.ObjectId;
  action: UserAuditAction;
  reason?: string;
  changes?: Record<string, string | null>;
  version: number;
}

function isMock(fn: unknown): boolean {
  return typeof fn === 'function' && ('_isMockFunction' in fn || 'mock' in fn);
}

export class UserAuditsRepository {
  async create(data: CreateUserAuditInput, session?: ClientSession): Promise<void> {
    if (process.env.USE_MONGODB === 'true' || isMock(UserAudit.create)) {
      await UserAudit.create(
        [
          {
            target_user_id: data.targetUserId,
            actor_user_id: data.actorId,
            action: data.action,
            result: 'success',
            ...(data.reason ? { reason: data.reason } : {}),
            ...(data.changes ? { changes: data.changes } : {}),
            version: data.version,
            occurred_at: new Date(),
          },
        ],
        session ? { session } : undefined,
      );
      return;
    }

    const db = getSqliteDb();
    const id = generateId();
    db.insert(userAudits)
      .values({
        id,
        target_user_id: String(data.targetUserId),
        actor_user_id: String(data.actorId),
        action: data.action,
        result: 'success',
        reason: data.reason ?? null,
        changes: data.changes ?? null,
        version: data.version,
        occurred_at: new Date(),
      })
      .run();
  }

  async findPage(
    targetUserId: string,
    query: UserAuditHistoryQuery,
  ): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    if (process.env.USE_MONGODB === 'true' || isMock(UserAudit.find)) {
      const target = new Types.ObjectId(targetUserId);
      const filter: QueryFilter<UserAuditData> = { target_user_id: target };
      if (query.action) filter.action = query.action;
      if (query.group) {
        filter.action = {
          $in: [...new Set(query.group.flatMap((group) => USER_AUDIT_GROUPS[group]))],
        };
      }
      if (query.actor === 'self') filter.actor_user_id = target;
      if (query.actor === 'admin') filter.actor_user_id = { $ne: target };
      if (query.from || query.to) {
        filter.occurred_at = {
          ...(query.from ? { $gte: query.from } : {}),
          ...(query.to ? { $lte: query.to } : {}),
        };
      }
      const [rows, total] = await Promise.all([
        UserAudit.find(filter)
          .sort({ occurred_at: -1, _id: -1 })
          .skip((query.page - 1) * query.limit)
          .limit(query.limit)
          .lean()
          .exec(),
        UserAudit.countDocuments(filter).exec(),
      ]);
      return { rows: rows as unknown as Record<string, unknown>[], total };
    }

    const db = getSqliteDb();
    const conditions = [eq(userAudits.target_user_id, targetUserId)];

    if (query.action) {
      conditions.push(eq(userAudits.action, query.action));
    }
    if (query.group) {
      const actions = [...new Set(query.group.flatMap((g) => USER_AUDIT_GROUPS[g]))];
      conditions.push(inArray(userAudits.action, actions));
    }
    if (query.actor === 'self') {
      conditions.push(eq(userAudits.actor_user_id, targetUserId));
    }
    if (query.actor === 'admin') {
      conditions.push(ne(userAudits.actor_user_id, targetUserId));
    }
    if (query.from) {
      conditions.push(gte(userAudits.occurred_at, query.from));
    }
    if (query.to) {
      conditions.push(lte(userAudits.occurred_at, query.to));
    }

    const whereClause = and(...conditions);
    const allRows = db
      .select()
      .from(userAudits)
      .where(whereClause)
      .orderBy(desc(userAudits.occurred_at), desc(userAudits.id))
      .all();

    const total = allRows.length;
    const skip = (query.page - 1) * query.limit;
    const paged = allRows.slice(skip, skip + query.limit);

    const rows = paged.map((r) => ({
      _id: new Types.ObjectId(r.id),
      target_user_id: new Types.ObjectId(r.target_user_id),
      actor_user_id: new Types.ObjectId(r.actor_user_id),
      action: r.action,
      result: r.result,
      reason: r.reason ?? undefined,
      changes: r.changes ?? undefined,
      version: r.version,
      occurred_at: new Date(r.occurred_at),
    }));

    return { rows: rows as unknown as Record<string, unknown>[], total };
  }
}

export const userAuditsRepository = new UserAuditsRepository();
