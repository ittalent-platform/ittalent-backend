import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';

import { UserInvitation } from '../../../src/models/user-invitation.model.js';
import { UserInvitationsRepository } from '../../../src/modules/user-invitations/user-invitations.repository.js';

describe('UserInvitationsRepository', () => {
  afterEach(() => vi.restoreAllMocks());

  it('revokes previous pending links and persists the replacement in the transaction', async () => {
    const session = {} as never;
    const update = vi.spyOn(UserInvitation, 'updateMany').mockReturnValue({ exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }) } as never);
    const create = vi.spyOn(UserInvitation, 'create').mockResolvedValue([{}] as never);
    const repository = new UserInvitationsRepository();
    const input = { targetUserId: new Types.ObjectId(), actorId: new Types.ObjectId(), kind: 'new_account' as const, role: 'user' as const, enterpriseId: null, tokenHash: 'hash', expiresAt: new Date() };

    await repository.create(input, session);

    expect(update).toHaveBeenCalledWith({ target_user_id: input.targetUserId, status: 'pending' }, expect.any(Object), { session });
    expect(create).toHaveBeenCalledWith([expect.objectContaining({ target_user_id: input.targetUserId, token_hash: 'hash', status: 'pending' })], { session });
  });

  it('accepts only the addressed pending, unexpired token inside the transaction', async () => {
    const session = {} as never;
    const update = vi.spyOn(UserInvitation, 'updateOne').mockReturnValue({ exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }) } as never);
    const id = new Types.ObjectId();
    const userId = new Types.ObjectId();

    await expect(new UserInvitationsRepository().accept(id, userId, session)).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith({ _id: id, target_user_id: userId, status: 'pending', expires_at: { $gt: expect.any(Date) } }, expect.any(Object), { session });
  });
});
