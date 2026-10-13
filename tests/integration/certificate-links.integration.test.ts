import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/db.js';
import { disconnectRedis } from '../../src/config/redis.js';
import { Application } from '../../src/models/application.model.js';
import { CertificateLink } from '../../src/models/certificate-link.model.js';
import { User } from '../../src/models/user.model.js';
import { HTTP_STATUS } from '../../src/shared/constants/http-status.js';

interface CertificateLinkBody {
  id?: string;
  name?: string;
  url?: string;
  issuer?: string | null;
  issuedDate?: string | null;
  expiryDate?: string | null;
  version?: number;
  status?: string;
  history?: unknown;
  idempotency_key?: string;
  request_hash?: string;
  items?: CertificateLinkBody[];
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  code?: string;
  suggested?: boolean;
  sentCount?: number;
  suggestedTotal?: number;
}

let server: Server | undefined;
let baseUrl: string;
let databaseConnected = false;
let candidateId: Types.ObjectId;
let otherCandidateId: Types.ObjectId;
let recruiterId: Types.ObjectId;
let candidateToken: string;
let otherCandidateToken: string;
let recruiterToken: string;

function sign(id: Types.ObjectId, role: string): string {
  return jwt.sign({ sub: String(id), email: `${id}@example.test`, role }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
}

async function create(name: string, url: string, key: string, token = candidateToken): Promise<{ status: number; body: CertificateLinkBody }> {
  const response = await fetch(`${baseUrl}/api/v1/me/certificate-links`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': key },
    body: JSON.stringify({ name, url }),
  });
  return { status: response.status, body: await response.json() as CertificateLinkBody };
}

async function list(token = candidateToken): Promise<{ status: number; body: CertificateLinkBody }> {
  const response = await fetch(`${baseUrl}/api/v1/me/certificate-links`, { headers: { authorization: `Bearer ${token}` } });
  return { status: response.status, body: await response.json() as CertificateLinkBody };
}

describe('Candidate certificate links (UC-S4-CERT-01 / UC-S4-CERT-04)', () => {
  beforeAll(async () => {
    await connectDatabase();
    databaseConnected = true;
    await CertificateLink.createIndexes();
    candidateId = new Types.ObjectId();
    otherCandidateId = new Types.ObjectId();
    recruiterId = new Types.ObjectId();
    await User.create([
      { _id: candidateId, email: `${candidateId}@example.test`, username: `candidate_${candidateId}`, role: 'user', status: 'active', email_verified: true },
      { _id: otherCandidateId, email: `${otherCandidateId}@example.test`, username: `candidate_${otherCandidateId}`, role: 'user', status: 'active', email_verified: true },
      { _id: recruiterId, email: `${recruiterId}@example.test`, username: `recruiter_${recruiterId}`, role: 'recruiter', status: 'active', email_verified: true },
    ]);
    candidateToken = sign(candidateId, 'user');
    otherCandidateToken = sign(otherCandidateId, 'user');
    recruiterToken = sign(recruiterId, 'recruiter');
    await new Promise<void>((resolve) => {
      const listeningServer = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${(listeningServer.address() as AddressInfo).port}`;
        server = listeningServer;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (databaseConnected) {
      await CertificateLink.deleteMany({ owner_id: { $in: [candidateId, otherCandidateId] } });
      await Application.collection.deleteMany({ applicant_id: candidateId });
      await User.deleteMany({ _id: { $in: [candidateId, otherCandidateId, recruiterId] } });
    }
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
    if (databaseConnected) {
      await disconnectRedis();
      await disconnectDatabase();
    }
  });

  it('creates and lists only the caller-owned link without exposing internal history or retry fields', async () => {
    const created = await create('Cloud Certificate', 'https://cert.example/abc', 'create-1');
    expect(created.status).toBe(HTTP_STATUS.HTTP_201_CREATED);
    expect(created.body).toMatchObject({ name: 'Cloud Certificate', url: 'https://cert.example/abc', version: 1, status: 'available' });
    expect(created.body).not.toHaveProperty('history');
    expect(created.body).not.toHaveProperty('idempotency_key');
    expect(created.body).not.toHaveProperty('request_hash');

    const own = await list();
    expect(own.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(own.body).toMatchObject({ total: 1, items: [{ id: created.body.id }] });
    expect((await list(otherCandidateToken)).body).toMatchObject({ total: 0, items: [] });
  });

  it('replays concurrent retries once, conflicts on URL reuse, and rejects keys reused with other content', async () => {
    const retries = await Promise.all([
      create('Concurrency', 'https://cert.example/concurrent', 'same-key'),
      create('Concurrency', 'https://cert.example/concurrent', 'same-key'),
    ]);
    expect(retries.map((result) => result.status).sort()).toEqual([HTTP_STATUS.HTTP_200_OK, HTTP_STATUS.HTTP_201_CREATED]);
    expect(retries[0]?.body.id).toBe(retries[1]?.body.id);

    const sameUrl = await create('Different operation', 'https://cert.example/concurrent', 'another-key');
    expect(sameUrl.status).toBe(HTTP_STATUS.HTTP_409_CONFLICT);
    expect(sameUrl.body.code).toBe('DUPLICATE_CERTIFICATE_URL');

    const sameKeyDifferentBody = await create('Changed name', 'https://cert.example/other', 'same-key');
    expect(sameKeyDifferentBody.status).toBe(HTTP_STATUS.HTTP_409_CONFLICT);
    expect(sameKeyDifferentBody.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('allows stateless reads, requires a verified candidate for writes, and rejects unauthenticated requests', async () => {
    expect((await create('No access', 'https://cert.example/no-access', 'recruiter-key', recruiterToken)).status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    await User.updateOne({ _id: candidateId }, { $set: { email_verified: false } });
    expect((await list()).status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect((await create('Unverified', 'https://cert.example/unverified', 'unverified-key')).status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    await User.updateOne({ _id: candidateId }, { $set: { email_verified: true } });
    const response = await fetch(`${baseUrl}/api/v1/me/certificate-links`);
    expect(response.status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
  });

  it('returns a successful empty page for a Candidate with no links', async () => {
    const result = await list(otherCandidateToken);
    expect(result.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(result.body).toMatchObject({ page: 1, limit: 20, total: 0, totalPages: 0, items: [] });
  });

  it('edits, suggests, searches, counts sent copies and deletes with version checks (UC-S4-CERT-02/03/05)', async () => {
    const send = async (method: string, path: string, body?: unknown, token = candidateToken) => {
      const response = await fetch(`${baseUrl}/api/v1/me/certificate-links${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, body: (response.status === HTTP_STATUS.HTTP_204_NO_CONTENT ? {} : await response.json()) as CertificateLinkBody };
    };
    const scrum = await create('Professional Scrum Master (PSM I)', 'https://scrum.example/psm', 'edit-1');
    expect(scrum.status).toBe(HTTP_STATUS.HTTP_201_CREATED);
    const id = scrum.body.id!;

    const suggested = await send('PATCH', `/${id}`, { expectedVersion: 1, suggested: true });
    expect(suggested.body).toMatchObject({ suggested: true, version: 1 });
    const edited = await send('PATCH', `/${id}`, { expectedVersion: 1, issuer: 'Scrum.org', issuedDate: '2023-06-04' });
    expect(edited.body).toMatchObject({ issuer: 'Scrum.org', issuedDate: '2023-06-04', version: 2, suggested: true });
    expect((await send('PATCH', `/${id}`, { expectedVersion: 1, name: 'Stale' })).body).toMatchObject({ code: 'VERSION_CONFLICT' });
    expect((await send('PATCH', `/${id}`, { expectedVersion: 2, expiryDate: '2020-01-01' })).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    expect((await send('PATCH', `/${id}`, { expectedVersion: 2, name: 'Mine now' }, otherCandidateToken)).status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);

    await Application.create({ job_id: new Types.ObjectId(), applicant_id: candidateId, cv_id: new Types.ObjectId(), status: 'submitted', certificates: [{ certificate_id: new Types.ObjectId(id), version: 2, name: 'Professional Scrum Master (PSM I)', url: 'https://scrum.example/psm' }] });
    const searched = await send('GET', '?search=scrum.(org');
    expect(searched.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(searched.body.total).toBe(0);
    const found = await send('GET', '?search=SCRUM');
    expect(found.body).toMatchObject({ total: 1, suggestedTotal: 1, items: [{ id, sentCount: 1 }] });

    expect((await send('DELETE', `/${id}?expectedVersion=1`)).body).toMatchObject({ code: 'VERSION_CONFLICT' });
    expect((await send('DELETE', `/${id}?expectedVersion=2`)).status).toBe(HTTP_STATUS.HTTP_204_NO_CONTENT);
    expect((await send('GET', '?search=scrum')).body.total).toBe(0);
    expect(await Application.countDocuments({ applicant_id: candidateId, 'certificates.certificate_id': new Types.ObjectId(id) })).toBe(1);
  });
});
