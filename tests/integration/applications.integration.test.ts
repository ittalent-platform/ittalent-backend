import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/db.js';
import { disconnectRedis } from '../../src/config/redis.js';
import { Application } from '../../src/models/application.model.js';
import { Document } from '../../src/models/document.model.js';
import { JobPosting } from '../../src/models/job-posting.model.js';
import { User } from '../../src/models/user.model.js';
import { HTTP_STATUS } from '../../src/shared/constants/http-status.js';

type ApplyResponse = { id: string; status: string; reappliedFrom: string | null; reappliedAs: string | null; code?: string; cvId: string };

let server: Server;
let baseUrl: string;
let token: string;
let userId: Types.ObjectId;
let cvA: Types.ObjectId;
let cvB: Types.ObjectId;

const bearer = () => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });

async function newJob(): Promise<string> {
  const job = await JobPosting.create({
    enterprise_id: new Types.ObjectId(), posted_by_user_id: new Types.ObjectId(), title: 'Frontend Engineer', slug: `job-${new Types.ObjectId()}`,
    status: 'published', openings: 5, expires_at: new Date(Date.now() + 86_400_000),
  });
  return String(job._id);
}

async function apply(jobPostingId: string, cvId: Types.ObjectId = cvA): Promise<{ status: number; body: ApplyResponse }> {
  const response = await fetch(`${baseUrl}/api/v1/me/applications`, { method: 'POST', headers: bearer(), body: JSON.stringify({ jobPostingId, cvId: String(cvId) }) });
  return { status: response.status, body: (await response.json()) as ApplyResponse };
}

// The latest application for one job: the list is newest-first, so the first item of a jobId-filtered page.
async function mine(jobPostingId: string): Promise<ApplyResponse | null> {
  const response = await fetch(`${baseUrl}/api/v1/me/applications?jobId=${jobPostingId}&limit=1`, { headers: bearer() });
  return ((await response.json()) as { items: ApplyResponse[] }).items[0] ?? null;
}

const setStatus = (id: string, status: string) => Application.updateOne({ _id: id }, { $set: { status } });

describe('Applications: one active application per job, apply again as a new record (integration)', () => {
  beforeAll(async () => {
    await connectDatabase();
    await Application.syncIndexes();
    userId = new Types.ObjectId();
    await User.create({ _id: userId, email: `applicant-${userId}@example.test`, username: `applicant_${userId}`, role: 'user', status: 'active' });
    cvA = (await Document.create({ owner_id: userId, type: 'cv', file_url: 'https://example.test/a.pdf', storage_key: 'a', file_name: 'a.pdf', mime_type: 'application/pdf', size: 10 }))._id;
    cvB = (await Document.create({ owner_id: userId, type: 'cv', file_url: 'https://example.test/b.pdf', storage_key: 'b', file_name: 'b.pdf', mime_type: 'application/pdf', size: 10 }))._id;
    token = jwt.sign({ sub: String(userId), email: `applicant-${userId}@example.test`, role: 'user' }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
    await new Promise<void>((resolve) => { server = app.listen(0, () => { baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; resolve(); }); });
  });

  afterAll(async () => {
    await Application.deleteMany({ applicant_id: userId });
    await Document.deleteMany({ owner_id: userId });
    await User.deleteOne({ _id: userId });
    await new Promise<void>((resolve) => { server.close(() => resolve()); });
    await disconnectRedis();
    await disconnectDatabase();
  });

  it('accepts the first application and reports it through the jobId-filtered list', async () => {
    const job = await newJob();
    expect(await mine(job)).toBeNull();
    const first = await apply(job);
    expect(first.status).toBe(HTTP_STATUS.HTTP_201_CREATED);
    expect(first.body).toMatchObject({ status: 'submitted', reappliedFrom: null, reappliedAs: null });
    expect((await mine(job))?.id).toBe(first.body.id);
  });

  it.each(['submitted', 'under_review', 'interviewing', 'offered'])('rejects a second application while the first is %s', async (status) => {
    const job = await newJob();
    const first = await apply(job);
    await setStatus(first.body.id, status);
    const second = await apply(job);
    expect(second.status).toBe(HTTP_STATUS.HTTP_409_CONFLICT);
    expect(second.body.code).toBe('ALREADY_APPLIED');
    expect(await Application.countDocuments({ applicant_id: userId, job_id: job })).toBe(1);
  });

  it('blocks any further application once hired', async () => {
    const job = await newJob();
    const first = await apply(job);
    await setStatus(first.body.id, 'hired');
    const again = await apply(job);
    expect(again.status).toBe(HTTP_STATUS.HTTP_409_CONFLICT);
    expect(again.body.code).toBe('APPLY_AGAIN_NOT_ALLOWED');
  });

  it.each(['withdrawn', 'rejected'])('applying again after %s creates a new linked record and leaves the old one untouched', async (status) => {
    const job = await newJob();
    const first = await apply(job, cvA);
    await setStatus(first.body.id, status);
    const before = await Application.findById(first.body.id).lean();

    const again = await apply(job, cvB);
    expect(again.status).toBe(HTTP_STATUS.HTTP_201_CREATED);
    expect(again.body.id).not.toBe(first.body.id);
    expect(again.body).toMatchObject({ status: 'submitted', reappliedFrom: first.body.id, cvId: String(cvB) });

    const old = await Application.findById(first.body.id).lean();
    expect(old).toMatchObject({ status, cv_id: before!.cv_id });
    expect(String(old!.reapplied_as)).toBe(again.body.id);
    expect(old!.status_history).toHaveLength(before!.status_history.length);
    expect((await mine(job))?.id).toBe(again.body.id);
    // Only one application is active, so a third attempt is a duplicate.
    expect((await apply(job)).body.code).toBe('ALREADY_APPLIED');
  });

  it('stops after two applications for the same job', async () => {
    const job = await newJob();
    const first = await apply(job);
    await setStatus(first.body.id, 'withdrawn');
    const second = await apply(job);
    await setStatus(second.body.id, 'rejected');
    const third = await apply(job);
    expect(third.status).toBe(HTTP_STATUS.HTTP_409_CONFLICT);
    expect(third.body.code).toBe('APPLY_AGAIN_NOT_ALLOWED');
    expect(await Application.countDocuments({ applicant_id: userId, job_id: job })).toBe(2);
  });

  it('lets exactly one of two simultaneous applications through', async () => {
    const job = await newJob();
    const results = await Promise.all([apply(job), apply(job)]);
    expect(results.map((result) => result.status).sort()).toEqual([HTTP_STATUS.HTTP_201_CREATED, HTTP_STATUS.HTTP_409_CONFLICT]);
    expect(await Application.countDocuments({ applicant_id: userId, job_id: job })).toBe(1);
  });

  it('lets exactly one of two simultaneous re-applications through', async () => {
    const job = await newJob();
    const first = await apply(job);
    await setStatus(first.body.id, 'withdrawn');
    const results = await Promise.all([apply(job), apply(job)]);
    expect(results.map((result) => result.status).sort()).toEqual([HTTP_STATUS.HTTP_201_CREATED, HTTP_STATUS.HTTP_409_CONFLICT]);
    expect(await Application.countDocuments({ applicant_id: userId, job_id: job })).toBe(2);
  });
});
