import type { ClientSession } from 'mongoose';

import { userAuditsRepository, type CreateUserAuditInput, type UserAuditsRepository } from './user-audits.repository.js';
import type { UserAuditHistoryQuery, UserAuditItem } from './user-audits.schemas.js';
import type { PaginatedResult } from '../../shared/schemas/pagination.schemas.js';

export class UserAuditsService {
  constructor(private readonly repository: UserAuditsRepository = userAuditsRepository) {}

  async record(input: CreateUserAuditInput, session: ClientSession): Promise<void> {
    await this.repository.create(input, session);
  }

  async list(targetUserId: string, query: UserAuditHistoryQuery): Promise<PaginatedResult<UserAuditItem>> {
    const { rows, total } = await this.repository.findPage(targetUserId, query);
    const items = rows.map((row): UserAuditItem => ({
      id: String(row._id),
      actorId: String(row.actor_user_id),
      action: String(row.action),
      result: 'success',
      reason: typeof row.reason === 'string' ? row.reason : null,
      changes: row.changes && typeof row.changes === 'object' ? row.changes as Record<string, string | null> : null,
      version: Number(row.version),
      occurredAt: new Date(String(row.occurred_at)).toISOString(),
    }));
    return { items, page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) };
  }
}

export const userAuditsService = new UserAuditsService();
