import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/db.js';
import { disconnectRedis } from '../../src/config/redis.js';
import { Enterprise } from '../../src/models/enterprise.model.js';
import { JobPosting } from '../../src/models/job-posting.model.js';
import { User } from '../../src/models/user.model.js';
import { Wishlist } from '../../src/models/wishlist.model.js';
import { HTTP_STATUS } from '../../src/shared/constants/http-status.js';

interface WishlistResponse {
  saved?: boolean;
  alreadySaved?: boolean;
  message?: string;
  id?: string;
  error?: string;
}

let server: Server | undefined;
let baseUrl: string;
let databaseConnected = false;

let candidateId: Types.ObjectId;
let recruiterId: Types.ObjectId;
let candidateToken: string;
let recruiterToken: string;

let enterpriseId: Types.ObjectId;
let activeJobId: Types.ObjectId;
let closedJobId: Types.ObjectId;
let expiredJobId: Types.ObjectId;

function sign(id: Types.ObjectId, role: string): string {
  return jwt.sign(
    { sub: String(id), email: `${id}@example.test`, role },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: '15m' },
  );
}

async function saveJob(jobId: string, token?: string): Promise<{ status: number; body: WishlistResponse }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}/api/v1/me/wishlist`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jobId }),
  });
  return { status: response.status, body: (await response.json()) as WishlistResponse };
}

describe('Applicant Wishlist - [C] Create (UC-S3-WL-01)', () => {
  beforeAll(async () => {
    await connectDatabase();
    databaseConnected = true;
    await Wishlist.createIndexes();

    candidateId = new Types.ObjectId();
    recruiterId = new Types.ObjectId();
    enterpriseId = new Types.ObjectId();

    await User.create([
      {
        _id: candidateId,
        email: `candidate_${candidateId}@example.test`,
        username: `candidate_${candidateId}`,
        role: 'user',
        status: 'active',
        email_verified: true,
      },
      {
        _id: recruiterId,
        email: `recruiter_${recruiterId}@example.test`,
        username: `recruiter_${recruiterId}`,
        role: 'recruiter',
        status: 'active',
        email_verified: true,
      },
    ]);

    candidateToken = sign(candidateId, 'user');
    recruiterToken = sign(recruiterId, 'recruiter');

    await Enterprise.create({
      _id: enterpriseId,
      name: 'Wishlist Tech Corp',
      tax_code: `TAX${enterpriseId.toHexString().slice(-8)}`,
      email: `ent_${enterpriseId}@corp.test`,
      phone: '0123456789',
      industry: 'Software',
      company_size: '51-200',
      address: { street: '123 Tech St', city: 'Ha Noi', country: 'Vietnam' },
      status: 'active',
      creator_account_id: recruiterId,
      is_deleted: false,
    });

    activeJobId = new Types.ObjectId();
    closedJobId = new Types.ObjectId();
    expiredJobId = new Types.ObjectId();

    await JobPosting.create([
      {
        _id: activeJobId,
        enterprise_id: enterpriseId,
        posted_by_user_id: recruiterId,
        title: 'Senior Backend Engineer',
        slug: `senior-backend-${activeJobId.toHexString()}`,
        status: 'published',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days in future
      },
      {
        _id: closedJobId,
        enterprise_id: enterpriseId,
        posted_by_user_id: recruiterId,
        title: 'Closed Designer Role',
        slug: `closed-designer-${closedJobId.toHexString()}`,
        status: 'closed',
      },
      {
        _id: expiredJobId,
        enterprise_id: enterpriseId,
        posted_by_user_id: recruiterId,
        title: 'Expired QA Role',
        slug: `expired-qa-${expiredJobId.toHexString()}`,
        status: 'published',
        expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      },
    ]);

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
      await Wishlist.deleteMany({ user_id: candidateId });
      await JobPosting.deleteMany({ _id: { $in: [activeJobId, closedJobId, expiredJobId] } });
      await Enterprise.deleteOne({ _id: enterpriseId });
      await User.deleteMany({ _id: { $in: [candidateId, recruiterId] } });
    }
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
    if (databaseConnected) {
      await disconnectRedis();
      await disconnectDatabase();
    }
  });

  it('rejects unauthenticated requests with 401 Unauthorized', async () => {
    const res = await saveJob(activeJobId.toHexString());
    expect(res.status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
  });

  it('rejects non-candidate roles (e.g. recruiter) with 403 Forbidden', async () => {
    const res = await saveJob(activeJobId.toHexString(), recruiterToken);
    expect(res.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
  });

  it('returns 404 Not Found when job ID does not exist', async () => {
    const nonExistent = new Types.ObjectId().toHexString();
    const res = await saveJob(nonExistent, candidateToken);
    expect(res.status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
  });

  it('returns 400 Bad Request when target job is closed', async () => {
    const res = await saveJob(closedJobId.toHexString(), candidateToken);
    expect(res.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
  });

  it('returns 400 Bad Request when target job is expired past its deadline', async () => {
    const res = await saveJob(expiredJobId.toHexString(), candidateToken);
    expect(res.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
  });

  it('saves an active published job returning 201 Created', async () => {
    const res = await saveJob(activeJobId.toHexString(), candidateToken);
    expect(res.status).toBe(HTTP_STATUS.HTTP_201_CREATED);
    expect(res.body).toMatchObject({
      saved: true,
      alreadySaved: false,
      message: 'Job added to wishlist successfully',
    });
    expect(res.body.id).toBeDefined();
  });

  it('returns 200 OK with alreadySaved=true on duplicate save (idempotency)', async () => {
    const res = await saveJob(activeJobId.toHexString(), candidateToken);
    expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(res.body).toMatchObject({
      saved: true,
      alreadySaved: true,
      message: 'Already in your saved jobs',
    });
  });

  it('enforces 500 capacity limit returning 409 Conflict', async () => {
    // Seed dummy wishlist items to reach capacity
    const dummyItems = Array.from({ length: 500 }, () => ({
      user_id: candidateId,
      job_id: new Types.ObjectId(),
    }));
    await Wishlist.deleteMany({ user_id: candidateId });
    await Wishlist.insertMany(dummyItems);

    const res = await saveJob(activeJobId.toHexString(), candidateToken);
    expect(res.status).toBe(HTTP_STATUS.HTTP_409_CONFLICT);

    // Clean up
    await Wishlist.deleteMany({ user_id: candidateId });
  });
});
