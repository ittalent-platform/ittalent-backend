import { afterEach, describe, expect, it, vi } from 'vitest';

import { User } from '../../../src/models/user.model.js';
import { UsersRepository } from '../../../src/modules/users/users.repository.js';

// A stand-in for a Mongoose query: every builder method returns the same object and exec() yields the result.
function query(result: unknown): Record<string, ReturnType<typeof vi.fn>> {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'limit', 'lean']) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.exec = vi.fn().mockResolvedValue(result);
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
});
