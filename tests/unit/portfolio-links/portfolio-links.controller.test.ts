import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PortfolioLinksController } from '../../../src/modules/portfolio-links/portfolio-links.controller.js';
import type { PortfolioLinksService } from '../../../src/modules/portfolio-links/portfolio-links.service.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';

const user = { id: '507f1f77bcf86cd799439011', email: 'candidate@example.test', role: 'user' };
const item = { id: '507f1f77bcf86cd799439012', title: 'My site', url: 'https://me.example/', description: null, version: 1 };

function request(key?: string, authenticated = true): never {
  return {
    ...(authenticated ? { user } : {}),
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

const unauthenticated = expect.objectContaining({ statusCode: HTTP_STATUS.HTTP_401_UNAUTHORIZED });

describe('PortfolioLinksController', () => {
  let service: { create: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  let controller: PortfolioLinksController;

  beforeEach(() => {
    service = { create: vi.fn(), list: vi.fn(), update: vi.fn(), delete: vi.fn() };
    controller = new PortfolioLinksController(service as unknown as PortfolioLinksService);
  });

  describe('create', () => {
    const body = { title: 'My site', url: 'https://me.example/' };

    it('returns 201 for a new link and passes the validated input and idempotency key', async () => {
      service.create.mockResolvedValue({ item, replayed: false });
      const res = response({ body });
      const next = vi.fn();

      await controller.create(request('request-1'), res as never, next);

      expect(service.create).toHaveBeenCalledWith(user.id, body, 'request-1');
      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_201_CREATED);
      expect(res.json).toHaveBeenCalledWith(item);
      expect(res.setHeader).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('marks an idempotent replay with a header and returns 200', async () => {
      service.create.mockResolvedValue({ item, replayed: true });
      const res = response({ body });

      await controller.create(request('request-1'), res as never, vi.fn());

      expect(res.setHeader).toHaveBeenCalledWith('Idempotency-Replayed', 'true');
      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(res.json).toHaveBeenCalledWith(item);
    });

    it('rejects a missing idempotency key before calling the service', async () => {
      const next = vi.fn();

      await controller.create(request(), response({ body }) as never, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST }));
      expect(service.create).not.toHaveBeenCalled();
    });

    it('answers 401 without a signed-in user and forwards service errors', async () => {
      const next = vi.fn();
      await controller.create(request('request-1', false), response({ body }) as never, next);
      expect(next).toHaveBeenCalledWith(unauthenticated);
      expect(service.create).not.toHaveBeenCalled();

      const failure = new Error('storage failed');
      service.create.mockRejectedValue(failure);
      await controller.create(request('request-1'), response({ body }) as never, next);
      expect(next).toHaveBeenLastCalledWith(failure);
    });
  });

  describe('list', () => {
    const query = { page: 1, limit: 20, keyword: 'react' };

    it('passes the validated query and returns 200 with the page', async () => {
      const page = { items: [item], page: 1, limit: 20, total: 1, totalPages: 1 };
      service.list.mockResolvedValue(page);
      const res = response({ query });
      const next = vi.fn();

      await controller.list(request(), res as never, next);

      expect(service.list).toHaveBeenCalledWith(user.id, query);
      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(res.json).toHaveBeenCalledWith(page);
      expect(next).not.toHaveBeenCalled();
    });

    it('answers 401 without a signed-in user and forwards service errors', async () => {
      const next = vi.fn();
      await controller.list(request(undefined, false), response({ query }) as never, next);
      expect(next).toHaveBeenCalledWith(unauthenticated);
      expect(service.list).not.toHaveBeenCalled();

      const failure = new Error('storage failed');
      service.list.mockRejectedValue(failure);
      const res = response({ query });
      await controller.list(request(), res as never, next);
      expect(next).toHaveBeenLastCalledWith(failure);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const params = { id: item.id };
    const body = { expectedVersion: 1, title: 'New title', description: null };

    it('passes the validated id and body and returns 200 with the updated link', async () => {
      const updated = { ...item, title: 'New title', version: 2 };
      service.update.mockResolvedValue(updated);
      const res = response({ params, body });
      const next = vi.fn();

      await controller.update(request(), res as never, next);

      expect(service.update).toHaveBeenCalledWith(user.id, item.id, body);
      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(res.json).toHaveBeenCalledWith(updated);
      expect(next).not.toHaveBeenCalled();
    });

    it('answers 401 without a signed-in user and forwards service errors such as a version conflict', async () => {
      const next = vi.fn();
      await controller.update(request(undefined, false), response({ params, body }) as never, next);
      expect(next).toHaveBeenCalledWith(unauthenticated);
      expect(service.update).not.toHaveBeenCalled();

      const conflict = Object.assign(new Error('The link changed'), { statusCode: HTTP_STATUS.HTTP_409_CONFLICT });
      service.update.mockRejectedValue(conflict);
      const res = response({ params, body });
      await controller.update(request(), res as never, next);
      expect(next).toHaveBeenLastCalledWith(conflict);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    const params = { id: item.id };
    const query = { expectedVersion: 2 };

    it('passes the expected version and returns 204 without a body', async () => {
      service.delete.mockResolvedValue(undefined);
      const res = response({ params, query });
      const next = vi.fn();

      await controller.remove(request(), res as never, next);

      expect(service.delete).toHaveBeenCalledWith(user.id, item.id, 2);
      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_204_NO_CONTENT);
      expect(res.end).toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('answers 401 without a signed-in user and forwards service errors', async () => {
      const next = vi.fn();
      await controller.remove(request(undefined, false), response({ params, query }) as never, next);
      expect(next).toHaveBeenCalledWith(unauthenticated);
      expect(service.delete).not.toHaveBeenCalled();

      const failure = new Error('storage failed');
      service.delete.mockRejectedValue(failure);
      const res = response({ params, query });
      await controller.remove(request(), res as never, next);
      expect(next).toHaveBeenLastCalledWith(failure);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
