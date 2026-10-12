import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InterviewsController } from '../../../src/modules/interviews/interviews.controller.js';
import type { InterviewsService } from '../../../src/modules/interviews/interviews.service.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';

const actor = { id: 'user-1', role: 'recruiter' };
const ID = 'd00000000000000000000001';

function response(validated: Record<string, unknown>): { res: never; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const send = vi.fn();
  const status = vi.fn().mockReturnValue({ json, send });
  return { res: { status, locals: { validated } } as never, status, json, send };
}

describe('InterviewsController', () => {
  let service: Record<'create' | 'list' | 'calendar' | 'getDetail' | 'update' | 'updateStatus' | 'remove', ReturnType<typeof vi.fn>>;
  let controller: InterviewsController;
  const req = { user: actor } as never;

  beforeEach(() => {
    service = {
      create: vi.fn(),
      list: vi.fn(),
      calendar: vi.fn(),
      getDetail: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
      remove: vi.fn(),
    };
    controller = new InterviewsController(service as unknown as InterviewsService);
  });

  it('creates an interview and answers 201', async () => {
    const body = { applicationId: 'a' };
    service.create!.mockResolvedValue({ id: ID });
    const { res, status, json } = response({ body });

    await controller.createInterview(req, res, vi.fn());

    expect(service.create).toHaveBeenCalledWith(actor, body);
    expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_201_CREATED);
    expect(json).toHaveBeenCalledWith({ id: ID });
  });

  it('returns one interview', async () => {
    service.getDetail!.mockResolvedValue({ id: ID });
    const { res, status, json } = response({ params: { id: ID } });

    await controller.getDetail(req, res, vi.fn());

    expect(service.getDetail).toHaveBeenCalledWith(actor, ID);
    expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
    expect(json).toHaveBeenCalledWith({ id: ID });
  });

  it('deletes and answers 204 without a body', async () => {
    service.remove!.mockResolvedValue(undefined);
    const { res, status, json, send } = response({ params: { id: ID } });

    await controller.deleteInterview(req, res, vi.fn());

    expect(service.remove).toHaveBeenCalledWith(actor, ID);
    expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_204_NO_CONTENT);
    expect(send).toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });

  it.each([
    ['createInterview'],
    ['getDetail'],
    ['deleteInterview'],
  ] as const)('%s answers 401 when there is no authenticated user', async (handler) => {
    const { res } = response({ params: { id: ID } });
    const next = vi.fn();

    await controller[handler]({} as never, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: HTTP_STATUS.HTTP_401_UNAUTHORIZED }));
  });

  it('forwards service errors to next', async () => {
    const error = new Error('boom');
    service.getDetail!.mockRejectedValue(error);
    const { res } = response({ params: { id: ID } });
    const next = vi.fn();

    await controller.getDetail(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
