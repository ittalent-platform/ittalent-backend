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
  let countCertificatesSent: (applicantId: string, certificateIds: string[]) => Promise<Map<string, number>>;

  beforeEach(() => {
    repository = {
      create: vi.fn(),
      findByIdempotencyKey: vi.fn().mockResolvedValue(null),
      findByUrl: vi.fn().mockResolvedValue(null),
      findPage: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      countSuggested: vi.fn().mockResolvedValue(0),
      findOwned: vi.fn(),
      findOwnedMany: vi.fn(),
      updateGuarded: vi.fn(),
      deleteGuarded: vi.fn(),
    } as unknown as CertificateLinksRepository;
    users = {
      findById: vi.fn().mockResolvedValue({ role: 'user', status: 'active', email_verified: true }),
    } as unknown as UsersService;
    countCertificatesSent = vi.fn().mockResolvedValue(new Map());
  });

  it('creates a private link and retries the same operation without creating a duplicate', async () => {
    const created = item();
    vi.mocked(repository.create).mockResolvedValue(created);
    vi.mocked(repository.findByIdempotencyKey).mockResolvedValueOnce(null).mockResolvedValueOnce({
      ...created,
      idempotency_key: 'op-1',
      request_hash: createHash('sha256').update(JSON.stringify({ name: 'Certificate', url: 'https://cert.example/abc' })).digest('hex'),
    } as CertificateLinkDoc);
    const service = new CertificateLinksService(repository, users, countCertificatesSent);
    const input = { name: 'Certificate', url: 'https://cert.example/abc' };

    const first = await service.create(ownerId, input, 'op-1');
    const retried = await service.create(ownerId, input, 'op-1');

    expect(first.replayed).toBe(false);
    expect(retried).toEqual({ item: first.item, replayed: true });
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('uses stateless role authorization for the read and skips a second user lookup', async () => {
    const service = new CertificateLinksService(repository, users, countCertificatesSent);

    await service.list(ownerId, { page: 1, limit: 20 });
    expect(users.findById).not.toHaveBeenCalled();
    expect(repository.findPage).toHaveBeenCalledWith(ownerId, 1, 20, {});
  });

  it('passes the keyword, selection and validity criteria to the repository (UC-S4-CERT-06)', async () => {
    const service = new CertificateLinksService(repository, users, countCertificatesSent);

    await service.list(ownerId, { page: 2, limit: 10, search: 'aws', suggested: true, validity: 'expired' });
    expect(repository.findPage).toHaveBeenCalledWith(ownerId, 2, 10, { search: 'aws', suggested: true, validity: 'expired' });
  });

  it('does not expose private idempotency data in the candidate response', async () => {
    vi.mocked(repository.findPage).mockResolvedValue({ items: [item({ idempotency_key: 'secret', request_hash: 'secret', history: [] })], total: 1 });
    const result = await new CertificateLinksService(repository, users, countCertificatesSent).list(ownerId, { page: 1, limit: 20 });

    expect(result.items[0]).not.toHaveProperty('idempotency_key');
    expect(result.items[0]).not.toHaveProperty('history');
  });

  it('gets sent counts through ApplicationsService and maps them onto certificate items', async () => {
    const certificate = item();
    vi.mocked(repository.findPage).mockResolvedValue({ items: [certificate], total: 1 });
    countCertificatesSent = vi.fn().mockResolvedValue(new Map([[String(certificate._id), 4]]));

    const result = await new CertificateLinksService(repository, users, countCertificatesSent).list(ownerId, { page: 1, limit: 20 });

    expect(countCertificatesSent).toHaveBeenCalledWith(ownerId, [String(certificate._id)]);
    expect(result.items[0]?.sentCount).toBe(4);
  });

  it('bumps the version for a metadata change but not for a suggested-only change', async () => {
    const current = item({ version: 2, suggested: false });
    vi.mocked(repository.findOwned).mockResolvedValue(current);
    vi.mocked(repository.updateGuarded).mockResolvedValue(item({ version: 2, suggested: true }));
    const service = new CertificateLinksService(repository, users, countCertificatesSent);

    await service.update(ownerId, String(current._id), { expectedVersion: 2, suggested: true });
    expect(vi.mocked(repository.updateGuarded).mock.calls[0]![3]).toMatchObject({ $set: { version: 2, suggested: true }, $push: { history: { action: 'suggestion_changed' } } });

    await service.update(ownerId, String(current._id), { expectedVersion: 2, issuer: 'Example Institute', issuedDate: null });
    expect(vi.mocked(repository.updateGuarded).mock.calls[1]![3]).toMatchObject({ $set: { version: 3, issuer: 'Example Institute' }, $push: { history: { action: 'updated' } } });
  });

  it('returns the item unchanged without writing when nothing changes', async () => {
    const current = item({ version: 1, issuer: 'Same' });
    vi.mocked(repository.findOwned).mockResolvedValue(current);
    const result = await new CertificateLinksService(repository, users, countCertificatesSent).update(ownerId, String(current._id), { expectedVersion: 1, issuer: 'Same' });
    expect(result.version).toBe(1);
    expect(repository.updateGuarded).not.toHaveBeenCalled();
  });

  it('rejects a stale version, a missing item and an expiry before the stored issued date', async () => {
    const service = new CertificateLinksService(repository, users, countCertificatesSent);
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
    const service = new CertificateLinksService(repository, users, countCertificatesSent);
    await expect(service.resolveForApplication(ownerId, [String(own._id), new Types.ObjectId().toString()])).rejects.toMatchObject({ statusCode: 409, code: 'CERTIFICATE_UNAVAILABLE' });
    await expect(service.resolveForApplication(ownerId, [String(own._id)])).resolves.toEqual([own]);
    await expect(service.resolveForApplication(ownerId, [])).resolves.toEqual([]);
  });
});
