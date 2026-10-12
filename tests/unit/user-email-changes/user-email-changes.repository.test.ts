import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';

import { UserEmailChange } from '../../../src/models/user-email-change.model.js';
import { UserEmailChangesRepository } from '../../../src/modules/user-email-changes/user-email-changes.repository.js';

describe('UserEmailChangesRepository', () => {
  afterEach(() => vi.restoreAllMocks());

  it('revokes previous requests and records the replacement in the transaction', async () => {
    const session = {} as never;
    const revoke = vi.spyOn(UserEmailChange, 'updateMany').mockReturnValue({ exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }) } as never);
    const create = vi.spyOn(UserEmailChange, 'create').mockResolvedValue([{}] as never);
    const input = { targetUserId: new Types.ObjectId(), actorId: new Types.ObjectId(), currentEmail: 'old@example.test', newEmail: 'new@example.test', tokenHash: 'token-hash', expectedVersion: 2, expiresAt: new Date() };

    await new UserEmailChangesRepository().create(input, session);

    expect(revoke).toHaveBeenCalledWith({ target_user_id: input.targetUserId, status: 'pending' }, { $set: { status: 'revoked' } }, { session });
    expect(create).toHaveBeenCalledWith([expect.objectContaining({ target_user_id: input.targetUserId, new_email: input.newEmail, expected_version: 2, status: 'pending' })], { session });
  });

  it('completes only the matching pending, unexpired request and owner', async () => {
    const session = {} as never;
    const update = vi.spyOn(UserEmailChange, 'updateOne').mockReturnValue({ exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }) } as never);
    const requestId = new Types.ObjectId();
    const ownerId = new Types.ObjectId();

    await expect(new UserEmailChangesRepository().complete(requestId, ownerId, session)).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith({ _id: requestId, target_user_id: ownerId, status: 'pending', expires_at: { $gt: expect.any(Date) } }, expect.any(Object), { session });
  });
});
