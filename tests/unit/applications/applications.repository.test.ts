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

  describe('addNoteToApplication (PR 4)', () => {
    it('returns null if jobIds array is empty', async () => {
      const validAppId = new Types.ObjectId().toString();
      const updateSpy = vi.spyOn(Application, 'findOneAndUpdate');

      const result = await repository.addNoteToApplication(validAppId, [], {
        authorId: new Types.ObjectId().toString(),
        authorName: 'Recruiter',
        content: 'Test note',
      });
      expect(result).toBeNull();
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('returns null if applicationId is invalid', async () => {
      const updateSpy = vi.spyOn(Application, 'findOneAndUpdate');

      const result = await repository.addNoteToApplication('invalid-id', [new Types.ObjectId().toString()], {
        authorId: new Types.ObjectId().toString(),
        authorName: 'Recruiter',
        content: 'Test note',
      });
      expect(result).toBeNull();
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('calls findOneAndUpdate with $push and returns new note entry on success', async () => {
      const validAppId = new Types.ObjectId().toString();
      const validJobId = new Types.ObjectId().toString();
      const authorId = new Types.ObjectId().toString();
      const updateSpy = vi
        .spyOn(Application, 'findOneAndUpdate')
        .mockReturnValue(mockMongooseQuery({ _id: new Types.ObjectId(validAppId) }) as never);

      const result = await repository.addNoteToApplication(
        validAppId,
        [validJobId],
        { authorId, authorName: 'Lead Recruiter', content: 'Promising candidate' },
      );

      expect(result).not.toBeNull();
      expect(result?.author_name).toBe('Lead Recruiter');
      expect(result?.content).toBe('Promising candidate');
      expect(result?.author_id).toEqual(new Types.ObjectId(authorId));
      expect(result?.created_at).toBeInstanceOf(Date);
      expect(updateSpy).toHaveBeenCalledWith(
        {
          _id: new Types.ObjectId(validAppId),
          job_id: { $in: [new Types.ObjectId(validJobId)] },
        },
        {
          $push: {
            notes: expect.objectContaining({
              author_name: 'Lead Recruiter',
              content: 'Promising candidate',
            }),
          },
        },
        { returnDocument: 'after' },
      );
    });

    it('returns null if findOneAndUpdate does not match any document', async () => {
      const validAppId = new Types.ObjectId().toString();
      const validJobId = new Types.ObjectId().toString();
      vi.spyOn(Application, 'findOneAndUpdate').mockReturnValue(mockMongooseQuery(null) as never);

      const result = await repository.addNoteToApplication(
        validAppId,
        [validJobId],
        { authorId: new Types.ObjectId().toString(), authorName: 'Recruiter', content: 'Note' },
      );
      expect(result).toBeNull();
    });
  });

  describe('findNotesByApplicationId (PR 4)', () => {
    it('returns null if jobIds array is empty or applicationId is invalid', async () => {
      const findOneSpy = vi.spyOn(Application, 'findOne');
      expect(await repository.findNotesByApplicationId('invalid-id', ['job1'])).toBeNull();
      expect(await repository.findNotesByApplicationId(new Types.ObjectId().toString(), [])).toBeNull();
      expect(findOneSpy).not.toHaveBeenCalled();
    });

    it('queries application notes projection and returns notes array', async () => {
      const validAppId = new Types.ObjectId().toString();
      const validJobId = new Types.ObjectId().toString();
      const mockNotes = [
        {
          author_id: new Types.ObjectId(),
          author_name: 'Recruiter 1',
          content: 'Note 1',
          created_at: new Date(),
        },
      ];
      vi.spyOn(Application, 'findOne').mockReturnValue(mockMongooseQuery({ _id: new Types.ObjectId(validAppId), notes: mockNotes }) as never);

      const result = await repository.findNotesByApplicationId(validAppId, [validJobId]);
      expect(result).toEqual(mockNotes);
    });

    it('returns null if application does not exist or is not in enterprise job IDs', async () => {
      const validAppId = new Types.ObjectId().toString();
      const validJobId = new Types.ObjectId().toString();
      vi.spyOn(Application, 'findOne').mockReturnValue(mockMongooseQuery(null) as never);

      const result = await repository.findNotesByApplicationId(validAppId, [validJobId]);
      expect(result).toBeNull();
    });
  });

  describe('updateStatusAtomically (PR 5)', () => {
    it('returns null if enterpriseJobIds is empty or applicationId is invalid', async () => {
      const updateSpy = vi.spyOn(Application, 'findOneAndUpdate');
      expect(
        await repository.updateStatusAtomically('invalid-id', ['job1'], {
          status: 'under_review',
          changedBy: new Types.ObjectId().toString(),
        }),
      ).toBeNull();
      expect(
        await repository.updateStatusAtomically(new Types.ObjectId().toString(), [], {
          status: 'under_review',
          changedBy: new Types.ObjectId().toString(),
        }),
      ).toBeNull();
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('updates status and appends history entry with returnDocument: after', async () => {
      const validAppId = new Types.ObjectId().toString();
      const validJobId = new Types.ObjectId().toString();
      const actorId = new Types.ObjectId().toString();
      const mockUpdated = {
        _id: new Types.ObjectId(validAppId),
        status: 'under_review',
        status_history: [
          { status: 'submitted', changed_at: new Date() },
          { status: 'under_review', changed_at: new Date(), changed_by: new Types.ObjectId(actorId) },
        ],
      };

      const updateSpy = vi.spyOn(Application, 'findOneAndUpdate').mockReturnValue(mockMongooseQuery(mockUpdated) as never);

      const result = await repository.updateStatusAtomically(
        validAppId,
        [validJobId],
        {
          status: 'under_review',
          changedBy: actorId,
          note: 'Cleared initial screening',
          messageToCandidate: 'Under screening',
        },
      );

      expect(result).toEqual(mockUpdated);
      expect(updateSpy).toHaveBeenCalledWith(
        {
          _id: new Types.ObjectId(validAppId),
          job_id: { $in: [new Types.ObjectId(validJobId)] },
        },
        {
          $set: {
            status: 'under_review',
          },
          $push: {
            status_history: expect.objectContaining({
              status: 'under_review',
              actor_role: 'recruiter',
              note: 'Cleared initial screening',
              message_to_candidate: 'Under screening',
            }),
          },
        },
        { returnDocument: 'after' },
      );
    });

    it('includes expectedVersion guard in filter when provided', async () => {
      const validAppId = new Types.ObjectId().toString();
      const validJobId = new Types.ObjectId().toString();
      const actorId = new Types.ObjectId().toString();

      const updateSpy = vi.spyOn(Application, 'findOneAndUpdate').mockReturnValue(mockMongooseQuery(null) as never);

      const result = await repository.updateStatusAtomically(
        validAppId,
        [validJobId],
        {
          status: 'interviewing',
          changedBy: actorId,
        },
        3,
      );

      expect(result).toBeNull();
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: new Types.ObjectId(validAppId),
          $expr: { $eq: [{ $size: '$status_history' }, 3] },
        }),
        expect.any(Object),
        { returnDocument: 'after' },
      );
    });
  });

  describe('countHiredApplications (PR 5)', () => {
    it('returns 0 for invalid jobId', async () => {
      const countSpy = vi.spyOn(Application, 'countDocuments');
      expect(await repository.countHiredApplications('invalid-id')).toBe(0);
      expect(countSpy).not.toHaveBeenCalled();
    });

    it('counts documents matching job_id and status hired', async () => {
      const validJobId = new Types.ObjectId().toString();
      const countSpy = vi.spyOn(Application, 'countDocuments').mockReturnValue({
        exec: vi.fn().mockResolvedValue(2),
      } as never);

      const count = await repository.countHiredApplications(validJobId);
      expect(count).toBe(2);
      expect(countSpy).toHaveBeenCalledWith({
        job_id: new Types.ObjectId(validJobId),
        status: 'hired',
      });
    });
  });

  describe('cascadePositionFilled (PR 5)', () => {
    it('returns 0 for invalid jobId', async () => {
      const updateManySpy = vi.spyOn(Application, 'updateMany');
      expect(await repository.cascadePositionFilled('invalid-id', new Types.ObjectId().toString())).toBe(0);
      expect(updateManySpy).not.toHaveBeenCalled();
    });

    it('updates all active applications except excluded one to position_filled', async () => {
      const validJobId = new Types.ObjectId().toString();
      const excludedAppId = new Types.ObjectId().toString();

      const updateManySpy = vi.spyOn(Application, 'updateMany').mockReturnValue({
        exec: vi.fn().mockResolvedValue({ modifiedCount: 4 }),
      } as never);

      const modifiedCount = await repository.cascadePositionFilled(validJobId, excludedAppId);
      expect(modifiedCount).toBe(4);
      expect(updateManySpy).toHaveBeenCalledWith(
        {
          job_id: new Types.ObjectId(validJobId),
          _id: { $ne: new Types.ObjectId(excludedAppId) },
          status: { $in: ['submitted', 'under_review', 'interviewing', 'offered'] },
        },
        {
          $set: { status: 'position_filled' },
          $push: {
            status_history: expect.objectContaining({
              status: 'position_filled',
              actor_role: 'system',
              note: 'Position filled by another candidate',
            }),
          },
        },
      );
    });
  });

  describe('findApplicantSubmissionsByJobIds (PR 6)', () => {
    it('returns empty array when jobIds is empty', async () => {
      const findSpy = vi.spyOn(Application, 'find');
      const result = await repository.findApplicantSubmissionsByJobIds(
        new Types.ObjectId().toString(),
        [],
      );
      expect(result).toEqual([]);
      expect(findSpy).not.toHaveBeenCalled();
    });

    it('returns empty array when applicantId is invalid', async () => {
      const findSpy = vi.spyOn(Application, 'find');
      const result = await repository.findApplicantSubmissionsByJobIds(
        'not-an-objectid',
        [new Types.ObjectId().toString()],
      );
      expect(result).toEqual([]);
      expect(findSpy).not.toHaveBeenCalled();
    });

    it('queries applications for applicant within specified company job IDs sorted by createdAt descending', async () => {
      const applicantId = new Types.ObjectId().toString();
      const job1Id = new Types.ObjectId().toString();
      const job2Id = new Types.ObjectId().toString();

      const mockDocs = [
        { _id: new Types.ObjectId(), applicant_id: new Types.ObjectId(applicantId), job_id: new Types.ObjectId(job1Id) },
        { _id: new Types.ObjectId(), applicant_id: new Types.ObjectId(applicantId), job_id: new Types.ObjectId(job2Id) },
      ];

      const execMock = vi.fn().mockResolvedValue(mockDocs);
      const leanMock = vi.fn().mockReturnValue({ exec: execMock });
      const sortMock = vi.fn().mockReturnValue({ lean: leanMock });
      const findSpy = vi.spyOn(Application, 'find').mockReturnValue({ sort: sortMock } as never);

      const result = await repository.findApplicantSubmissionsByJobIds(applicantId, [job1Id, job2Id]);

      expect(result).toEqual(mockDocs);
      expect(findSpy).toHaveBeenCalledWith({
        applicant_id: new Types.ObjectId(applicantId),
        job_id: { $in: [new Types.ObjectId(job1Id), new Types.ObjectId(job2Id)] },
      });
      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
    });
  });
});


