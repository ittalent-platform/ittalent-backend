import { afterEach, describe, expect, it, vi } from 'vitest';

import { Application } from '../../../src/models/application.model.js';
import { Interview } from '../../../src/models/interview.model.js';
import { JobPosting } from '../../../src/models/job-posting.model.js';
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

  describe('filters', () => {
    function spyOnFind(): ReturnType<typeof vi.spyOn> {
      vi.spyOn(Interview, 'countDocuments').mockReturnValue(query(0) as never);
      return vi.spyOn(Interview, 'find').mockReturnValue(query([]) as never);
    }

    it('always scopes the query to the enterprise', async () => {
      const find = spyOnFind();
      await repository.findPage({ enterpriseId: ENTERPRISE }, { page: 1, limit: 20, sortBy: 'scheduledAt', sortOrder: 'asc' });
      expect(find).toHaveBeenCalledWith({ $and: [{ enterprise_id: ENTERPRISE }] });
    });

    it('turns every list filter into a condition and filters by start time for the List view', async () => {
      const find = spyOnFind();
      const from = new Date('2026-10-01T00:00:00.000Z');
      const to = new Date('2026-10-31T00:00:00.000Z');
      await repository.findPage(
        {
          enterpriseId: ENTERPRISE,
          interviewerId: INTERVIEWER,
          statuses: ['scheduled', 'completed'],
          mode: 'online',
          jobId: JOB,
          applicationId: 'b00000000000000000000001',
          from,
          to,
          overlapRange: false,
          search: { userIds: [APPLICANT], jobIds: [JOB] },
        },
        { page: 1, limit: 20, sortBy: 'scheduledAt', sortOrder: 'asc' },
      );
      expect(find).toHaveBeenCalledWith({
        $and: [
          { enterprise_id: ENTERPRISE },
          { interviewer_ids: INTERVIEWER },
          { status: { $in: ['scheduled', 'completed'] } },
          { mode: 'online' },
          { job_id: JOB },
          { application_id: 'b00000000000000000000001' },
          { scheduled_at: { $gte: from, $lte: to } },
          { $or: [{ applicant_id: { $in: [APPLICANT] } }, { interviewer_ids: { $in: [APPLICANT] } }, { job_id: { $in: [JOB] } }] },
        ],
      });
    });

    it('selects every interview overlapping the window for the Calendar view', async () => {
      const find = spyOnFind();
      const from = new Date('2026-10-01T00:00:00.000Z');
      const to = new Date('2026-10-08T00:00:00.000Z');
      await repository.findCalendar({ enterpriseId: ENTERPRISE, from, to, overlapRange: true }, 500);
      // An interview that starts before the window but ends inside it still belongs on the calendar.
      expect(find).toHaveBeenCalledWith({
        $and: [{ enterprise_id: ENTERPRISE }, { scheduled_at: { $lt: to } }, { ends_at: { $gt: from } }],
      });
    });

    it('sorts with the id as a tie-breaker and pages with skip and limit', async () => {
      vi.spyOn(Interview, 'countDocuments').mockReturnValue(query(45) as never);
      const chain = query([]);
      vi.spyOn(Interview, 'find').mockReturnValue(chain as never);

      const result = await repository.findPage(
        { enterpriseId: ENTERPRISE },
        { page: 3, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' },
      );

      expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
      expect(chain.skip).toHaveBeenCalledWith(40);
      expect(chain.limit).toHaveBeenCalledWith(20);
      expect(result.total).toBe(45);
    });

    it('lists the calendar earliest first and caps the result', async () => {
      vi.spyOn(Interview, 'countDocuments').mockReturnValue(query(3) as never);
      const chain = query([]);
      vi.spyOn(Interview, 'find').mockReturnValue(chain as never);
      await repository.findCalendar({ enterpriseId: ENTERPRISE }, 500);
      expect(chain.sort).toHaveBeenCalledWith({ scheduled_at: 1, _id: 1 });
      expect(chain.limit).toHaveBeenCalledWith(500);
    });
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

    it('moves a scheduled interview to a new status in one write that also appends the history', async () => {
      const update = vi.spyOn(Interview, 'findOneAndUpdate').mockReturnValue(query(null) as never);
      const endedBefore = new Date('2026-10-13T04:30:00.000Z');

      await repository.transitionFromScheduled('i1', 'completed', 'a00000000000000000000001', {
        note: 'Done',
        endedBefore,
      });

      const [filter, change] = update.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, Record<string, unknown>>];
      expect(filter).toEqual({ _id: 'i1', status: 'scheduled', ends_at: { $lte: endedBefore } });
      expect(change.$set).toEqual({ status: 'completed' });
      expect(change.$push).toMatchObject({ status_history: { status: 'completed', note: 'Done' } });
    });

    it('does not add a time guard to a cancellation', async () => {
      const update = vi.spyOn(Interview, 'findOneAndUpdate').mockReturnValue(query(null) as never);
      await repository.transitionFromScheduled('i1', 'cancelled', 'a00000000000000000000001');
      expect(update.mock.calls[0]?.[0]).toEqual({ _id: 'i1', status: 'scheduled' });
    });

    it('records an applicant-owned reschedule request with an atomic scheduled-state guard', async () => {
      const update = vi.spyOn(Interview, 'findOneAndUpdate').mockReturnValue(query(null) as never);
      const proposedDateTime = new Date('2026-10-14T03:00:00.000Z');

      await repository.requestReschedule('i1', APPLICANT, { proposedDateTime, reason: 'Medical appointment' });

      const [filter, change] = update.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, Record<string, unknown>>];
      expect(filter).toEqual({ _id: 'i1', applicant_id: APPLICANT, status: 'scheduled' });
      expect(change.$set).toMatchObject({
        status: 'reschedule_requested',
        reschedule_request: { proposed_time: proposedDateTime, reason: 'Medical appointment' },
      });
      expect(change.$push).toMatchObject({ status_history: { status: 'reschedule_requested' } });
    });

    it('never deletes a completed interview', async () => {
      const remove = vi.spyOn(Interview, 'findOneAndDelete').mockReturnValue(query(null) as never);
      await repository.deleteNotCompleted('i1');
      expect(remove).toHaveBeenCalledWith({ _id: 'i1', status: { $ne: 'completed' } });
    });
  });

  describe('findSchedulableApplications', () => {
    it('looks at the applications of the enterprise jobs in the given statuses, newest first and capped', async () => {
      vi.spyOn(JobPosting, 'find').mockReturnValue(query([{ _id: JOB }]) as never);
      const chain = query([]);
      const find = vi.spyOn(Application, 'find').mockReturnValue(chain as never);

      await repository.findSchedulableApplications({
        enterpriseId: ENTERPRISE,
        statuses: ['submitted', 'under_review'],
        search: { userIds: [APPLICANT], jobIds: [JOB] },
        limit: 20,
      });

      expect(find).toHaveBeenCalledWith({
        $and: [
          { job_id: { $in: [JOB] } },
          { status: { $in: ['submitted', 'under_review'] } },
          { $or: [{ applicant_id: { $in: [APPLICANT] } }, { job_id: { $in: [JOB] } }] },
        ],
      });
      expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
      expect(chain.limit).toHaveBeenCalledWith(20);
    });

    it('adds no keyword condition when there is no search', async () => {
      vi.spyOn(JobPosting, 'find').mockReturnValue(query([{ _id: JOB }]) as never);
      const find = vi.spyOn(Application, 'find').mockReturnValue(query([]) as never);

      await repository.findSchedulableApplications({ enterpriseId: ENTERPRISE, statuses: ['submitted'], limit: 20 });

      expect(find).toHaveBeenCalledWith({ $and: [{ job_id: { $in: [JOB] } }, { status: { $in: ['submitted'] } }] });
    });

    it('does not query applications when the enterprise has no job', async () => {
      vi.spyOn(JobPosting, 'find').mockReturnValue(query([]) as never);
      const find = vi.spyOn(Application, 'find');

      await expect(
        repository.findSchedulableApplications({ enterpriseId: ENTERPRISE, statuses: ['submitted'], limit: 20 }),
      ).resolves.toEqual([]);
      expect(find).not.toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('matches the enterprise jobs by title, treating the keyword as plain text', async () => {
      const jobs = vi.spyOn(JobPosting, 'find').mockReturnValue(query([{ _id: JOB }]) as never);

      const result = await repository.findJobIdsByTitle(ENTERPRISE, 'a.b(c');

      expect(result).toEqual([JOB]);
      const filter = jobs.mock.calls[0]?.[0] as unknown as { enterprise_id: string; title: RegExp };
      expect(filter.enterprise_id).toBe(ENTERPRISE);
      expect(filter.title.test('xa.b(cx')).toBe(true);
      expect(filter.title.test('xaxb(cx')).toBe(false);
    });
  });
});
