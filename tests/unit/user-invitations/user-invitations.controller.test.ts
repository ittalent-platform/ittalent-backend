import { describe, expect, it, vi } from 'vitest';

import { UserInvitationsController } from '../../../src/modules/user-invitations/user-invitations.controller.js';
import type { UserInvitationsService } from '../../../src/modules/user-invitations/user-invitations.service.js';

describe('UserInvitationsController', () => {
  it('passes the validated creation request and actor to the service', async () => {
    const service = { createAccount: vi.fn().mockResolvedValue({ user: {}, invitation: {} }) };
    const controller = new UserInvitationsController(service as unknown as UserInvitationsService);
    const status = vi.fn().mockReturnValue({ json: vi.fn() });

    await controller.createAccount({ user: { id: 'admin-id' } } as never, { status, locals: { validated: { body: { role: 'user' } } } } as never, vi.fn());

    expect(service.createAccount).toHaveBeenCalledWith('admin-id', { role: 'user' });
    expect(status).toHaveBeenCalledWith(201);
  });
});
