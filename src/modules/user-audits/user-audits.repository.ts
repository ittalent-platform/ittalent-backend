import type { ClientSession, Types } from 'mongoose';

import { UserAudit, type UserAuditAction } from '../../models/user-audit.model.js';
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
    const filter = { target_user_id: targetUserId, ...(query.action ? { action: query.action } : {}) };
    const [rows, total] = await Promise.all([
      UserAudit.find(filter).sort({ occurred_at: -1, _id: -1 })
        .skip((query.page - 1) * query.limit).limit(query.limit).lean().exec(),
      UserAudit.countDocuments(filter).exec(),
    ]);
    return { rows: rows.map((row) => ({ ...row })), total };
  }
}

export const userAuditsRepository = new UserAuditsRepository();
