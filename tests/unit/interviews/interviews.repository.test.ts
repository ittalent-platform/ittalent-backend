import { afterEach, describe, expect, it, vi } from 'vitest';

import { Interview } from '../../../src/models/interview.model.js';
import { InterviewsRepository } from '../../../src/modules/interviews/interviews.repository.js';

const ENTERPRISE = 'e00000000000000000000001';
const INTERVIEWER = 'a00000000000000000000002';
const APPLICANT = 'a00000000000000000000009';
const JOB = 'c00000000000000000000001';

// A stand-in for a Mongoose query: every builder method returns the same object and exec() yields the result.
function query(result: unknown): Record<string, ReturnType<typeof vi.fn>> {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['sort', 'skip', 'limit', 'lean', 'select']) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.exec = vi.fn().mockResolvedValue(result);
  return chain as Record<string, ReturnType<typeof vi.fn>>;
}

describe('InterviewsRepository', () => {
  const repository = new InterviewsRepository();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findConflict', () => {
    it('looks for a scheduled interview that overlaps the window and shares an interviewer or the applicant', async () => {
      const findOne = vi.spyOn(Interview, 'findOne').mockReturnValue(query(null) as never);
      const startsAt = new Date('2026-10-13T03:00:00.000Z');
      const endsAt = new Date('2026-10-13T04:00:00.000Z');

      await repository.findConflict({ interviewerIds: [INTERVIEWER], applicantId: APPLICANT, startsAt, endsAt, excludeId: 'x' });

      expect(findOne).toHaveBeenCalledWith({
        status: 'scheduled',
        scheduled_at: { $lt: endsAt },
        ends_at: { $gt: startsAt },
        $or: [{ interviewer_ids: { $in: [INTERVIEWER] } }, { applicant_id: APPLICANT }],
        _id: { $ne: 'x' },
      });
    });

    it('does not exclude any interview when creating', async () => {
      const findOne = vi.spyOn(Interview, 'findOne').mockReturnValue(query(null) as never);
      const startsAt = new Date('2026-10-13T03:00:00.000Z');
      await repository.findConflict({ interviewerIds: [INTERVIEWER], applicantId: APPLICANT, startsAt, endsAt: startsAt });
      expect(findOne.mock.calls[0]?.[0]).not.toHaveProperty('_id');
    });
  });

  describe('writes', () => {
    it('stores the creation as the first history entry and leaves out empty optional fields', async () => {
      const create = vi.spyOn(Interview, 'create').mockResolvedValue({ toObject: () => ({ _id: 'i1' }) } as never);
      await repository.create({
        enterpriseId: ENTERPRISE,
        applicationId: 'b00000000000000000000001',
        jobId: JOB,
        applicantId: APPLICANT,
        interviewerIds: [INTERVIEWER],
        createdBy: 'a00000000000000000000001',
        scheduledAt: new Date('2026-10-13T03:00:00.000Z'),
        endsAt: new Date('2026-10-13T04:00:00.000Z'),
        durationMinutes: 60,
        mode: 'onsite',
        location: 'Floor 5',
      });

      const document = create.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
      expect(document).toMatchObject({
        status: 'scheduled',
        location: 'Floor 5',
        status_history: [{ status: 'scheduled', changed_by: 'a00000000000000000000001' }],
      });
      expect(document).not.toHaveProperty('meeting_link');
      expect(document).not.toHaveProperty('notes');
    });

    it('updates only while scheduled, setting given fields and unsetting the ones sent as null', async () => {
      const update = vi.spyOn(Interview, 'findOneAndUpdate').mockReturnValue(query(null) as never);
      await repository.updateScheduled('i1', {
        durationMinutes: 30,
        notes: 'New note',
        meetingLink: null,
        location: undefined,
      });

      expect(update).toHaveBeenCalledWith(
        { _id: 'i1', status: 'scheduled' },
        { $set: { duration_minutes: 30, notes: 'New note' }, $unset: { meeting_link: '' } },
        { returnDocument: 'after' },
      );
    });

    it('never deletes a completed interview', async () => {
      const remove = vi.spyOn(Interview, 'findOneAndDelete').mockReturnValue(query(null) as never);
      await repository.deleteNotCompleted('i1');
      expect(remove).toHaveBeenCalledWith({ _id: 'i1', status: { $ne: 'completed' } });
    });
  });

});
