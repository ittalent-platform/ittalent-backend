import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApplicationStatus } from '../../../src/models/application.model.js';
import type { InterviewDoc, InterviewStatus } from '../../../src/models/interview.model.js';
import type { UserDoc } from '../../../src/models/user.model.js';
import { INTERVIEW_CONFIG, INTERVIEW_ERROR_CODES } from '../../../src/modules/interviews/interviews.constants.js';
import type { InterviewsRepository } from '../../../src/modules/interviews/interviews.repository.js';
import { InterviewsService, type InterviewActor } from '../../../src/modules/interviews/interviews.service.js';
import type { NotificationsService } from '../../../src/modules/notifications/notifications.service.js';
import type { UsersService } from '../../../src/modules/users/users.service.js';
import { sendInterviewEmail } from '../../../src/shared/services/email.service.js';

vi.mock('../../../src/shared/services/email.service.js', () => ({
  sendInterviewEmail: vi.fn().mockResolvedValue(undefined),
  consumeEmailDeliveryStatus: vi.fn().mockReturnValue(true),
}));

const ENTERPRISE = 'e00000000000000000000001';
const OTHER_ENTERPRISE = 'e00000000000000000000002';
const RECRUITER = 'a00000000000000000000001';
const INTERVIEWER_A = 'a00000000000000000000002';
const INTERVIEWER_B = 'a00000000000000000000003';
const APPLICANT = 'a00000000000000000000009';
const APPLICATION = 'b00000000000000000000001';
const JOB = 'c00000000000000000000001';
const INTERVIEW_ID = 'd00000000000000000000001';

const NOW = new Date('2026-10-12T03:00:00.000Z');
const IN_ONE_DAY = '2026-10-13T03:00:00.000Z';
const HOUR_MS = 3_600_000;

const recruiter: InterviewActor = { id: RECRUITER, role: 'recruiter' };
const applicant: InterviewActor = { id: APPLICANT, role: 'user' };

function user(id: string, overrides: Record<string, unknown> = {}): UserDoc {
  return {
    _id: id,
    email: `${id}@example.com`,
    username: id,
    full_name: `User ${id.slice(-1)}`,
    role: 'recruiter',
    status: 'active',
    enterprise_id: ENTERPRISE,
    ...overrides,
  } as unknown as UserDoc;
}

function interview(overrides: Partial<Record<keyof InterviewDoc, unknown>> = {}): InterviewDoc {
  const scheduledAt = new Date(IN_ONE_DAY);
  return {
    _id: INTERVIEW_ID,
    enterprise_id: ENTERPRISE,
    application_id: APPLICATION,
    job_id: JOB,
    applicant_id: APPLICANT,
    interviewer_ids: [INTERVIEWER_A],
    created_by: RECRUITER,
    scheduled_at: scheduledAt,
    ends_at: new Date(scheduledAt.getTime() + HOUR_MS),
    duration_minutes: 60,
    mode: 'online',
    meeting_link: 'https://meet.example.com/room',
    status: 'scheduled',
    status_history: [{ status: 'scheduled', changed_at: NOW, changed_by: RECRUITER }],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as unknown as InterviewDoc;
}

const createBody = {
  applicationId: APPLICATION,
  interviewerIds: [INTERVIEWER_A, INTERVIEWER_B],
  scheduledAt: IN_ONE_DAY,
  durationMinutes: 60,
  mode: 'online' as const,
  meetingLink: 'https://meet.example.com/room',
};

function makeRepository(): Record<keyof InterviewsRepository, ReturnType<typeof vi.fn>> {
  return {
    findApplicationContext: vi.fn().mockResolvedValue({
      application: { _id: APPLICATION, job_id: JOB, applicant_id: APPLICANT, status: 'under_review' },
      job: { _id: JOB, enterprise_id: ENTERPRISE, title: 'Backend Engineer' },
    }),
    findJobTitles: vi.fn().mockResolvedValue(new Map([[JOB, 'Backend Engineer']])),
    findEnterpriseName: vi.fn().mockResolvedValue('Acme'),
    findJobIdsByTitle: vi.fn().mockResolvedValue([]),
    findConflict: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async () => interview({ interviewer_ids: [INTERVIEWER_A, INTERVIEWER_B] })),
    findById: vi.fn().mockResolvedValue(interview()),
    updateScheduled: vi.fn().mockImplementation(async () => interview()),
    transitionFromScheduled: vi.fn().mockImplementation(async (_id: string, status: InterviewStatus) => interview({ status })),
    requestReschedule: vi.fn().mockImplementation(async (_id: string, _applicantId: string, record: { proposedDateTime: Date; reason: string }) =>
      interview({
        status: 'reschedule_requested',
        reschedule_request: { proposed_time: record.proposedDateTime, reason: record.reason, requested_at: NOW },
      }),
    ),
    deleteNotCompleted: vi.fn().mockResolvedValue(interview()),
    findPage: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    findCalendar: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    findSchedulableApplications: vi.fn().mockResolvedValue([]),
  } as unknown as Record<keyof InterviewsRepository, ReturnType<typeof vi.fn>>;
}

describe('InterviewsService', () => {
  let repository: ReturnType<typeof makeRepository>;
  let users: {
    getEnterpriseId: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findByIds: ReturnType<typeof vi.fn>;
    findIdsByKeyword: ReturnType<typeof vi.fn>;
    findRecruitersByEnterpriseId: ReturnType<typeof vi.fn>;
  };
  let notifications: { dispatch: ReturnType<typeof vi.fn> };
  let service: InterviewsService;
  let now: Date;

  beforeEach(() => {
    vi.mocked(sendInterviewEmail).mockClear();
    repository = makeRepository();
    users = {
      getEnterpriseId: vi.fn().mockResolvedValue(ENTERPRISE),
      findById: vi.fn().mockResolvedValue({ _id: APPLICANT, email: 'applicant@example.com', status: 'active' }),
      findByIds: vi.fn().mockImplementation(async (ids: string[]) => ids.map((id) => user(id))),
      findIdsByKeyword: vi.fn().mockResolvedValue([]),
      findRecruitersByEnterpriseId: vi.fn().mockResolvedValue([]),
    };
    notifications = {
      dispatch: vi.fn().mockResolvedValue({ id: 'noti-123' }),
    };
    now = NOW;
    service = new InterviewsService(
      repository as unknown as InterviewsRepository,
      users as unknown as UsersService,
      () => now,
      notifications as unknown as NotificationsService,
    );
  });

  describe('create', () => {
    it.each(['user', 'applicant', 'admin'])('refuses a %s before looking anything up', async (role) => {
      await expect(service.create({ id: RECRUITER, role }, createBody)).rejects.toMatchObject({ statusCode: 403 });
      expect(users.getEnterpriseId).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('schedules the interview, works out the end time and emails the applicant and every interviewer', async () => {
      const result = await service.create(recruiter, createBody);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          enterpriseId: ENTERPRISE,
          applicationId: APPLICATION,
          jobId: JOB,
          applicantId: APPLICANT,
          interviewerIds: [INTERVIEWER_A, INTERVIEWER_B],
          createdBy: RECRUITER,
          scheduledAt: new Date(IN_ONE_DAY),
          endsAt: new Date(new Date(IN_ONE_DAY).getTime() + HOUR_MS),
          durationMinutes: 60,
          mode: 'online',
        }),
      );
      expect(result).toMatchObject({
        id: INTERVIEW_ID,
        status: 'scheduled',
        job: { id: JOB, title: 'Backend Engineer' },
        statusHistory: [{ status: 'scheduled', changedBy: RECRUITER }],
      });
      const recipients = vi.mocked(sendInterviewEmail).mock.calls.map(([input]) => input.to).sort();
      expect(recipients).toEqual(
        [APPLICANT, INTERVIEWER_A, INTERVIEWER_B].map((id) => `${id}@example.com`).sort(),
      );
      expect(vi.mocked(sendInterviewEmail).mock.calls[0]?.[0]).toMatchObject({
        kind: 'scheduled',
        jobTitle: 'Backend Engineer',
        companyName: 'Acme',
      });
      expect(notifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: APPLICANT,
          type: 'interview_scheduled',
          category: 'action_required',
        }),
      );
      expect(notifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: INTERVIEWER_A,
          type: 'interview_scheduled',
          category: 'action_required',
        }),
      );
    });

    it('sends one mail per address even when a person is listed twice', async () => {
      repository.create!.mockResolvedValue(interview({ interviewer_ids: [INTERVIEWER_A, INTERVIEWER_A] }));
      await service.create(recruiter, createBody);
      expect(vi.mocked(sendInterviewEmail)).toHaveBeenCalledTimes(2);
    });

    it('does not fail the request when an email cannot be sent', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.mocked(sendInterviewEmail).mockRejectedValueOnce(new Error('brevo down'));
      await expect(service.create(recruiter, createBody)).resolves.toMatchObject({ id: INTERVIEW_ID });
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('rejects an account that is not assigned to an enterprise', async () => {
      users.getEnterpriseId.mockResolvedValue(null);
      await expect(service.create(recruiter, createBody)).rejects.toMatchObject({ statusCode: 403 });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('treats an application of another enterprise like a missing one', async () => {
      repository.findApplicationContext!.mockResolvedValue({
        application: { _id: APPLICATION, job_id: JOB, applicant_id: APPLICANT, status: 'submitted' },
        job: { _id: JOB, enterprise_id: OTHER_ENTERPRISE, title: 'Other job' },
      });
      await expect(service.create(recruiter, createBody)).rejects.toMatchObject({ statusCode: 404 });

      repository.findApplicationContext!.mockResolvedValue(null);
      await expect(service.create(recruiter, createBody)).rejects.toMatchObject({ statusCode: 404 });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it.each<ApplicationStatus>(['offered', 'hired', 'rejected', 'withdrawn'])(
      'refuses an application that is %s',
      async (status) => {
        repository.findApplicationContext!.mockResolvedValue({
          application: { _id: APPLICATION, job_id: JOB, applicant_id: APPLICANT, status },
          job: { _id: JOB, enterprise_id: ENTERPRISE, title: 'Backend Engineer' },
        });
        await expect(service.create(recruiter, createBody)).rejects.toMatchObject({
          statusCode: 409,
          code: INTERVIEW_ERROR_CODES.APPLICATION_NOT_SCHEDULABLE,
        });
      },
    );

    it.each<ApplicationStatus>(['submitted', 'under_review', 'interviewing'])('accepts an application that is %s', async (status) => {
      repository.findApplicationContext!.mockResolvedValue({
        application: { _id: APPLICATION, job_id: JOB, applicant_id: APPLICANT, status },
        job: { _id: JOB, enterprise_id: ENTERPRISE, title: 'Backend Engineer' },
      });
      await expect(service.create(recruiter, createBody)).resolves.toBeDefined();
    });

    it('rejects a time that is not in the future', async () => {
      await expect(service.create(recruiter, { ...createBody, scheduledAt: NOW.toISOString() })).rejects.toMatchObject({
        statusCode: 400,
        code: INTERVIEW_ERROR_CODES.TIME_IN_PAST,
      });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('requires a link for an online interview and a location for an onsite one', async () => {
      const withoutLink = { ...createBody, meetingLink: undefined };
      await expect(service.create(recruiter, withoutLink)).rejects.toMatchObject({ statusCode: 400 });
      await expect(service.create(recruiter, { ...withoutLink, mode: 'onsite' })).rejects.toMatchObject({ statusCode: 400 });
      await expect(service.create(recruiter, { ...withoutLink, mode: 'onsite', location: 'Floor 5' })).resolves.toBeDefined();
    });

    it.each([
      ['a recruiter of another enterprise', { enterprise_id: OTHER_ENTERPRISE }],
      ['a user who is not a recruiter', { role: 'user' }],
      ['an admin', { role: 'admin' }],
      ['a suspended recruiter', { status: 'suspended' }],
    ])('rejects %s', async (_label, overrides) => {
      users.findByIds.mockResolvedValue([user(INTERVIEWER_A), user(INTERVIEWER_B, overrides)]);
      await expect(service.create(recruiter, createBody)).rejects.toMatchObject({
        statusCode: 400,
        code: INTERVIEW_ERROR_CODES.INVALID_INTERVIEWERS,
      });
    });

    it('rejects an interviewer that does not exist', async () => {
      users.findByIds.mockResolvedValue([user(INTERVIEWER_A)]);
      await expect(service.create(recruiter, createBody)).rejects.toMatchObject({ code: INTERVIEW_ERROR_CODES.INVALID_INTERVIEWERS });
    });

    it('never stores the same interviewer twice', async () => {
      users.findByIds.mockResolvedValue([user(INTERVIEWER_A)]);
      await expect(
        service.create(recruiter, { ...createBody, interviewerIds: [INTERVIEWER_A, INTERVIEWER_A] }),
      ).rejects.toMatchObject({ statusCode: 400, code: INTERVIEW_ERROR_CODES.INVALID_INTERVIEWERS });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rejects an applicant whose account is not active', async () => {
      users.findById.mockResolvedValue({ _id: APPLICANT, status: 'blocked' });
      await expect(service.create(recruiter, createBody)).rejects.toMatchObject({ code: INTERVIEW_ERROR_CODES.APPLICANT_UNAVAILABLE });
    });

    it('reports an interviewer who is already booked, and an applicant who is already booked', async () => {
      repository.findConflict!.mockResolvedValue(interview({ applicant_id: 'a000000000000000000000ff' }));
      await expect(service.create(recruiter, createBody)).rejects.toMatchObject({
        statusCode: 409,
        code: INTERVIEW_ERROR_CODES.INTERVIEWER_CONFLICT,
      });

      repository.findConflict!.mockResolvedValue(interview({ applicant_id: APPLICANT }));
      await expect(service.create(recruiter, createBody)).rejects.toMatchObject({
        statusCode: 409,
        code: INTERVIEW_ERROR_CODES.APPLICANT_CONFLICT,
      });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('checks the overlap against the whole window of the new interview', async () => {
      await service.create(recruiter, { ...createBody, durationMinutes: 90 });
      const start = new Date(IN_ONE_DAY);
      expect(repository.findConflict).toHaveBeenCalledWith({
        interviewerIds: [INTERVIEWER_A, INTERVIEWER_B],
        applicantId: APPLICANT,
        startsAt: start,
        endsAt: new Date(start.getTime() + 90 * 60_000),
      });
    });
  });

  describe('update', () => {
    it('changes the interview and emails the participants the new details', async () => {
      const result = await service.update(recruiter, INTERVIEW_ID, { notes: 'Bring a laptop' });

      expect(repository.updateScheduled).toHaveBeenCalledWith(
        INTERVIEW_ID,
        expect.objectContaining({ notes: 'Bring a laptop', mode: 'online', durationMinutes: 60 }),
      );
      expect(result.id).toBe(INTERVIEW_ID);
      expect(vi.mocked(sendInterviewEmail).mock.calls.every(([input]) => input.kind === 'updated')).toBe(true);
      expect(vi.mocked(sendInterviewEmail)).toHaveBeenCalledTimes(2);
      expect(notifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: APPLICANT,
          type: 'interview_rescheduled',
          category: 'action_required',
        }),
      );
    });

    it('never stores the same interviewer twice, even when the head count is unchanged', async () => {
      repository.findById!.mockResolvedValue(interview({ interviewer_ids: [INTERVIEWER_A, INTERVIEWER_B] }));
      await expect(
        service.update(recruiter, INTERVIEW_ID, { interviewerIds: [INTERVIEWER_A, INTERVIEWER_A] }),
      ).rejects.toMatchObject({ statusCode: 400, code: INTERVIEW_ERROR_CODES.INVALID_INTERVIEWERS });
      expect(repository.updateScheduled).not.toHaveBeenCalled();
    });

    it('moves the interview, re-checks the overlap without counting itself and recomputes the end', async () => {
      const newStart = '2026-10-14T08:00:00.000Z';
      await service.update(recruiter, INTERVIEW_ID, { scheduledAt: newStart, durationMinutes: 30 });
      expect(repository.findConflict).toHaveBeenCalledWith(
        expect.objectContaining({
          excludeId: INTERVIEW_ID,
          startsAt: new Date(newStart),
          endsAt: new Date(new Date(newStart).getTime() + 30 * 60_000),
        }),
      );
      expect(repository.updateScheduled).toHaveBeenCalledWith(
        INTERVIEW_ID,
        expect.objectContaining({ scheduledAt: new Date(newStart), durationMinutes: 30 }),
      );
    });

    it('does not re-check the overlap when only the notes change', async () => {
      await service.update(recruiter, INTERVIEW_ID, { notes: 'x' });
      expect(repository.findConflict).not.toHaveBeenCalled();
    });

    it('reports a new overlap', async () => {
      repository.findConflict!.mockResolvedValue(interview({ applicant_id: 'a000000000000000000000ff' }));
      await expect(
        service.update(recruiter, INTERVIEW_ID, { scheduledAt: '2026-10-14T08:00:00.000Z' }),
      ).rejects.toMatchObject({ statusCode: 409, code: INTERVIEW_ERROR_CODES.INTERVIEWER_CONFLICT });
      expect(repository.updateScheduled).not.toHaveBeenCalled();
    });

    it('rejects a new time in the past but lets the notes of a running interview change', async () => {
      await expect(
        service.update(recruiter, INTERVIEW_ID, { scheduledAt: '2026-10-11T03:00:00.000Z' }),
      ).rejects.toMatchObject({ statusCode: 400, code: INTERVIEW_ERROR_CODES.TIME_IN_PAST });

      now = new Date('2026-10-13T03:30:00.000Z');
      await expect(
        service.update(recruiter, INTERVIEW_ID, { scheduledAt: IN_ONE_DAY, notes: 'Running late' }),
      ).resolves.toBeDefined();
    });

    it.each<InterviewStatus>(['completed', 'cancelled', 'no_show'])('refuses to change a %s interview', async (status) => {
      repository.findById!.mockResolvedValue(interview({ status }));
      await expect(service.update(recruiter, INTERVIEW_ID, { notes: 'x' })).rejects.toMatchObject({
        statusCode: 409,
        code: INTERVIEW_ERROR_CODES.NOT_EDITABLE,
      });
    });

    it('hides an interview of another enterprise', async () => {
      repository.findById!.mockResolvedValue(interview({ enterprise_id: OTHER_ENTERPRISE }));
      await expect(service.update(recruiter, INTERVIEW_ID, { notes: 'x' })).rejects.toMatchObject({ statusCode: 404 });
    });

    it('clears the link with null and refuses to leave an online interview without one', async () => {
      await expect(service.update(recruiter, INTERVIEW_ID, { meetingLink: null })).rejects.toMatchObject({ statusCode: 400 });
      await expect(
        service.update(recruiter, INTERVIEW_ID, { mode: 'onsite', location: 'Floor 5', meetingLink: null }),
      ).resolves.toBeDefined();
      expect(repository.updateScheduled).toHaveBeenCalledWith(
        INTERVIEW_ID,
        expect.objectContaining({ mode: 'onsite', location: 'Floor 5', meetingLink: null }),
      );
    });

    it('validates new interviewers and tells removed ones the interview no longer involves them', async () => {
      repository.findById!.mockResolvedValue(interview({ interviewer_ids: [INTERVIEWER_A, INTERVIEWER_B] }));
      repository.updateScheduled!.mockResolvedValue(interview({ interviewer_ids: [INTERVIEWER_A] }));

      await service.update(recruiter, INTERVIEW_ID, { interviewerIds: [INTERVIEWER_A] });

      const sent = vi.mocked(sendInterviewEmail).mock.calls.map(([input]) => [input.kind, input.to]);
      expect(sent).toContainEqual(['cancelled', `${INTERVIEWER_B}@example.com`]);
      expect(sent).toContainEqual(['updated', `${INTERVIEWER_A}@example.com`]);
      expect(sent).not.toContainEqual(['cancelled', `${INTERVIEWER_A}@example.com`]);
    });

    it('rejects an interviewer who is not eligible', async () => {
      users.findByIds.mockResolvedValue([user(INTERVIEWER_B, { enterprise_id: OTHER_ENTERPRISE })]);
      await expect(
        service.update(recruiter, INTERVIEW_ID, { interviewerIds: [INTERVIEWER_B] }),
      ).rejects.toMatchObject({ code: INTERVIEW_ERROR_CODES.INVALID_INTERVIEWERS });
    });

    it('reports a concurrent change instead of overwriting it', async () => {
      repository.updateScheduled!.mockResolvedValue(null);
      await expect(service.update(recruiter, INTERVIEW_ID, { notes: 'x' })).rejects.toMatchObject({
        statusCode: 409,
        code: INTERVIEW_ERROR_CODES.STATE_CHANGED,
      });
    });
  });

  describe('updateStatus', () => {
    it.each<'completed' | 'no_show'>(['completed', 'no_show'])(
      'refuses %s before the interview has ended',
      async (status) => {
        now = new Date('2026-10-13T03:59:59.999Z');
        await expect(service.updateStatus(recruiter, INTERVIEW_ID, { status })).rejects.toMatchObject({
          statusCode: 409,
          code: INTERVIEW_ERROR_CODES.NOT_ENDED,
        });
        expect(repository.transitionFromScheduled).not.toHaveBeenCalled();
      },
    );

    it('completes the interview from the moment it has ended', async () => {
      now = new Date('2026-10-13T04:00:00.000Z');
      const result = await service.updateStatus(recruiter, INTERVIEW_ID, { status: 'completed', note: 'Strong candidate' });

      expect(repository.transitionFromScheduled).toHaveBeenCalledWith(INTERVIEW_ID, 'completed', RECRUITER, {
        note: 'Strong candidate',
        endedBefore: now,
      });
      expect(result.status).toBe('completed');
      expect(sendInterviewEmail).not.toHaveBeenCalled();
    });

    it('marks a no-show once the interview has ended', async () => {
      now = new Date('2026-10-13T04:10:00.000Z');
      await expect(service.updateStatus(recruiter, INTERVIEW_ID, { status: 'no_show' })).resolves.toMatchObject({ status: 'no_show' });
    });

    it('cancels at any time without the time guard and emails the participants', async () => {
      const result = await service.updateStatus(recruiter, INTERVIEW_ID, { status: 'cancelled', note: 'Role closed' });

      expect(repository.transitionFromScheduled).toHaveBeenCalledWith(INTERVIEW_ID, 'cancelled', RECRUITER, {
        note: 'Role closed',
        endedBefore: undefined,
      });
      expect(result.status).toBe('cancelled');
      expect(vi.mocked(sendInterviewEmail).mock.calls.every(([input]) => input.kind === 'cancelled')).toBe(true);
      expect(vi.mocked(sendInterviewEmail)).toHaveBeenCalledTimes(2);
      expect(notifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: APPLICANT,
          type: 'interview_cancelled',
          category: 'warning',
        }),
      );
    });

    it.each<InterviewStatus>(['completed', 'cancelled', 'no_show'])('does not change a %s interview again', async (status) => {
      repository.findById!.mockResolvedValue(interview({ status }));
      now = new Date('2026-10-14T00:00:00.000Z');
      await expect(service.updateStatus(recruiter, INTERVIEW_ID, { status: 'completed' })).rejects.toMatchObject({
        statusCode: 409,
        code: INTERVIEW_ERROR_CODES.ALREADY_FINAL,
      });
    });

    it('reports a concurrent change (for example the interview was just moved to a later time)', async () => {
      now = new Date('2026-10-13T04:00:00.000Z');
      repository.transitionFromScheduled!.mockResolvedValue(null);
      await expect(service.updateStatus(recruiter, INTERVIEW_ID, { status: 'completed' })).rejects.toMatchObject({
        code: INTERVIEW_ERROR_CODES.STATE_CHANGED,
      });
    });

    it('hides an interview of another enterprise', async () => {
      repository.findById!.mockResolvedValue(interview({ enterprise_id: OTHER_ENTERPRISE }));
      await expect(service.updateStatus(recruiter, INTERVIEW_ID, { status: 'cancelled' })).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('requestReschedule', () => {
    const body = { proposedDateTime: '2026-10-14T03:00:00.000Z', reason: 'Medical appointment' };

    it('records the owner applicant response, persists it, and returns the pending request', async () => {
      const result = await service.requestReschedule(applicant, INTERVIEW_ID, body);

      expect(repository.requestReschedule).toHaveBeenCalledWith(INTERVIEW_ID, APPLICANT, {
        proposedDateTime: new Date(body.proposedDateTime),
        reason: body.reason,
      });
      expect(result).toMatchObject({
        id: INTERVIEW_ID,
        status: 'reschedule_requested',
        rescheduleRequest: { proposedDateTime: body.proposedDateTime, reason: body.reason, requestedAt: NOW.toISOString() },
      });
    });

    it.each(['recruiter', 'admin', 'applicant'])('rejects a %s before reading the interview', async (role) => {
      await expect(service.requestReschedule({ id: APPLICANT, role }, INTERVIEW_ID, body)).rejects.toMatchObject({ statusCode: 403 });
      expect(repository.findById).not.toHaveBeenCalled();
    });

    it('rejects a missing interview and a schedule owned by somebody else', async () => {
      repository.findById!.mockResolvedValueOnce(null);
      await expect(service.requestReschedule(applicant, INTERVIEW_ID, body)).rejects.toMatchObject({ statusCode: 404 });

      repository.findById!.mockResolvedValueOnce(interview({ applicant_id: 'a000000000000000000000ff' }));
      await expect(service.requestReschedule(applicant, INTERVIEW_ID, body)).rejects.toMatchObject({ statusCode: 403 });
      expect(repository.requestReschedule).not.toHaveBeenCalled();
    });

    it.each<InterviewStatus>(['reschedule_requested', 'completed', 'cancelled', 'no_show'])(
      'rejects a duplicate or invalid response while the interview is %s',
      async (status) => {
        repository.findById!.mockResolvedValue(interview({ status }));
        await expect(service.requestReschedule(applicant, INTERVIEW_ID, body)).rejects.toMatchObject({ statusCode: 409 });
        expect(repository.requestReschedule).not.toHaveBeenCalled();
      },
    );

    it('reports a concurrent state transition without overwriting it', async () => {
      repository.requestReschedule!.mockResolvedValue(null);
      await expect(service.requestReschedule(applicant, INTERVIEW_ID, body)).rejects.toMatchObject({
        statusCode: 409,
        code: INTERVIEW_ERROR_CODES.STATE_CHANGED,
      });
    });
  });

  describe('remove', () => {
    it('deletes a scheduled interview and tells the participants it is cancelled', async () => {
      await service.remove(recruiter, INTERVIEW_ID);
      expect(repository.deleteNotCompleted).toHaveBeenCalledWith(INTERVIEW_ID);
      expect(vi.mocked(sendInterviewEmail).mock.calls.every(([input]) => input.kind === 'cancelled')).toBe(true);
      expect(vi.mocked(sendInterviewEmail)).toHaveBeenCalledTimes(2);
    });

    it('deletes a cancelled interview without sending mail', async () => {
      repository.findById!.mockResolvedValue(interview({ status: 'cancelled' }));
      repository.deleteNotCompleted!.mockResolvedValue(interview({ status: 'cancelled' }));
      await service.remove(recruiter, INTERVIEW_ID);
      expect(sendInterviewEmail).not.toHaveBeenCalled();
    });

    it('keeps a completed interview', async () => {
      repository.findById!.mockResolvedValue(interview({ status: 'completed' }));
      await expect(service.remove(recruiter, INTERVIEW_ID)).rejects.toMatchObject({
        statusCode: 409,
        code: INTERVIEW_ERROR_CODES.COMPLETED_NOT_DELETABLE,
      });
      expect(repository.deleteNotCompleted).not.toHaveBeenCalled();
    });

    it('reports an interview that was completed while the delete ran', async () => {
      repository.deleteNotCompleted!.mockResolvedValue(null);
      await expect(service.remove(recruiter, INTERVIEW_ID)).rejects.toMatchObject({ code: INTERVIEW_ERROR_CODES.STATE_CHANGED });
    });

    it('hides an interview of another enterprise', async () => {
      repository.findById!.mockResolvedValue(interview({ enterprise_id: OTHER_ENTERPRISE }));
      await expect(service.remove(recruiter, INTERVIEW_ID)).rejects.toMatchObject({ statusCode: 404 });
      expect(repository.deleteNotCompleted).not.toHaveBeenCalled();
    });
  });

  describe('detail', () => {
    it('refuses a caller who is not a recruiter', async () => {
      await expect(service.getDetail({ id: RECRUITER, role: 'user' }, INTERVIEW_ID)).rejects.toMatchObject({ statusCode: 403 });
      expect(repository.findById).not.toHaveBeenCalled();
    });

    it('returns the participants, the job and the history, and flags when the interview can be completed', async () => {
      const early = await service.getDetail(recruiter, INTERVIEW_ID);
      expect(early).toMatchObject({
        id: INTERVIEW_ID,
        scheduledAt: IN_ONE_DAY,
        applicant: { id: APPLICANT, email: `${APPLICANT}@example.com` },
        interviewers: [{ id: INTERVIEWER_A }],
        job: { id: JOB, title: 'Backend Engineer' },
        canComplete: false,
        statusHistory: [{ status: 'scheduled' }],
      });

      now = new Date('2026-10-13T03:59:59.999Z');
      expect((await service.getDetail(recruiter, INTERVIEW_ID)).canComplete).toBe(false);

      now = new Date('2026-10-13T04:00:00.000Z');
      expect((await service.getDetail(recruiter, INTERVIEW_ID)).canComplete).toBe(true);

      repository.findById!.mockResolvedValue(interview({ status: 'completed' }));
      expect((await service.getDetail(recruiter, INTERVIEW_ID)).canComplete).toBe(false);
    });

    it('hides an interview of another enterprise', async () => {
      repository.findById!.mockResolvedValue(interview({ enterprise_id: OTHER_ENTERPRISE }));
      await expect(service.getDetail(recruiter, INTERVIEW_ID)).rejects.toMatchObject({ statusCode: 404 });
      repository.findById!.mockResolvedValue(null);
      await expect(service.getDetail(recruiter, INTERVIEW_ID)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('list (List view)', () => {
    const query = { page: 2, limit: 10, sortBy: 'scheduledAt', sortOrder: 'asc' } as const;

    it('applies the filters and pages the result', async () => {
      repository.findPage!.mockResolvedValue({ items: [interview()], total: 21 });
      const from = new Date('2026-10-01T00:00:00.000Z');
      const to = new Date('2026-10-31T00:00:00.000Z');

      const result = await service.list(recruiter, {
        ...query,
        status: 'scheduled, completed',
        mode: 'online',
        jobId: JOB,
        applicationId: APPLICATION,
        interviewerId: INTERVIEWER_A,
        from,
        to,
      });

      expect(repository.findPage).toHaveBeenCalledWith(
        {
          enterpriseId: ENTERPRISE,
          interviewerId: INTERVIEWER_A,
          statuses: ['scheduled', 'completed'],
          mode: 'online',
          jobId: JOB,
          applicationId: APPLICATION,
          from,
          to,
          overlapRange: false,
          search: undefined,
        },
        { page: 2, limit: 10, sortBy: 'scheduledAt', sortOrder: 'asc' },
      );
      expect(result).toMatchObject({ page: 2, limit: 10, total: 21, totalPages: 3 });
      expect(result.items).toHaveLength(1);
    });

    it('turns a keyword into the users and jobs it matches', async () => {
      users.findIdsByKeyword.mockResolvedValue([APPLICANT]);
      repository.findJobIdsByTitle!.mockResolvedValue([JOB]);
      await service.list(recruiter, { ...query, search: 'nguyen' });
      expect(users.findIdsByKeyword).toHaveBeenCalledWith('nguyen', INTERVIEW_CONFIG.SEARCH_MATCH_LIMIT);
      expect(repository.findJobIdsByTitle).toHaveBeenCalledWith(ENTERPRISE, 'nguyen');
      expect(repository.findPage).toHaveBeenCalledWith(
        expect.objectContaining({ search: { userIds: [APPLICANT], jobIds: [JOB] } }),
        expect.anything(),
      );
    });

    it('scopes every list to the enterprise of the recruiter and can filter by one interviewer', async () => {
      await service.list(recruiter, { ...query, interviewerId: INTERVIEWER_B });
      expect(repository.findPage).toHaveBeenCalledWith(
        expect.objectContaining({ enterpriseId: ENTERPRISE, interviewerId: INTERVIEWER_B }),
        expect.anything(),
      );
    });

    it('refuses an account that has no enterprise', async () => {
      users.getEnterpriseId.mockResolvedValue(null);
      await expect(service.list(recruiter, query)).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('calendar (Calendar view)', () => {
    const from = new Date('2026-10-01T00:00:00.000Z');
    const to = new Date('2026-10-31T00:00:00.000Z');

    it('returns every interview that overlaps the window and says when the result was cut', async () => {
      repository.findCalendar!.mockResolvedValue({ items: [interview()], total: 501 });
      const result = await service.calendar(recruiter, { from, to, status: 'scheduled' });

      expect(repository.findCalendar).toHaveBeenCalledWith(
        expect.objectContaining({ enterpriseId: ENTERPRISE, from, to, overlapRange: true, statuses: ['scheduled'] }),
        500,
      );
      expect(result).toMatchObject({ from: from.toISOString(), to: to.toISOString(), total: 501, truncated: true });

      repository.findCalendar!.mockResolvedValue({ items: [interview()], total: 1 });
      expect((await service.calendar(recruiter, { from, to })).truncated).toBe(false);
    });

    it('can filter the calendar by one interviewer', async () => {
      await service.calendar(recruiter, { from, to, interviewerId: INTERVIEWER_B });
      expect(repository.findCalendar).toHaveBeenCalledWith(
        expect.objectContaining({ enterpriseId: ENTERPRISE, interviewerId: INTERVIEWER_B }),
        500,
      );
    });
  });

  describe('listSchedulableApplications (application picker)', () => {
    const application = (overrides: Record<string, unknown> = {}): unknown => ({
      _id: APPLICATION,
      job_id: JOB,
      applicant_id: APPLICANT,
      status: 'under_review',
      createdAt: new Date('2026-10-10T03:00:00.000Z'),
      ...overrides,
    });

    it.each(['user', 'applicant', 'admin'])('refuses a %s before looking anything up', async (role) => {
      await expect(service.listSchedulableApplications({ id: RECRUITER, role }, { limit: 20 })).rejects.toMatchObject({ statusCode: 403 });
      expect(users.getEnterpriseId).not.toHaveBeenCalled();
      expect(repository.findSchedulableApplications).not.toHaveBeenCalled();
    });

    it('refuses a recruiter who has no enterprise', async () => {
      users.getEnterpriseId.mockResolvedValue(null);
      await expect(service.listSchedulableApplications(recruiter, { limit: 20 })).rejects.toMatchObject({ statusCode: 403 });
      expect(repository.findSchedulableApplications).not.toHaveBeenCalled();
    });

    it('asks only for the schedulable statuses of the recruiter enterprise and names the applicant and the job', async () => {
      repository.findSchedulableApplications!.mockResolvedValue([application()]);
      users.findByIds.mockResolvedValue([user(APPLICANT, { full_name: 'Ha Quoc Bao', email: 'bao.ha@gmail.com', role: 'user' })]);

      const result = await service.listSchedulableApplications(recruiter, { limit: 20 });

      expect(repository.findSchedulableApplications).toHaveBeenCalledWith({
        enterpriseId: ENTERPRISE,
        statuses: ['submitted', 'under_review', 'interviewing'],
        search: undefined,
        limit: 20,
      });
      expect(users.findIdsByKeyword).not.toHaveBeenCalled();
      expect(result).toEqual({
        items: [
          {
            id: APPLICATION,
            status: 'under_review',
            appliedAt: '2026-10-10T03:00:00.000Z',
            job: { id: JOB, title: 'Backend Engineer' },
            applicant: { id: APPLICANT, fullName: 'Ha Quoc Bao', email: 'bao.ha@gmail.com' },
          },
        ],
      });
    });

    it('turns the keyword into applicant and job matches', async () => {
      users.findIdsByKeyword.mockResolvedValue([APPLICANT]);
      repository.findJobIdsByTitle!.mockResolvedValue([JOB]);

      await service.listSchedulableApplications(recruiter, { search: 'bao', limit: 5 });

      expect(users.findIdsByKeyword).toHaveBeenCalledWith('bao', INTERVIEW_CONFIG.SEARCH_MATCH_LIMIT);
      expect(repository.findJobIdsByTitle).toHaveBeenCalledWith(ENTERPRISE, 'bao');
      expect(repository.findSchedulableApplications).toHaveBeenCalledWith(
        expect.objectContaining({ search: { userIds: [APPLICANT], jobIds: [JOB] }, limit: 5 }),
      );
    });

    it('falls back to empty names when the applicant account or the job no longer exists', async () => {
      repository.findSchedulableApplications!.mockResolvedValue([application()]);
      users.findByIds.mockResolvedValue([]);
      repository.findJobTitles!.mockResolvedValue(new Map());

      const result = await service.listSchedulableApplications(recruiter, { limit: 20 });

      expect(result.items[0]).toMatchObject({
        job: { id: JOB, title: null },
        applicant: { id: APPLICANT, fullName: null, email: null },
      });
    });
  });

  describe('listInterviewers (interviewer picker)', () => {
    const team = [
      user('a00000000000000000000011', { full_name: 'Binh Nguyen', email: 'binh@acme.vn', username: 'binh' }),
      user('a00000000000000000000012', { full_name: 'An Tran', email: 'an.tran@acme.vn', username: 'antran' }),
      user('a00000000000000000000013', { full_name: 'Chi Le', email: 'chi@acme.vn', username: 'chi', status: 'blocked' }),
      user('a00000000000000000000014', { full_name: undefined, email: 'zed@acme.vn', username: 'zed' }),
    ];

    beforeEach(() => {
      users.findRecruitersByEnterpriseId.mockResolvedValue(team);
    });

    it.each(['user', 'applicant', 'admin'])('refuses a %s before looking anything up', async (role) => {
      await expect(service.listInterviewers({ id: RECRUITER, role }, { limit: 20 })).rejects.toMatchObject({ statusCode: 403 });
      expect(users.findRecruitersByEnterpriseId).not.toHaveBeenCalled();
    });

    it('lists the active recruiters of the enterprise sorted by name, leaving out accounts that are not active', async () => {
      const result = await service.listInterviewers(recruiter, { limit: 20 });

      expect(users.findRecruitersByEnterpriseId).toHaveBeenCalledWith(ENTERPRISE);
      expect(result.items).toEqual([
        { id: 'a00000000000000000000012', fullName: 'An Tran', email: 'an.tran@acme.vn' },
        { id: 'a00000000000000000000011', fullName: 'Binh Nguyen', email: 'binh@acme.vn' },
        { id: 'a00000000000000000000014', fullName: null, email: 'zed@acme.vn' },
      ]);
    });

    it.each([
      ['an email, ignoring case', 'BINH@ACME', ['a00000000000000000000011']],
      ['a name', 'tran', ['a00000000000000000000012']],
      ['a username', 'zed', ['a00000000000000000000014']],
      ['an inactive account (it never shows)', 'chi', []],
    ])('finds a recruiter by %s', async (_label, search, ids) => {
      const result = await service.listInterviewers(recruiter, { search, limit: 20 });
      expect(result.items.map((item) => item.id)).toEqual(ids);
    });

    it('returns at most `limit` recruiters', async () => {
      const result = await service.listInterviewers(recruiter, { limit: 1 });
      expect(result.items).toHaveLength(1);
    });
  });
});
