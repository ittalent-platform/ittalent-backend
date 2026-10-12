import { describe, expect, it, vi } from 'vitest';

import { UserEmailChangesController } from '../../../src/modules/user-email-changes/user-email-changes.controller.js';
import type { UserEmailChangesService } from '../../../src/modules/user-email-changes/user-email-changes.service.js';

describe('UserEmailChangesController', () => {
  it('confirms the validated change as the authenticated account owner', async () => {
    const service = { confirm: vi.fn().mockResolvedValue({ email: 'new@example.test', authVersion: 2 }) };
    const controller = new UserEmailChangesController(service as unknown as UserEmailChangesService);
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });

    await controller.confirm({ user: { id: 'owner-id' } } as never, { status, locals: { validated: { body: { token: 'token', currentPassword: 'valid' } } } } as never, vi.fn());

    expect(service.confirm).toHaveBeenCalledWith('owner-id', { token: 'token', currentPassword: 'valid' });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ email: 'new@example.test', authVersion: 2 });
  });
});
