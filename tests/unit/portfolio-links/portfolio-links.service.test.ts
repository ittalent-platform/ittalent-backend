import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PortfolioLinkDoc } from '../../../src/models/portfolio-link.model.js';
import type { PortfolioLinksRepository } from '../../../src/modules/portfolio-links/portfolio-links.repository.js';
import { PortfolioLinksService } from '../../../src/modules/portfolio-links/portfolio-links.service.js';
import type { UsersService } from '../../../src/modules/users/users.service.js';

const ownerId = new Types.ObjectId().toString();
const createdAt = new Date('2026-10-01T10:00:00.000Z');
const input = { title: 'My site', url: 'https://me.example/work' };

function item(overrides: Record<string, unknown> = {}): PortfolioLinkDoc {
  return { _id: new Types.ObjectId(), owner_id: new Types.ObjectId(ownerId), title: 'My site', url: 'https://me.example/work', version: 1, createdAt, updatedAt: createdAt, ...overrides } as PortfolioLinkDoc;
}

describe('PortfolioLinksService', () => {
  let repository: PortfolioLinksRepository;
  let users: UsersService;

  beforeEach(() => {
    repository = {
      create: vi.fn(),
      findByIdempotencyKey: vi.fn().mockResolvedValue(null),
      findByUrl: vi.fn().mockResolvedValue(null),
      findPage: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findOwned: vi.fn(),
      deleteGuarded: vi.fn(),
    } as unknown as PortfolioLinksRepository;
    users = { findById: vi.fn().mockResolvedValue({ role: 'user', status: 'active', email_verified: true }) } as unknown as UsersService;
  });

  it('creates a link and replays an exact retry without a second insert (A2)', async () => {
    const created = item();
    vi.mocked(repository.create).mockResolvedValue(created);
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    vi.mocked(repository.findByIdempotencyKey).mockResolvedValueOnce(null).mockResolvedValueOnce({ ...created, request_hash: hash } as PortfolioLinkDoc);
    const service = new PortfolioLinksService(repository, users);

    const first = await service.create(ownerId, input, 'op-1');
    const retried = await service.create(ownerId, input, 'op-1');

    expect(first).toMatchObject({ replayed: false, item: { title: 'My site', description: null, version: 1 } });
    expect(retried).toEqual({ item: first.item, replayed: true });
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a key reused with different content and a duplicate URL under another key', async () => {
    vi.mocked(repository.findByIdempotencyKey).mockResolvedValueOnce({ ...item(), request_hash: 'other' } as PortfolioLinkDoc);
    const service = new PortfolioLinksService(repository, users);
    await expect(service.create(ownerId, input, 'op-1')).rejects.toMatchObject({ statusCode: 409, code: 'IDEMPOTENCY_KEY_REUSED' });

    vi.mocked(repository.create).mockRejectedValue({ code: 11_000 });
    vi.mocked(repository.findByUrl).mockResolvedValue(item());
    await expect(service.create(ownerId, input, 'op-2')).rejects.toMatchObject({ statusCode: 409, code: 'DUPLICATE_PORTFOLIO_URL' });
  });

  it('denies anyone who is not an active, verified Candidate', async () => {
    const service = new PortfolioLinksService(repository, users);
    for (const user of [null, { role: 'recruiter', status: 'active', email_verified: true }, { role: 'user', status: 'suspended', email_verified: true }, { role: 'user', status: 'active', email_verified: false }]) {
      vi.mocked(users.findById).mockResolvedValue(user as never);
      await expect(service.create(ownerId, input, 'op-1')).rejects.toMatchObject({ statusCode: 403 });
      await expect(service.delete(ownerId, String(new Types.ObjectId()), 1)).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('lists a page with totals', async () => {
    vi.mocked(repository.findPage).mockResolvedValue({ items: [item({ description: 'Projects' })], total: 21 });
    const result = await new PortfolioLinksService(repository, users).list(ownerId, { page: 2, limit: 10 });
    expect(result).toMatchObject({ page: 2, limit: 10, total: 21, totalPages: 3, items: [{ description: 'Projects' }] });
    expect(repository.findPage).toHaveBeenCalledWith(ownerId, 2, 10);
  });

  it('deletes with a matching version, and reports not-found, stale and lost-race cases', async () => {
    const id = String(new Types.ObjectId());
    const service = new PortfolioLinksService(repository, users);
    vi.mocked(repository.findOwned).mockResolvedValue(null);
    await expect(service.delete(ownerId, id, 1)).rejects.toMatchObject({ statusCode: 404 });

    vi.mocked(repository.findOwned).mockResolvedValue(item({ version: 2 }));
    await expect(service.delete(ownerId, id, 1)).rejects.toMatchObject({ statusCode: 409, code: 'VERSION_CONFLICT' });
    expect(repository.deleteGuarded).not.toHaveBeenCalled();

    vi.mocked(repository.deleteGuarded).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await expect(service.delete(ownerId, id, 2)).rejects.toMatchObject({ statusCode: 409, code: 'VERSION_CONFLICT' });
    await expect(service.delete(ownerId, id, 2)).resolves.toBeUndefined();
  });
});
