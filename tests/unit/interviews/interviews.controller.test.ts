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

  it('lists interviews with the validated query', async () => {
    const query = { page: 1, limit: 20 };
    service.list!.mockResolvedValue({ items: [] });
    const { res, status, json } = response({ query });

    await controller.listInterviews(req, res, vi.fn());

    expect(service.list).toHaveBeenCalledWith(actor, query);
    expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
    expect(json).toHaveBeenCalledWith({ items: [] });
  });

  it('returns the calendar for the validated window', async () => {
    const query = { from: new Date(), to: new Date() };
    service.calendar!.mockResolvedValue({ items: [] });
    const { res, json } = response({ query });

    await controller.calendar(req, res, vi.fn());

    expect(service.calendar).toHaveBeenCalledWith(actor, query);
    expect(json).toHaveBeenCalledWith({ items: [] });
  });

  it('returns one interview', async () => {
    service.getDetail!.mockResolvedValue({ id: ID });
    const { res, status, json } = response({ params: { id: ID } });

    await controller.getDetail(req, res, vi.fn());

    expect(service.getDetail).toHaveBeenCalledWith(actor, ID);
    expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
    expect(json).toHaveBeenCalledWith({ id: ID });
  });

  it('updates the information', async () => {
    service.update!.mockResolvedValue({ id: ID });
    const { res, json } = response({ params: { id: ID }, body: { notes: 'x' } });

    await controller.updateInterview(req, res, vi.fn());

    expect(service.update).toHaveBeenCalledWith(actor, ID, { notes: 'x' });
    expect(json).toHaveBeenCalledWith({ id: ID });
  });

  it('updates the status', async () => {
    service.updateStatus!.mockResolvedValue({ id: ID, status: 'completed' });
    const { res, json } = response({ params: { id: ID }, body: { status: 'completed' } });

    await controller.updateStatus(req, res, vi.fn());

    expect(service.updateStatus).toHaveBeenCalledWith(actor, ID, { status: 'completed' });
    expect(json).toHaveBeenCalledWith({ id: ID, status: 'completed' });
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
    ['listInterviews'],
    ['calendar'],
    ['getDetail'],
    ['updateInterview'],
    ['updateStatus'],
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
