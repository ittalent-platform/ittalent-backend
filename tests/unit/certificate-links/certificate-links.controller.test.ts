import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CertificateLinksController } from '../../../src/modules/certificate-links/certificate-links.controller.js';
import type { CertificateLinksService } from '../../../src/modules/certificate-links/certificate-links.service.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';

const user = { id: '507f1f77bcf86cd799439011', email: 'candidate@example.test', role: 'user' };
const item = { id: '507f1f77bcf86cd799439012', name: 'Certificate', url: 'https://cert.example/abc' };

function request(key?: string): never {
  return {
    user,
    get: vi.fn().mockReturnValue(key),
  } as never;
}

function response(validated: Record<string, unknown> = {}) {
  const json = vi.fn();
  const end = vi.fn();
  const status = vi.fn().mockReturnValue({ json, end });
  const setHeader = vi.fn();
  return { json, end, status, setHeader, locals: { validated } };
}

describe('CertificateLinksController', () => {
  let service: { create: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  let controller: CertificateLinksController;

  beforeEach(() => {
    service = { create: vi.fn(), list: vi.fn(), update: vi.fn(), delete: vi.fn() };
    controller = new CertificateLinksController(service as unknown as CertificateLinksService);
  });

  it('returns 201 for a new link and passes the validated input and idempotency key', async () => {
    service.create.mockResolvedValue({ item, replayed: false });
    const body = { name: 'Certificate', url: 'https://cert.example/abc' };
    const res = response({ body });
    const next = vi.fn();

    await controller.create(request('request-1'), res as never, next);

    expect(service.create).toHaveBeenCalledWith(user.id, body, 'request-1');
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_201_CREATED);
    expect(res.json).toHaveBeenCalledWith(item);
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('marks an idempotent replay and returns 200', async () => {
    service.create.mockResolvedValue({ item, replayed: true });
    const res = response({ body: { name: 'Certificate', url: 'https://cert.example/abc' } });
    const next = vi.fn();

    await controller.create(request('request-1'), res as never, next);

    expect(res.setHeader).toHaveBeenCalledWith('Idempotency-Replayed', 'true');
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
    expect(res.json).toHaveBeenCalledWith(item);
  });

  it('rejects a missing idempotency key before calling the service', async () => {
    const res = response({ body: { name: 'Certificate', url: 'https://cert.example/abc' } });
    const next = vi.fn();

    await controller.create(request(), res as never, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST }));
    expect(service.create).not.toHaveBeenCalled();
  });

  it('passes the validated query to list and returns the page', async () => {
    const page = { items: [item], page: 1, limit: 20, total: 1, totalPages: 1, suggestedTotal: 1 };
    service.list.mockResolvedValue(page);
    const query = { page: 1, limit: 20, search: 'certificate' };
    const res = response({ query });
    const next = vi.fn();

    await controller.list(request(), res as never, next);

    expect(service.list).toHaveBeenCalledWith(user.id, query);
    expect(res.json).toHaveBeenCalledWith(page);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes validated update and delete values to the service', async () => {
    service.update.mockResolvedValue(item);
    const next = vi.fn();
    const body = { expectedVersion: 1, suggested: true };
    const updateResponse = response({ params: { id: item.id }, body });
    await controller.update(request(), updateResponse as never, next);
    expect(service.update).toHaveBeenCalledWith(user.id, item.id, body);
    expect(updateResponse.json).toHaveBeenCalledWith(item);

    const deleteResponse = response({ params: { id: item.id }, query: { expectedVersion: 2 } });
    await controller.remove(request(), deleteResponse as never, next);
    expect(service.delete).toHaveBeenCalledWith(user.id, item.id, 2);
    expect(deleteResponse.status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_204_NO_CONTENT);
    expect(deleteResponse.end).toHaveBeenCalled();
  });

  it('forwards service errors to the error middleware', async () => {
    const error = new Error('storage failed');
    service.list.mockRejectedValue(error);
    const next = vi.fn();

    await controller.list(request(), response({ query: { page: 1, limit: 20 } }) as never, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
