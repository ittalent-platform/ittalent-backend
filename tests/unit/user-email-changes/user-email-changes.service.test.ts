import { beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

import { UserEmailChangesService } from '../../../src/modules/user-email-changes/user-email-changes.service.js';
import type { UserEmailChangesRepository } from '../../../src/modules/user-email-changes/user-email-changes.repository.js';
import type { AuthService } from '../../../src/modules/auth/auth.service.js';
import type { UsersService } from '../../../src/modules/users/users.service.js';
import type { UserAuditsService } from '../../../src/modules/user-audits/user-audits.service.js';

describe('UserEmailChangesService', () => {
  beforeEach(() => {
    vi.spyOn(mongoose, 'startSession').mockResolvedValue({
      withTransaction: async (callback: () => Promise<void>) => callback(),
      endSession: async () => undefined,
    } as never);
  });

  it('rechecks the actor inside the transaction before issuing an email-change request', async () => {
    const actorId = new mongoose.Types.ObjectId();
    const targetId = new mongoose.Types.ObjectId();
    const target = { _id: targetId, email: 'old@example.test', status: 'active', email_verified: true, version: 2 };
    const users = {
      findById: vi.fn().mockResolvedValue(target),
      findByIdWithSession: vi.fn().mockImplementation(async (id: mongoose.Types.ObjectId) => String(id) === String(actorId) ? { role: 'admin', status: 'active' } : target),
      emailExists: vi.fn().mockResolvedValue(false),
      serializeIdentityRequests: vi.fn(),
    };
    const changes = { create: vi.fn() };
    const service = new UserEmailChangesService(users as unknown as UsersService, changes as unknown as UserEmailChangesRepository, {} as AuthService, { record: vi.fn() } as unknown as UserAuditsService);

    await expect(service.request(String(actorId), String(targetId), 'new@example.test', 2)).resolves.toMatchObject({ deliveryStatus: expect.any(String) });
    expect(users.findByIdWithSession).toHaveBeenCalledTimes(2);
    expect(changes.create).toHaveBeenCalledOnce();
  });

  it('checks the current password once inside the transaction before committing', async () => {
    const userId = new mongoose.Types.ObjectId();
    const invitation = { _id: new mongoose.Types.ObjectId(), target_user_id: userId, current_email: 'old@example.test', new_email: 'new@example.test', expected_version: 1, requested_by: new mongoose.Types.ObjectId() };
    const auth = { verifyCurrentPassword: vi.fn().mockResolvedValue(true), revokeIdentityTokens: vi.fn() };
    const users = {
      findByIdWithSession: vi.fn().mockResolvedValue({ _id: userId, email: 'old@example.test', version: 1 }),
      emailExists: vi.fn().mockResolvedValue(false),
      updateEmailVersioned: vi.fn().mockResolvedValue({ email: 'new@example.test', auth_version: 2, version: 2 }),
    };
    const changes = { findPendingByHash: vi.fn().mockResolvedValue(invitation), complete: vi.fn().mockResolvedValue(true) };
    const audits = { record: vi.fn() };
    const service = new UserEmailChangesService(
      users as unknown as UsersService,
      changes as unknown as UserEmailChangesRepository,
      auth as unknown as AuthService,
      audits as unknown as UserAuditsService,
    );

    await expect(service.confirm(String(userId), { token: 'a'.repeat(64), currentPassword: 'CurrentPassword123!' })).resolves.toEqual({ email: 'new@example.test', authVersion: 2 });
    expect(auth.verifyCurrentPassword).toHaveBeenCalledTimes(1);
    expect(auth.verifyCurrentPassword).toHaveBeenCalledWith(userId, 'CurrentPassword123!', expect.anything());
  });
});
