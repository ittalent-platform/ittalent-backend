import type { ClientSession } from 'mongoose';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { USER_AUDIT_MESSAGES } from './user-audits.constants.js';
import { userAuditsRepository, type CreateUserAuditInput, type UserAuditsRepository } from './user-audits.repository.js';
import type { UserAuditHistoryQuery, UserAuditItem } from './user-audits.schemas.js';
import type { PaginatedResult } from '../../shared/schemas/pagination.schemas.js';

export class UserAuditsService {
  constructor(private readonly repository: UserAuditsRepository = userAuditsRepository) {}

  async record(input: CreateUserAuditInput, session: ClientSession): Promise<void> {
    await this.repository.create(input, session);
  }

  async list(targetUserId: string, query: UserAuditHistoryQuery): Promise<PaginatedResult<UserAuditItem>> {
    let page;
    try {
      page = await this.repository.findPage(targetUserId, query);
    } catch (error) {
      console.error('[user-audits:store:error]', error);
      throw createHttpError(HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE, USER_AUDIT_MESSAGES.STORE_UNAVAILABLE);
    }
    const { rows, total } = page;
    const items = rows.map((row): UserAuditItem => ({
      id: String(row._id),
      actorId: String(row.actor_user_id),
      actorName: typeof row.actor_name === 'string' ? row.actor_name : null,
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
