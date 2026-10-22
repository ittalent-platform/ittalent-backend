import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/db.js';
import { disconnectRedis } from '../../src/config/redis.js';
import { PortfolioLink } from '../../src/models/portfolio-link.model.js';
import { User } from '../../src/models/user.model.js';
import { HTTP_STATUS } from '../../src/shared/constants/http-status.js';

interface Body {
  id?: string;
  title?: string;
  url?: string;
  description?: string | null;
  version?: number;
  code?: string;
  items?: Body[];
  total?: number;
  totalPages?: number;
}

let server: Server | undefined;
let baseUrl: string;
let databaseConnected = false;
let candidateId: Types.ObjectId;
let otherId: Types.ObjectId;
let recruiterId: Types.ObjectId;
let candidateToken: string;
let otherToken: string;
let recruiterToken: string;

const sign = (id: Types.ObjectId, role: string) => jwt.sign({ sub: String(id), email: `${id}@example.test`, role }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });

async function call(method: string, path: string, options: { token?: string; key?: string; body?: unknown } = {}): Promise<{ status: number; body: Body }> {
  const response = await fetch(`${baseUrl}/api/v1/me/portfolio-links${path}`, {
    method,
    headers: {
      authorization: `Bearer ${options.token ?? candidateToken}`,
      'content-type': 'application/json',
      ...(options.key ? { 'idempotency-key': options.key } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  return { status: response.status, body: (response.status === HTTP_STATUS.HTTP_204_NO_CONTENT ? {} : await response.json()) as Body };
}

describe('Candidate portfolio links (UC-S4-PORT-01 / 03 / 04)', () => {
  beforeAll(async () => {
    await connectDatabase();
    databaseConnected = true;
    await PortfolioLink.createIndexes();
    candidateId = new Types.ObjectId();
    otherId = new Types.ObjectId();
    recruiterId = new Types.ObjectId();
    await User.create([
      { _id: candidateId, email: `${candidateId}@example.test`, username: `candidate_${candidateId}`, role: 'user', status: 'active', email_verified: true },
      { _id: otherId, email: `${otherId}@example.test`, username: `candidate_${otherId}`, role: 'user', status: 'active', email_verified: true },
      { _id: recruiterId, email: `${recruiterId}@example.test`, username: `recruiter_${recruiterId}`, role: 'recruiter', status: 'active', email_verified: true },
    ]);
    candidateToken = sign(candidateId, 'user');
    otherToken = sign(otherId, 'user');
    recruiterToken = sign(recruiterId, 'recruiter');
    await new Promise<void>((resolve) => {
      const listening = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${(listening.address() as AddressInfo).port}`;
        server = listening;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (databaseConnected) {
      await PortfolioLink.deleteMany({ owner_id: { $in: [candidateId, otherId] } });
      await User.deleteMany({ _id: { $in: [candidateId, otherId, recruiterId] } });
    }
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
    if (databaseConnected) {
      await disconnectRedis();
      await disconnectDatabase();
    }
  });

  it('creates, lists privately, replays a retry, and rejects duplicates and key reuse', async () => {
    const created = await call('POST', '', { key: 'p-1', body: { title: 'My site', url: 'https://me.example/work', description: 'Projects' } });
    expect(created.status).toBe(HTTP_STATUS.HTTP_201_CREATED);
    expect(created.body).toMatchObject({ title: 'My site', url: 'https://me.example/work', description: 'Projects', version: 1 });
    expect(created.body).not.toHaveProperty('idempotency_key');

    const replay = await call('POST', '', { key: 'p-1', body: { title: 'My site', url: 'https://me.example/work', description: 'Projects' } });
    expect(replay.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(replay.body.id).toBe(created.body.id);

    const duplicate = await call('POST', '', { key: 'p-2', body: { title: 'Again', url: 'https://me.example/work' } });
    expect(duplicate.status).toBe(HTTP_STATUS.HTTP_409_CONFLICT);
    expect(duplicate.body.code).toBe('DUPLICATE_PORTFOLIO_URL');
    expect((await call('POST', '', { key: 'p-1', body: { title: 'Changed', url: 'https://me.example/other' } })).body.code).toBe('IDEMPOTENCY_KEY_REUSED');

    expect((await call('GET', '')).body).toMatchObject({ total: 1, totalPages: 1, items: [{ id: created.body.id }] });
    expect((await call('GET', '', { token: otherToken })).body).toMatchObject({ total: 0, items: [] });
    // Another Candidate may use the same URL (A3).
    expect((await call('POST', '', { token: otherToken, key: 'p-1', body: { title: 'Mine', url: 'https://me.example/work' } })).status).toBe(HTTP_STATUS.HTTP_201_CREATED);
  });

  it('validates input, requires an Idempotency-Key and enforces the Candidate role', async () => {
    expect((await call('POST', '', { key: 'v-1', body: { title: 'Bad', url: 'javascript:alert(1)' } })).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    expect((await call('POST', '', { body: { title: 'No key', url: 'https://me.example/nokey' } })).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    expect((await call('POST', '', { token: recruiterToken, key: 'r-1', body: { title: 'HR', url: 'https://me.example/hr' } })).status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    expect((await call('GET', '', { token: recruiterToken })).status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    expect((await fetch(`${baseUrl}/api/v1/me/portfolio-links`)).status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
    expect((await call('GET', '?limit=0')).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
  });

  it('deletes only the owner\'s link with a matching version', async () => {
    const created = await call('POST', '', { key: 'd-1', body: { title: 'To delete', url: 'https://me.example/delete' } });
    const id = created.body.id!;
    expect((await call('DELETE', `/${id}?expectedVersion=1`, { token: otherToken })).status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
    expect((await call('DELETE', `/${id}?expectedVersion=5`)).body.code).toBe('VERSION_CONFLICT');
    expect((await call('DELETE', `/${id}`)).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    expect((await call('DELETE', `/${id}?expectedVersion=1`)).status).toBe(HTTP_STATUS.HTTP_204_NO_CONTENT);
    expect((await call('DELETE', `/${id}?expectedVersion=1`)).status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
  });
});
