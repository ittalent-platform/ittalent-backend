import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';

import { Application } from '../../../src/models/application.model.js';
import { ApplicationsRepository } from '../../../src/modules/applications/applications.repository.js';

function mockMongooseQuery(result: unknown): Record<string, ReturnType<typeof vi.fn>> {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['sort', 'skip', 'limit', 'lean']) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.exec = vi.fn().mockResolvedValue(result);
  return chain;
}

describe('ApplicationsRepository (PR 3 additions)', () => {
  const repository = new ApplicationsRepository();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findById', () => {
    it('returns null if given an invalid ObjectId string', async () => {
      const result = await repository.findById('invalid-id');
      expect(result).toBeNull();
    });

    it('queries Application.findById and returns lean doc', async () => {
      const validId = new Types.ObjectId().toString();
      const mockDoc = { _id: new Types.ObjectId(validId), status: 'submitted' };
      vi.spyOn(Application, 'findById').mockReturnValue(mockMongooseQuery(mockDoc) as never);

      const result = await repository.findById(validId);
      expect(result).toEqual(mockDoc);
      expect(Application.findById).toHaveBeenCalledWith(validId);
    });
  });

  describe('findByIdAndJobIds', () => {
    it('returns null immediately if jobIds array is empty', async () => {
      const validId = new Types.ObjectId().toString();
      const findOneSpy = vi.spyOn(Application, 'findOne');

      const result = await repository.findByIdAndJobIds(validId, []);
      expect(result).toBeNull();
      expect(findOneSpy).not.toHaveBeenCalled();
    });

    it('returns null immediately if applicationId is invalid', async () => {
      const findOneSpy = vi.spyOn(Application, 'findOne');

      const result = await repository.findByIdAndJobIds('not-a-valid-id', [
        new Types.ObjectId().toString(),
      ]);
      expect(result).toBeNull();
      expect(findOneSpy).not.toHaveBeenCalled();
    });

    it('queries Application.findOne scoped to jobIds and returns doc', async () => {
      const validAppId = new Types.ObjectId().toString();
      const validJobId = new Types.ObjectId().toString();
      const mockDoc = {
        _id: new Types.ObjectId(validAppId),
        job_id: new Types.ObjectId(validJobId),
        status: 'under_review',
      };

      const findOneSpy = vi
        .spyOn(Application, 'findOne')
        .mockReturnValue(mockMongooseQuery(mockDoc) as never);

      const result = await repository.findByIdAndJobIds(validAppId, [validJobId]);
      expect(result).toEqual(mockDoc);
      expect(findOneSpy).toHaveBeenCalledWith({
        _id: new Types.ObjectId(validAppId),
        job_id: { $in: [new Types.ObjectId(validJobId)] },
      });
    });
  });
});
