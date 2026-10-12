import { describe, expect, it, vi } from 'vitest';

import { UserAuditsController } from '../../../src/modules/user-audits/user-audits.controller.js';
import type { UserAuditsService } from '../../../src/modules/user-audits/user-audits.service.js';
import type { UsersService } from '../../../src/modules/users/users.service.js';

describe('UserAuditsController', () => {
  it('validates target existence and delegates history listing to services', async () => {
    const audits = { list: vi.fn().mockResolvedValue({ items: [], page: 1, limit: 20, total: 0, totalPages: 0 }) };
    const users = { getUserById: vi.fn().mockResolvedValue({ id: 'target-id' }) };
    const controller = new UserAuditsController(audits as unknown as UserAuditsService, users as unknown as UsersService);
    const status = vi.fn().mockReturnValue({ json: vi.fn() });

    await controller.listUserHistory({} as never, { status, locals: { validated: { params: { id: 'target-id' }, query: { page: 1, limit: 20 } } } } as never, vi.fn());

    expect(users.getUserById).toHaveBeenCalledWith('target-id');
    expect(audits.list).toHaveBeenCalledWith('target-id', { page: 1, limit: 20 });
  });
});
