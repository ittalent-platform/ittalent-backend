import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';

import { UserAudit } from '../../../src/models/user-audit.model.js';
import { UserAuditsRepository } from '../../../src/modules/user-audits/user-audits.repository.js';

function query(result: unknown): Record<string, ReturnType<typeof vi.fn>> {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['sort', 'skip', 'limit', 'lean']) chain[method] = vi.fn().mockReturnValue(chain);
  chain.exec = vi.fn().mockResolvedValue(result);
  return chain;
}

describe('UserAuditsRepository', () => {
  afterEach(() => vi.restoreAllMocks());

  it('filters and pages audit events without querying user documents in this repository', async () => {
    const rows = [{ _id: new Types.ObjectId(), actor_user_id: new Types.ObjectId(), target_user_id: new Types.ObjectId() }];
    const findQuery = query(rows);
    const countQuery = { exec: vi.fn().mockResolvedValue(1) };
    const find = vi.spyOn(UserAudit, 'find').mockReturnValue(findQuery as never);
    const count = vi.spyOn(UserAudit, 'countDocuments').mockReturnValue(countQuery as never);
    const queryInput = { page: 2, limit: 10, actor: 'admin' } as const;

    await expect(new UserAuditsRepository().findPage(String(rows[0]!.target_user_id), queryInput)).resolves.toEqual({ rows, total: 1 });
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ target_user_id: rows[0]!.target_user_id, actor_user_id: { $ne: rows[0]!.target_user_id } }));
    expect(findQuery.skip).toHaveBeenCalledWith(10);
    expect(findQuery.limit).toHaveBeenCalledWith(10);
    expect(count).toHaveBeenCalled();
  });
});
