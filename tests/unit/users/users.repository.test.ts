import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';

import { User } from '../../../src/models/user.model.js';
import { UsersRepository } from '../../../src/modules/users/users.repository.js';

// A stand-in for a Mongoose query: every builder method returns the same object and exec() yields the result.
function query(result: unknown): Record<string, ReturnType<typeof vi.fn>> {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'limit', 'lean', 'sort', 'session']) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.exec = vi.fn().mockResolvedValue(result);
  chain.then = vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve));
  return chain as Record<string, ReturnType<typeof vi.fn>>;
}

describe('UsersRepository lookups for other modules', () => {
  const repository = new UsersRepository();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findByIds', () => {
    it('does not query when there is nothing to look up', async () => {
      const find = vi.spyOn(User, 'find');
      await expect(repository.findByIds([])).resolves.toEqual([]);
      expect(find).not.toHaveBeenCalled();
    });

    it('reads only the fields another module needs to name, email and authorise a person', async () => {
      const chain = query([{ _id: 'u1' }]);
      const find = vi.spyOn(User, 'find').mockReturnValue(chain as never);

      await repository.findByIds(['u1', 'u2']);

      expect(find).toHaveBeenCalledWith({ _id: { $in: ['u1', 'u2'] } });
      expect(chain.select).toHaveBeenCalledWith('email username full_name role status enterprise_id');
    });
  });

  describe('findIdsByKeyword', () => {
    it('matches name, email or username, treating the keyword as plain text, and returns the ids', async () => {
      const chain = query([{ _id: 'u1' }, { _id: 'u2' }]);
      const find = vi.spyOn(User, 'find').mockReturnValue(chain as never);

      const ids = await repository.findIdsByKeyword('a.b(c', 25);

      expect(ids).toEqual(['u1', 'u2']);
      expect(chain.limit).toHaveBeenCalledWith(25);
      const filter = find.mock.calls[0]?.[0] as unknown as { $or: Record<string, RegExp>[] };
      expect(filter.$or).toHaveLength(3);
      const pattern = filter.$or[0]?.full_name as RegExp;
      expect(pattern.test('xa.b(cx')).toBe(true);
      expect(pattern.test('xaxb(cx')).toBe(false);
      expect(Object.keys(filter.$or[1] ?? {})).toEqual(['email']);
      expect(Object.keys(filter.$or[2] ?? {})).toEqual(['username']);
    });
  });

  describe('findNamesByIds', () => {
    it('projects actor display fields through the users repository', async () => {
      const chain = query([{ _id: 'u1', full_name: 'Alice', username: 'alice' }]);
      const find = vi.spyOn(User, 'find').mockReturnValue(chain as never);

      await expect(repository.findNamesByIds(['u1'])).resolves.toEqual(new Map([['u1', 'Alice']]));
      expect(find).toHaveBeenCalledWith({ _id: { $in: ['u1'] } });
      expect(chain.select).toHaveBeenCalledWith('full_name username');
    });
  });

  describe('acquireAdminMutationLock', () => {
    it('increments one deterministic active-admin coordinator inside the caller transaction', async () => {
      const session = {} as never;
      const findChain = query({ _id: 'coordinator' });
      const updateChain = query({ matchedCount: 1 });
      const find = vi.spyOn(User, 'findOne').mockReturnValue(findChain as never);
      const update = vi.spyOn(User, 'updateOne').mockReturnValue(updateChain as never);

      await repository.acquireAdminMutationLock(new Types.ObjectId(), session);

      expect(find).toHaveBeenCalledWith({ role: 'admin', status: 'active' });
      expect(findChain.sort).toHaveBeenCalledWith({ _id: 1 });
      expect(findChain.session).toHaveBeenCalledWith(session);
      expect(update).toHaveBeenCalledWith({ _id: 'coordinator', role: 'admin', status: 'active' }, { $inc: { admin_lock_version: 1 } }, { session, timestamps: false });
    });

    it('fails explicitly when no active coordinator exists', async () => {
      const findChain = query(null);
      vi.spyOn(User, 'findOne').mockReturnValue(findChain as never);

      await expect(repository.acquireAdminMutationLock(new Types.ObjectId(), {} as never)).rejects.toThrow('Active administrator lock record missing');
    });
  });
});
