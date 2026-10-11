import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApplicationStatus } from '../../../src/models/application.model.js';
import type { InterviewDoc, InterviewStatus } from '../../../src/models/interview.model.js';
import { INTERVIEW_ERROR_CODES } from '../../../src/modules/interviews/interviews.constants.js';
import type { InterviewsRepository, InterviewUserRow } from '../../../src/modules/interviews/interviews.repository.js';
import { InterviewsService, type InterviewActor } from '../../../src/modules/interviews/interviews.service.js';
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

function user(id: string, overrides: Partial<Record<keyof InterviewUserRow, unknown>> = {}): InterviewUserRow {
  return {
    _id: id,
    email: `${id}@example.com`,
    username: id,
    full_name: `User ${id.slice(-1)}`,
    role: 'interviewer',
    status: 'active',
    enterprise_id: ENTERPRISE,
    ...overrides,
  } as unknown as InterviewUserRow;
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
    findUsersByIds: vi.fn().mockImplementation(async (ids: string[]) => ids.map((id) => user(id))),
    findJobTitles: vi.fn().mockResolvedValue(new Map([[JOB, 'Backend Engineer']])),
    findEnterpriseName: vi.fn().mockResolvedValue('Acme'),
    findSearchMatches: vi.fn().mockResolvedValue({ userIds: [], jobIds: [] }),
    findConflict: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async () => interview({ interviewer_ids: [INTERVIEWER_A, INTERVIEWER_B] })),
    findById: vi.fn().mockResolvedValue(interview()),
    updateScheduled: vi.fn().mockImplementation(async () => interview()),
    transitionFromScheduled: vi.fn().mockImplementation(async (_id: string, status: InterviewStatus) => interview({ status })),
    deleteNotCompleted: vi.fn().mockResolvedValue(interview()),
    findPage: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    findCalendar: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  } as unknown as Record<keyof InterviewsRepository, ReturnType<typeof vi.fn>>;
}

describe('InterviewsService', () => {
  let repository: ReturnType<typeof makeRepository>;
  let users: { getEnterpriseId: ReturnType<typeof vi.fn>; findById: ReturnType<typeof vi.fn> };
  let service: InterviewsService;
  let now: Date;

  beforeEach(() => {
    vi.mocked(sendInterviewEmail).mockClear();
    repository = makeRepository();
    users = {
      getEnterpriseId: vi.fn().mockResolvedValue(ENTERPRISE),
      findById: vi.fn().mockResolvedValue({ _id: APPLICANT, email: 'applicant@example.com', status: 'active' }),
    };
    now = NOW;
    service = new InterviewsService(
      repository as unknown as InterviewsRepository,
      users as unknown as UsersService,
      () => now,
    );
  });

  describe('create', () => {
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
      ['an interviewer of another enterprise', { enterprise_id: OTHER_ENTERPRISE }],
      ['a user who is not an interviewer or recruiter', { role: 'user' }],
      ['a suspended interviewer', { status: 'suspended' }],
    ])('rejects %s', async (_label, overrides) => {
      repository.findUsersByIds!.mockResolvedValue([user(INTERVIEWER_A), user(INTERVIEWER_B, overrides)]);
      await expect(service.create(recruiter, createBody)).rejects.toMatchObject({
        statusCode: 400,
        code: INTERVIEW_ERROR_CODES.INVALID_INTERVIEWERS,
      });
    });

    it('rejects an interviewer that does not exist', async () => {
      repository.findUsersByIds!.mockResolvedValue([user(INTERVIEWER_A)]);
      await expect(service.create(recruiter, createBody)).rejects.toMatchObject({ code: INTERVIEW_ERROR_CODES.INVALID_INTERVIEWERS });
    });

    it('lets a recruiter of the enterprise act as an interviewer', async () => {
      repository.findUsersByIds!.mockResolvedValue([user(INTERVIEWER_A), user(INTERVIEWER_B, { role: 'recruiter' })]);
      await expect(service.create(recruiter, createBody)).resolves.toBeDefined();
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

});
