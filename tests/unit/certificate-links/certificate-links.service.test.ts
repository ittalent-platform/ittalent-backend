import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CertificateLinksService } from '../../../src/modules/certificate-links/certificate-links.service.js';
import type { CertificateLinksRepository } from '../../../src/modules/certificate-links/certificate-links.repository.js';
import type { UsersService } from '../../../src/modules/users/users.service.js';
import type { CertificateLinkDoc } from '../../../src/models/certificate-link.model.js';

const ownerId = new Types.ObjectId().toString();
const createdAt = new Date('2026-09-24T10:00:00.000Z');

function item(overrides: Record<string, unknown> = {}): CertificateLinkDoc {
  return {
    _id: new Types.ObjectId(),
    owner_id: new Types.ObjectId(ownerId),
    name: 'Certificate',
    url: 'https://cert.example/abc',
    version: 1,
    status: 'available',
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  } as CertificateLinkDoc;
}

describe('CertificateLinksService', () => {
  let repository: CertificateLinksRepository;
  let users: UsersService;

  beforeEach(() => {
    repository = {
      create: vi.fn(),
      findByIdempotencyKey: vi.fn().mockResolvedValue(null),
      findByUrl: vi.fn().mockResolvedValue(null),
      findPage: vi.fn(),
      countSuggested: vi.fn().mockResolvedValue(0),
      countSent: vi.fn().mockResolvedValue(new Map()),
      findOwned: vi.fn(),
      findOwnedMany: vi.fn(),
      updateGuarded: vi.fn(),
      deleteGuarded: vi.fn(),
    } as unknown as CertificateLinksRepository;
    users = {
      findById: vi.fn().mockResolvedValue({ role: 'user', status: 'active', email_verified: true }),
    } as unknown as UsersService;
  });

  it('creates a private link and retries the same operation without creating a duplicate', async () => {
    const created = item();
    vi.mocked(repository.create).mockResolvedValue(created);
    vi.mocked(repository.findByIdempotencyKey).mockResolvedValueOnce(null).mockResolvedValueOnce({
      ...created,
      idempotency_key: 'op-1',
      request_hash: createHash('sha256').update(JSON.stringify({ name: 'Certificate', url: 'https://cert.example/abc' })).digest('hex'),
    } as CertificateLinkDoc);
    const service = new CertificateLinksService(repository, users);
    const input = { name: 'Certificate', url: 'https://cert.example/abc' };

    const first = await service.create(ownerId, input, 'op-1');
    const retried = await service.create(ownerId, input, 'op-1');

    expect(first.replayed).toBe(false);
    expect(retried).toEqual({ item: first.item, replayed: true });
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a stale account authorization before accessing the library', async () => {
    vi.mocked(users.findById).mockResolvedValue({ role: 'user', status: 'active', email_verified: false } as never);
    const service = new CertificateLinksService(repository, users);

    await expect(service.list(ownerId, { page: 1, limit: 20 })).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.findPage).not.toHaveBeenCalled();
  });

  it('does not expose private idempotency data in the candidate response', async () => {
    vi.mocked(repository.findPage).mockResolvedValue({ items: [item({ idempotency_key: 'secret', request_hash: 'secret', history: [] })], total: 1 });
    const result = await new CertificateLinksService(repository, users).list(ownerId, { page: 1, limit: 20 });

    expect(result.items[0]).not.toHaveProperty('idempotency_key');
    expect(result.items[0]).not.toHaveProperty('history');
  });

  it('bumps the version for a metadata change but not for a suggested-only change', async () => {
    const current = item({ version: 2, suggested: false });
    vi.mocked(repository.findOwned).mockResolvedValue(current);
    vi.mocked(repository.updateGuarded).mockResolvedValue(item({ version: 2, suggested: true }));
    const service = new CertificateLinksService(repository, users);

    await service.update(ownerId, String(current._id), { expectedVersion: 2, suggested: true });
    expect(vi.mocked(repository.updateGuarded).mock.calls[0]![3]).toMatchObject({ $set: { version: 2, suggested: true }, $push: { history: { action: 'suggestion_changed' } } });

    await service.update(ownerId, String(current._id), { expectedVersion: 2, issuer: 'Example Institute', issuedDate: null });
    expect(vi.mocked(repository.updateGuarded).mock.calls[1]![3]).toMatchObject({ $set: { version: 3, issuer: 'Example Institute' }, $push: { history: { action: 'updated' } } });
  });

  it('returns the item unchanged without writing when nothing changes', async () => {
    const current = item({ version: 1, issuer: 'Same' });
    vi.mocked(repository.findOwned).mockResolvedValue(current);
    const result = await new CertificateLinksService(repository, users).update(ownerId, String(current._id), { expectedVersion: 1, issuer: 'Same' });
    expect(result.version).toBe(1);
    expect(repository.updateGuarded).not.toHaveBeenCalled();
  });

  it('rejects a stale version, a missing item and an expiry before the stored issued date', async () => {
    const service = new CertificateLinksService(repository, users);
    vi.mocked(repository.findOwned).mockResolvedValue(item({ version: 3, issued_date: '2026-01-10' }));
    await expect(service.update(ownerId, new Types.ObjectId().toString(), { expectedVersion: 2, name: 'New' })).rejects.toMatchObject({ statusCode: 409, code: 'VERSION_CONFLICT' });
    await expect(service.update(ownerId, new Types.ObjectId().toString(), { expectedVersion: 3, expiryDate: '2026-01-01' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.delete(ownerId, new Types.ObjectId().toString(), 2)).rejects.toMatchObject({ statusCode: 409 });
    vi.mocked(repository.findOwned).mockResolvedValue(null);
    await expect(service.delete(ownerId, new Types.ObjectId().toString(), 1)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses an application when a ticked certificate is not the applicant’s own', async () => {
    const own = item();
    vi.mocked(repository.findOwnedMany).mockResolvedValue([own]);
    const service = new CertificateLinksService(repository, users);
    await expect(service.resolveForApplication(ownerId, [String(own._id), new Types.ObjectId().toString()])).rejects.toMatchObject({ statusCode: 409, code: 'CERTIFICATE_UNAVAILABLE' });
    await expect(service.resolveForApplication(ownerId, [String(own._id)])).resolves.toEqual([own]);
    await expect(service.resolveForApplication(ownerId, [])).resolves.toEqual([]);
  });
});
