import { describe, expect, it, vi } from 'vitest';

import { UserAuditsService } from '../../../src/modules/user-audits/user-audits.service.js';
import type { UserAuditsRepository } from '../../../src/modules/user-audits/user-audits.repository.js';
import type { UserAuditHistoryQuery } from '../../../src/modules/user-audits/user-audits.schemas.js';

describe('UserAuditsService', () => {
  it('projects page results and resolves actor names through the users service boundary', async () => {
    const repository = { findPage: vi.fn().mockResolvedValue({
      rows: [{ _id: 'event-1', actor_user_id: 'actor-1', action: 'profile_updated', version: 2, occurred_at: new Date('2026-10-12T00:00:00Z') }], total: 1,
    }) };
    const lookup = vi.fn().mockResolvedValue(new Map([['actor-1', 'A. User']]));
    const service = new UserAuditsService(repository as unknown as UserAuditsRepository, lookup);
    const query = { page: 1, limit: 20 } as UserAuditHistoryQuery;

    await expect(service.list('target', query)).resolves.toMatchObject({ items: [{ actorName: 'A. User', action: 'profile_updated' }], total: 1 });
    expect(lookup).toHaveBeenCalledWith(['actor-1']);
  });
});
