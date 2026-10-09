import { describe, expect, it, vi } from 'vitest';
import type { InterviewDoc } from '../../../src/models/interview.model.js';
import type { InterviewsRepository } from '../../../src/modules/interviews/interviews.repository.js';
import { InterviewsService } from '../../../src/modules/interviews/interviews.service.js';

const interviewId = '507f1f77bcf86cd799439011';
const applicationId = '507f1f77bcf86cd799439012';
const userId = '507f1f77bcf86cd799439013';

function interview(overrides: Record<string, unknown> = {}): InterviewDoc {
  return {
    _id: interviewId,
    application_id: applicationId,
    scheduled_by_user_id: '507f1f77bcf86cd799439014',
    date_time: new Date('2099-01-01T01:00:00.000Z'),
    duration_minutes: 60,
    timezone: 'Asia/Ho_Chi_Minh',
    mode: 'online',
    status: 'scheduled',
    applicant_response: 'pending',
    response_history: [],
    ...overrides,
  } as unknown as InterviewDoc;
}

function setup(): {
  service: InterviewsService;
  repository: {
    findOwnedById: ReturnType<typeof vi.fn>;
    respond: ReturnType<typeof vi.fn>;
  };
} {
  const repository = { findOwnedById: vi.fn(), respond: vi.fn() };
  return {
    service: new InterviewsService(
      repository as unknown as InterviewsRepository,
    ),
    repository,
  };
}

describe('InterviewsService candidate response', () => {
  it('records an accepted response for an owned scheduled interview', async () => {
    const { service, repository } = setup();
    repository.findOwnedById.mockResolvedValue(interview());
    repository.respond.mockResolvedValue(
      interview({ applicant_response: 'accepted', responded_at: new Date() }),
    );
    const result = await service.respond(interviewId, userId, {
      response: 'accepted',
    });
    expect(result.applicantResponse).toBe('accepted');
    expect(repository.respond).toHaveBeenCalledWith(
      interviewId,
      userId,
      { response: 'accepted' },
      expect.any(Date),
    );
  });

  it('hides an interview not owned by the candidate', async () => {
    const { service, repository } = setup();
    repository.findOwnedById.mockResolvedValue(null);
    await expect(
      service.respond(interviewId, userId, {
        response: 'declined',
        reason: 'Unavailable',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(repository.respond).not.toHaveBeenCalled();
  });

  it('rejects a second or invalid-state response', async () => {
    const { service, repository } = setup();
    repository.findOwnedById.mockResolvedValue(
      interview({ applicant_response: 'accepted' }),
    );
    await expect(
      service.respond(interviewId, userId, { response: 'accepted' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
