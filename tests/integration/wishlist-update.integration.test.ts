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
import type { WishlistToggleResponse } from '../../src/modules/wishlist/wishlist.schemas.js';

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

function sign(id: Types.ObjectId, role: string): string {
  return jwt.sign(
    { sub: String(id), email: `${id}@example.test`, role },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: '15m' },
  );
}

async function patchToggle(jobId: string, token?: string): Promise<{ status: number; body: WishlistToggleResponse }> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}/api/v1/me/wishlist/jobs/${jobId}/toggle`, {
    method: 'PATCH',
    headers,
  });
  return { status: response.status, body: (await response.json()) as WishlistToggleResponse };
}

async function postToggle(jobId: string, token?: string): Promise<{ status: number; body: WishlistToggleResponse }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}/api/v1/me/wishlist/toggle`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jobId }),
  });
  return { status: response.status, body: (await response.json()) as WishlistToggleResponse };
}

describe('Applicant Wishlist - [U] Update & Toggle (UC-S3-WL-01 AC.1)', () => {
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
        email: `cand_toggle_${candidateId}@example.test`,
        username: `cand_toggle_${candidateId}`,
        role: 'user',
        status: 'active',
        email_verified: true,
      },
      {
        _id: recruiterId,
        email: `rec_toggle_${recruiterId}@example.test`,
        username: `rec_toggle_${recruiterId}`,
        role: 'recruiter',
        status: 'active',
        email_verified: true,
      },
    ]);

    candidateToken = sign(candidateId, 'user');
    recruiterToken = sign(recruiterId, 'recruiter');

    await Enterprise.create({
      _id: enterpriseId,
      name: 'Toggle Games Studio',
      tax_code: `TAX${enterpriseId.toHexString().slice(-8)}`,
      email: `toggle_${enterpriseId}@corp.test`,
      phone: '0912345678',
      industry: 'Gaming',
      company_size: '51-200',
      address: { street: '789 Play St', city: 'Ha Noi', country: 'Vietnam' },
      status: 'active',
      creator_account_id: recruiterId,
      is_deleted: false,
    });

    activeJobId = new Types.ObjectId();
    closedJobId = new Types.ObjectId();

    await JobPosting.create([
      {
        _id: activeJobId,
        enterprise_id: enterpriseId,
        posted_by_user_id: recruiterId,
        title: 'Gameplay Programmer',
        slug: `gameplay-prog-${activeJobId.toHexString()}`,
        status: 'published',
        expires_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      },
      {
        _id: closedJobId,
        enterprise_id: enterpriseId,
        posted_by_user_id: recruiterId,
        title: 'Inactive Artist',
        slug: `inactive-artist-${closedJobId.toHexString()}`,
        status: 'closed',
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
      await JobPosting.deleteMany({ _id: { $in: [activeJobId, closedJobId] } });
      await Enterprise.deleteOne({ _id: enterpriseId });
      await User.deleteMany({ _id: { $in: [candidateId, recruiterId] } });
    }
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
    if (databaseConnected) {
      await disconnectRedis();
      await disconnectDatabase();
    }
  });

  it('rejects unauthenticated toggle requests with 401 Unauthorized', async () => {
    const res = await patchToggle(activeJobId.toHexString());
    expect(res.status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
  });

  it('rejects recruiter role toggle requests with 403 Forbidden', async () => {
    const res = await patchToggle(activeJobId.toHexString(), recruiterToken);
    expect(res.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
  });

  it('rejects toggle on closed jobs with 400 Bad Request', async () => {
    const res = await patchToggle(closedJobId.toHexString(), candidateToken);
    expect(res.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
  });

  it('alternates between saved and unsaved state via PATCH /jobs/:jobId/toggle', async () => {
    // 1st toggle: not saved -> saved
    const toggleOn = await patchToggle(activeJobId.toHexString(), candidateToken);
    expect(toggleOn.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(toggleOn.body).toMatchObject({
      saved: true,
      message: 'Job added to wishlist successfully',
    });
    expect(toggleOn.body.id).toBeDefined();

    // Verify record exists in DB
    const inDb = await Wishlist.findOne({ user_id: candidateId, job_id: activeJobId });
    expect(inDb).not.toBeNull();

    // 2nd toggle: saved -> unsaved
    const toggleOff = await patchToggle(activeJobId.toHexString(), candidateToken);
    expect(toggleOff.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(toggleOff.body).toMatchObject({
      saved: false,
      message: 'Job removed from wishlist',
    });

    // Verify record deleted from DB
    const inDbAfter = await Wishlist.findOne({ user_id: candidateId, job_id: activeJobId });
    expect(inDbAfter).toBeNull();
  });

  it('alternates between saved and unsaved state via POST /toggle (alias)', async () => {
    // 1st toggle: not saved -> saved
    const toggleOn = await postToggle(activeJobId.toHexString(), candidateToken);
    expect(toggleOn.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(toggleOn.body.saved).toBe(true);

    // 2nd toggle: saved -> unsaved
    const toggleOff = await postToggle(activeJobId.toHexString(), candidateToken);
    expect(toggleOff.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(toggleOff.body.saved).toBe(false);
  });
});
