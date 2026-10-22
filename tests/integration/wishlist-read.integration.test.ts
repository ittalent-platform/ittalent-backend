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
import type { WishlistCheckResponse, WishlistResponse } from '../../src/modules/wishlist/wishlist.schemas.js';

let server: Server | undefined;
let baseUrl: string;
let databaseConnected = false;

let candidateAId: Types.ObjectId;
let candidateBId: Types.ObjectId;
let recruiterId: Types.ObjectId;
let candidateAToken: string;
let candidateBToken: string;
let recruiterToken: string;

let enterpriseId: Types.ObjectId;
let activeJob1Id: Types.ObjectId;
let activeJob2Id: Types.ObjectId;
let closedJobId: Types.ObjectId;

function sign(id: Types.ObjectId, role: string): string {
  return jwt.sign(
    { sub: String(id), email: `${id}@example.test`, role },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: '15m' },
  );
}

async function listWishlist(query = '', token?: string): Promise<{ status: number; body: WishlistResponse }> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}/api/v1/me/wishlist${query ? `?${query}` : ''}`, {
    headers,
  });
  return { status: response.status, body: (await response.json()) as WishlistResponse };
}

async function checkJobSaved(jobId: string, token?: string): Promise<{ status: number; body: WishlistCheckResponse }> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}/api/v1/me/wishlist/jobs/${jobId}`, {
    headers,
  });
  return { status: response.status, body: (await response.json()) as WishlistCheckResponse };
}

describe('Applicant Wishlist - [R] Read & Search/Filter (UC-S3-WL-02 / UC-S3-WL-03)', () => {
  beforeAll(async () => {
    await connectDatabase();
    databaseConnected = true;
    await Wishlist.createIndexes();

    candidateAId = new Types.ObjectId();
    candidateBId = new Types.ObjectId();
    recruiterId = new Types.ObjectId();
    enterpriseId = new Types.ObjectId();

    await User.create([
      {
        _id: candidateAId,
        email: `cand_a_${candidateAId}@example.test`,
        username: `cand_a_${candidateAId}`,
        role: 'user',
        status: 'active',
        email_verified: true,
      },
      {
        _id: candidateBId,
        email: `cand_b_${candidateBId}@example.test`,
        username: `cand_b_${candidateBId}`,
        role: 'user',
        status: 'active',
        email_verified: true,
      },
      {
        _id: recruiterId,
        email: `recruiter_${recruiterId}@example.test`,
        username: `rec_${recruiterId}`,
        role: 'recruiter',
        status: 'active',
        email_verified: true,
      },
    ]);

    candidateAToken = sign(candidateAId, 'user');
    candidateBToken = sign(candidateBId, 'user');
    recruiterToken = sign(recruiterId, 'recruiter');

    await Enterprise.create({
      _id: enterpriseId,
      name: 'Lumen Labs',
      tax_code: `TAX${enterpriseId.toHexString().slice(-8)}`,
      email: `lumen_${enterpriseId}@corp.test`,
      phone: '0987654321',
      industry: 'Software',
      company_size: '51-200',
      address: { street: '456 Innovation Blvd', city: 'Ho Chi Minh City', country: 'Vietnam' },
      status: 'active',
      creator_account_id: recruiterId,
      is_deleted: false,
    });

    activeJob1Id = new Types.ObjectId();
    activeJob2Id = new Types.ObjectId();
    closedJobId = new Types.ObjectId();

    await JobPosting.create([
      {
        _id: activeJob1Id,
        enterprise_id: enterpriseId,
        posted_by_user_id: recruiterId,
        title: 'Frontend Developer (React)',
        slug: `frontend-developer-react-${activeJob1Id.toHexString()}`,
        status: 'published',
        location: 'Ho Chi Minh City · On-site',
        salary_min: 25000000,
        salary_max: 35000000,
        currency: 'VND',
        expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days in future
      },
      {
        _id: activeJob2Id,
        enterprise_id: enterpriseId,
        posted_by_user_id: recruiterId,
        title: 'Golang Microservices Specialist',
        slug: `golang-specialist-${activeJob2Id.toHexString()}`,
        status: 'published',
        location: 'Ha Noi · Hybrid',
        salary_min: 40000000,
        salary_max: 55000000,
        currency: 'VND',
        expires_at: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // 1 day in future (closing soon)
      },
      {
        _id: closedJobId,
        enterprise_id: enterpriseId,
        posted_by_user_id: recruiterId,
        title: 'Deprecated Mobile Role',
        slug: `deprecated-mobile-${closedJobId.toHexString()}`,
        status: 'closed',
        location: 'Da Nang',
      },
    ]);

    // Seed Wishlist items for Candidate A (saved in chronological order: activeJob1, closedJob, activeJob2)
    await Wishlist.create([
      { user_id: candidateAId, job_id: activeJob1Id, createdAt: new Date('2026-10-01T00:00:00.000Z') },
      { user_id: candidateAId, job_id: closedJobId, createdAt: new Date('2026-10-05T00:00:00.000Z') },
      { user_id: candidateAId, job_id: activeJob2Id, createdAt: new Date('2026-10-10T00:00:00.000Z') },
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
      await Wishlist.deleteMany({ user_id: { $in: [candidateAId, candidateBId] } });
      await JobPosting.deleteMany({ _id: { $in: [activeJob1Id, activeJob2Id, closedJobId] } });
      await Enterprise.deleteOne({ _id: enterpriseId });
      await User.deleteMany({ _id: { $in: [candidateAId, candidateBId, recruiterId] } });
    }
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
    if (databaseConnected) {
      await disconnectRedis();
      await disconnectDatabase();
    }
  });

  it('rejects unauthenticated requests with 401 Unauthorized', async () => {
    const res = await listWishlist();
    expect(res.status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
  });

  it('rejects recruiter role with 403 Forbidden', async () => {
    const res = await listWishlist('', recruiterToken);
    expect(res.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
  });

  it('lists saved jobs reverse-chronologically with available and unavailable placeholders', async () => {
    const res = await listWishlist('', candidateAToken);
    expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(res.body.total).toBe(3);
    expect(res.body.items).toHaveLength(3);

    const first = res.body.items[0]!;
    const second = res.body.items[1]!;
    const third = res.body.items[2]!;

    // Newest saved first: activeJob2 (saved Oct 10), closedJob (saved Oct 5), activeJob1 (saved Oct 1)
    expect(first.jobId).toBe(activeJob2Id.toHexString());
    expect(first.availability).toBe('available');
    expect(first.isClosingSoon).toBe(true); // expires in 1 day
    expect(first.title).toBe('Golang Microservices Specialist');
    expect(first.enterprise?.name).toBe('Lumen Labs');

    // Middle item: closed job with masked sensitive fields (Board 6 & 11 WL-02 A2)
    expect(second.jobId).toBe(closedJobId.toHexString());
    expect(second.availability).toBe('unavailable');
    expect(second.title).toBeNull();
    expect(second.enterprise).toBeNull();
    expect(second.salaryMin).toBeNull();

    // Oldest item: activeJob1
    expect(third.jobId).toBe(activeJob1Id.toHexString());
    expect(third.availability).toBe('available');
    expect(third.isClosingSoon).toBe(false);
  });

  it('filters by status=available excluding closed jobs', async () => {
    const res = await listWishlist('status=available', candidateAToken);
    expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(res.body.total).toBe(2);
    expect(res.body.items.every((item) => item.availability === 'available')).toBe(true);
  });

  it('filters by status=unavailable returning only closed jobs with masked details (Board 10)', async () => {
    const res = await listWishlist('status=unavailable', candidateAToken);
    expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0]?.jobId).toBe(closedJobId.toHexString());
    expect(res.body.items[0]?.title).toBeNull();
  });

  it('filters by text keyword q matching job title or enterprise name', async () => {
    const res = await listWishlist('q=Golang', candidateAToken);
    expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0]?.jobId).toBe(activeJob2Id.toHexString());

    const companyRes = await listWishlist('q=Lumen', candidateAToken);
    expect(companyRes.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(companyRes.body.total).toBe(2); // matches both active jobs at Lumen Labs
  });

  it('rejects unsupported query parameters with 400 Bad Request (Board 12 E2)', async () => {
    const res = await listWishlist('skill=React', candidateAToken);
    expect(res.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
  });

  it('enforces tenant isolation: Candidate B sees empty wishlist (BR-31)', async () => {
    const res = await listWishlist('', candidateBToken);
    expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(res.body.total).toBe(0);
    expect(res.body.items).toHaveLength(0);
  });

  it('checks single job saved status for job detail heart button', async () => {
    const savedCheck = await checkJobSaved(activeJob1Id.toHexString(), candidateAToken);
    expect(savedCheck.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(savedCheck.body.isSaved).toBe(true);
    expect(savedCheck.body.wishlistId).toBeDefined();

    const unsavedCheck = await checkJobSaved(new Types.ObjectId().toHexString(), candidateAToken);
    expect(unsavedCheck.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(unsavedCheck.body.isSaved).toBe(false);
    expect(unsavedCheck.body.wishlistId).toBeNull();
  });
});
