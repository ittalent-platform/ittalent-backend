import { Types, type ClientSession, type QueryFilter } from 'mongoose';

import { User } from '../../models/user.model.js';
import { UserAudit, type UserAuditAction, type UserAuditData } from '../../models/user-audit.model.js';
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

export class UserAuditsRepository {
  async create(data: CreateUserAuditInput, session: ClientSession): Promise<void> {
    await UserAudit.create([{
      target_user_id: data.targetUserId,
      actor_user_id: data.actorId,
      action: data.action,
      result: 'success',
      ...(data.reason ? { reason: data.reason } : {}),
      ...(data.changes ? { changes: data.changes } : {}),
      version: data.version,
      occurred_at: new Date(),
    }], { session });
  }

  async findPage(targetUserId: string, query: UserAuditHistoryQuery): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    const target = new Types.ObjectId(targetUserId);
    const filter: QueryFilter<UserAuditData> = { target_user_id: target };
    if (query.action) filter.action = query.action;
    if (query.group) filter.action = { $in: [...new Set(query.group.flatMap((group) => USER_AUDIT_GROUPS[group]))] };
    if (query.actor === 'self') filter.actor_user_id = target;
    if (query.actor === 'admin') filter.actor_user_id = { $ne: target };
    if (query.from || query.to) filter.occurred_at = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
    const [rows, total] = await Promise.all([
      UserAudit.find(filter).sort({ occurred_at: -1, _id: -1 })
        .skip((query.page - 1) * query.limit).limit(query.limit).lean().exec(),
      UserAudit.countDocuments(filter).exec(),
    ]);
    const actorIds = [...new Set(rows.map((row) => String(row.actor_user_id)))];
    const actors = actorIds.length ? await User.find({ _id: { $in: actorIds } }).select('full_name username').lean().exec() : [];
    const names = new Map(actors.map((actor) => [String(actor._id), actor.full_name || actor.username]));
    return { rows: rows.map((row) => ({ ...row, actor_name: names.get(String(row.actor_user_id)) ?? null })), total };
  }
}

export const userAuditsRepository = new UserAuditsRepository();
