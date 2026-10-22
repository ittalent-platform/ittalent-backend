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
import type { WishlistBulkDeleteResponse, WishlistDeleteResponse } from '../../src/modules/wishlist/wishlist.schemas.js';

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
let expiredJobId: Types.ObjectId;

function sign(id: Types.ObjectId, role: string): string {
  return jwt.sign(
    { sub: String(id), email: `${id}@example.test`, role },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: '15m' },
  );
}

async function deleteJobByJobId(jobId: string, token?: string): Promise<{ status: number; body: WishlistDeleteResponse }> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}/api/v1/me/wishlist/jobs/${jobId}`, {
    method: 'DELETE',
    headers,
  });
  return { status: response.status, body: (await response.json()) as WishlistDeleteResponse };
}

async function deleteWishlistById(id: string, token?: string): Promise<{ status: number; body: WishlistDeleteResponse }> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}/api/v1/me/wishlist/${id}`, {
    method: 'DELETE',
    headers,
  });
  return { status: response.status, body: (await response.json()) as WishlistDeleteResponse };
}

async function clearUnavailable(token?: string): Promise<{ status: number; body: WishlistBulkDeleteResponse }> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}/api/v1/me/wishlist/unavailable`, {
    method: 'DELETE',
    headers,
  });
  return { status: response.status, body: (await response.json()) as WishlistBulkDeleteResponse };
}

describe('Applicant Wishlist - [D] Delete & Removal Lifecycle (UC-S3-WL-04)', () => {
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
        email: `rec_del_${recruiterId}@example.test`,
        username: `rec_del_${recruiterId}`,
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
      name: 'Delete Test Tech',
      tax_code: `TAX${enterpriseId.toHexString().slice(-8)}`,
      email: `del_${enterpriseId}@corp.test`,
      phone: '0988776655',
      industry: 'Software',
      company_size: '51-200',
      address: { street: '123 Test Ave', city: 'HCM', country: 'Vietnam' },
      status: 'active',
      creator_account_id: recruiterId,
      is_deleted: false,
    });

    activeJob1Id = new Types.ObjectId();
    activeJob2Id = new Types.ObjectId();
    closedJobId = new Types.ObjectId();
    expiredJobId = new Types.ObjectId();

    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);

    await JobPosting.create([
      {
        _id: activeJob1Id,
        title: 'Backend Engineer 1',
        slug: `back-eng-1-${activeJob1Id.toHexString().slice(-6)}`,
        enterprise_id: enterpriseId,
        posted_by_user_id: recruiterId,
        status: 'published',
        expires_at: future,
      },
      {
        _id: activeJob2Id,
        title: 'Backend Engineer 2',
        slug: `back-eng-2-${activeJob2Id.toHexString().slice(-6)}`,
        enterprise_id: enterpriseId,
        posted_by_user_id: recruiterId,
        status: 'published',
        expires_at: future,
      },
      {
        _id: closedJobId,
        title: 'Closed Engineer',
        slug: `closed-eng-${closedJobId.toHexString().slice(-6)}`,
        enterprise_id: enterpriseId,
        posted_by_user_id: recruiterId,
        status: 'closed',
      },
      {
        _id: expiredJobId,
        title: 'Expired Engineer',
        slug: `exp-eng-${expiredJobId.toHexString().slice(-6)}`,
        enterprise_id: enterpriseId,
        posted_by_user_id: recruiterId,
        status: 'published',
        expires_at: past,
      },
    ]);

    await new Promise<void>((resolve) => {
      const listeningServer = app.listen(0, () => {
        const address = listeningServer.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        server = listeningServer;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (databaseConnected) {
      await Wishlist.deleteMany({ user_id: { $in: [candidateAId, candidateBId] } });
      await JobPosting.deleteMany({ _id: { $in: [activeJob1Id, activeJob2Id, closedJobId, expiredJobId] } });
      await Enterprise.deleteOne({ _id: enterpriseId });
      await User.deleteMany({ _id: { $in: [candidateAId, candidateBId, recruiterId] } });
    }
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
    if (databaseConnected) {
      await disconnectRedis();
      await disconnectDatabase();
    }
  });

  describe('Authorization & Role Guard', () => {
    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      const res = await deleteJobByJobId(activeJob1Id.toHexString());
      expect(res.status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
    });

    it('rejects non-candidate roles with 403 Forbidden', async () => {
      const res = await deleteJobByJobId(activeJob1Id.toHexString(), recruiterToken);
      expect(res.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    });

    it('rejects invalid ObjectId param with 400 Bad Request', async () => {
      const res = await deleteJobByJobId('not-a-valid-id', candidateAToken);
      expect(res.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    });
  });

  describe('DELETE /api/v1/me/wishlist/jobs/:jobId', () => {
    it('deletes saved job and returns 200 OK with alreadyRemoved=false', async () => {
      await Wishlist.create({ user_id: candidateAId, job_id: activeJob1Id });

      const res = await deleteJobByJobId(activeJob1Id.toHexString(), candidateAToken);
      expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
      expect(res.body).toEqual({
        removed: true,
        alreadyRemoved: false,
        message: 'Job removed from wishlist',
      });

      const inDb = await Wishlist.findOne({ user_id: candidateAId, job_id: activeJob1Id });
      expect(inDb).toBeNull();
    });

    it('returns 200 OK with alreadyRemoved=true when job is already removed (idempotency, Board 11 WL-03 A3)', async () => {
      const res = await deleteJobByJobId(activeJob1Id.toHexString(), candidateAToken);
      expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
      expect(res.body).toEqual({
        removed: true,
        alreadyRemoved: true,
        message: 'This job is no longer in your saved jobs',
      });
    });

    it('preserves applicant isolation: Candidate A cannot delete Candidate B bookmark', async () => {
      await Wishlist.create({ user_id: candidateBId, job_id: activeJob1Id });

      const resA = await deleteJobByJobId(activeJob1Id.toHexString(), candidateAToken);
      expect(resA.status).toBe(HTTP_STATUS.HTTP_200_OK);
      expect(resA.body.alreadyRemoved).toBe(true);

      const candidateBDoc = await Wishlist.findOne({ user_id: candidateBId, job_id: activeJob1Id });
      expect(candidateBDoc).not.toBeNull();

      // Candidate B can still delete their own bookmark
      const resB = await deleteJobByJobId(activeJob1Id.toHexString(), candidateBToken);
      expect(resB.status).toBe(HTTP_STATUS.HTTP_200_OK);
      expect(resB.body.alreadyRemoved).toBe(false);
    });
  });

  describe('DELETE /api/v1/me/wishlist/:id', () => {
    it('deletes by wishlist record ID returning 200 OK', async () => {
      const doc = await Wishlist.create({ user_id: candidateAId, job_id: activeJob2Id });

      const res = await deleteWishlistById(doc._id.toHexString(), candidateAToken);
      expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
      expect(res.body).toEqual({
        removed: true,
        alreadyRemoved: false,
        message: 'Job removed from wishlist',
      });

      const inDb = await Wishlist.findById(doc._id);
      expect(inDb).toBeNull();
    });

    it('returns 200 OK with alreadyRemoved=true when deleting already deleted record ID', async () => {
      const nonExistentId = new Types.ObjectId().toHexString();
      const res = await deleteWishlistById(nonExistentId, candidateAToken);
      expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
      expect(res.body).toEqual({
        removed: true,
        alreadyRemoved: true,
        message: 'This job is no longer in your saved jobs',
      });
    });

    it('preserves applicant isolation: Candidate A cannot delete Candidate B wishlist record ID', async () => {
      const docB = await Wishlist.create({ user_id: candidateBId, job_id: activeJob2Id });

      const res = await deleteWishlistById(docB._id.toHexString(), candidateAToken);
      expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
      expect(res.body.alreadyRemoved).toBe(true);

      const stillExists = await Wishlist.findById(docB._id);
      expect(stillExists).not.toBeNull();
    });
  });

  describe('DELETE /api/v1/me/wishlist/unavailable (Bulk Cleanup)', () => {
    it('purges only unavailable/expired jobs and preserves active jobs', async () => {
      await Wishlist.deleteMany({ user_id: candidateAId });

      await Wishlist.create([
        { user_id: candidateAId, job_id: activeJob1Id },
        { user_id: candidateAId, job_id: closedJobId },
        { user_id: candidateAId, job_id: expiredJobId },
      ]);

      const res = await clearUnavailable(candidateAToken);
      expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
      expect(res.body).toEqual({
        removedCount: 2,
        message: 'Unavailable saved jobs cleared successfully',
      });

      const remaining = await Wishlist.find({ user_id: candidateAId });
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.job_id.toHexString()).toBe(activeJob1Id.toHexString());
    });
  });
});
