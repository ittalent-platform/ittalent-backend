import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';

import { app } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/db.js';
import { Application, type ApplicationStatus } from '../../src/models/application.model.js';
import { Document } from '../../src/models/document.model.js';
import { Enterprise } from '../../src/models/enterprise.model.js';
import { Interview } from '../../src/models/interview.model.js';
import { JobPosting } from '../../src/models/job-posting.model.js';
import { User } from '../../src/models/user.model.js';
import { HTTP_STATUS } from '../../src/shared/constants/http-status.js';
import type { RecruiterApplicationListResponse } from '../../src/modules/applications/recruiter-applications.schemas.js';

describe('Recruiter Applications Listing API (integration: UC-S2-AA-01, 05, 06)', () => {
  let server: Server;
  let baseUrl: string;

  const enterpriseAId = new Types.ObjectId();
  const enterpriseBId = new Types.ObjectId();

  const recruiterAId = new Types.ObjectId();
  const recruiterBId = new Types.ObjectId();
  const candidateId = new Types.ObjectId();
  const candidate2Id = new Types.ObjectId();

  let recruiterAToken: string;
  let recruiterBToken: string;
  let candidateToken: string;

  let jobA1Id: Types.ObjectId;
  let jobA2Id: Types.ObjectId;
  let jobBId: Types.ObjectId;

  let cvDocId: Types.ObjectId;
  let coverLetterDocId: Types.ObjectId;

  let appA1Id: Types.ObjectId;
  let appA2Id: Types.ObjectId;
  let appBId: Types.ObjectId;

  beforeAll(async () => {
    await connectDatabase();
    await Application.syncIndexes();

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    recruiterAToken = jwt.sign(
      { sub: String(recruiterAId), email: 'recruiterA@corp-a.com', role: 'recruiter' },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: '1h' },
    );

    recruiterBToken = jwt.sign(
      { sub: String(recruiterBId), email: 'recruiterB@corp-b.com', role: 'recruiter' },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: '1h' },
    );

    candidateToken = jwt.sign(
      { sub: String(candidateId), email: 'candidate@example.com', role: 'user' },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: '1h' },
    );

    // Enterprises
    await Enterprise.create([
      {
        _id: enterpriseAId,
        name: 'Enterprise Alpha',
        tax_code: `TAX-A-${Date.now()}`,
        email: 'alpha@example.test',
        phone: '+84900000001',
        industry: 'IT',
        company_size: '11-50',
        address: { street: '1 Alpha St', city: 'Hà Nội', country: 'Vietnam' },
        status: 'active',
        creator_account_id: recruiterAId,
        is_deleted: false,
      },
      {
        _id: enterpriseBId,
        name: 'Enterprise Beta',
        tax_code: `TAX-B-${Date.now()}`,
        email: 'beta@example.test',
        phone: '+84900000002',
        industry: 'IT',
        company_size: '11-50',
        address: { street: '2 Beta St', city: 'TP.HCM', country: 'Vietnam' },
        status: 'active',
        creator_account_id: recruiterBId,
        is_deleted: false,
      },
    ]);

    // Users
    await User.create([
      {
        _id: recruiterAId,
        email: 'recruiterA@corp-a.com',
        username: `recruiterA_${Date.now()}`,
        role: 'recruiter',
        status: 'active',
        enterprise_id: enterpriseAId,
      },
      {
        _id: recruiterBId,
        email: 'recruiterB@corp-b.com',
        username: `recruiterB_${Date.now()}`,
        role: 'recruiter',
        status: 'active',
        enterprise_id: enterpriseBId,
      },
      {
        _id: candidateId,
        email: 'le.van.c@example.test',
        username: `cand_c_${Date.now()}`,
        full_name: 'Lê Văn C',
        phone: '0988123456',
        role: 'user',
        status: 'active',
      },
      {
        _id: candidate2Id,
        email: 'tran.thi.d@example.test',
        username: `cand_d_${Date.now()}`,
        full_name: 'Trần Thị D',
        phone: '0977654321',
        role: 'user',
        status: 'active',
      },
    ]);

    // Job Postings
    const jobA1 = await JobPosting.create({
      enterprise_id: enterpriseAId,
      posted_by_user_id: recruiterAId,
      title: 'Senior Backend Go Developer',
      slug: `senior-backend-go-${Date.now()}`,
      status: 'published',
      location: 'Hà Nội',
      employment_type: 'Full-time',
    });
    jobA1Id = jobA1._id;

    const jobA2 = await JobPosting.create({
      enterprise_id: enterpriseAId,
      posted_by_user_id: recruiterAId,
      title: 'Frontend React Lead',
      slug: `frontend-react-lead-${Date.now()}`,
      status: 'published',
      location: 'Remote',
      employment_type: 'Full-time',
    });
    jobA2Id = jobA2._id;

    const jobB = await JobPosting.create({
      enterprise_id: enterpriseBId,
      posted_by_user_id: recruiterBId,
      title: 'DevOps Engineer Beta',
      slug: `devops-beta-${Date.now()}`,
      status: 'published',
      location: 'TP.HCM',
      employment_type: 'Full-time',
    });
    jobBId = jobB._id;

    // Documents
    const cvDoc = await Document.create({
      owner_id: candidateId,
      type: 'cv',
      file_url: 'https://example.test/cv.pdf',
      storage_key: `key-cv-${Date.now()}`,
      file_name: 'cv.pdf',
      mime_type: 'application/pdf',
      size: 1024,
    });
    cvDocId = cvDoc._id;

    const coverDoc = await Document.create({
      owner_id: candidateId,
      type: 'cover_letter',
      file_url: 'https://example.test/cover.pdf',
      storage_key: `key-cover-${Date.now()}`,
      file_name: 'cover.pdf',
      mime_type: 'application/pdf',
      size: 512,
    });
    coverLetterDocId = coverDoc._id;

    // Applications
    const appA1 = await Application.create({
      job_id: jobA1Id,
      applicant_id: candidateId,
      cv_id: cvDocId,
      cover_letter_id: coverLetterDocId,
      status: 'interviewing',
      status_history: [
        {
          status: 'submitted',
          changed_at: new Date('2026-06-01T08:00:00.000Z'),
          changed_by: candidateId,
        },
        {
          status: 'under_review',
          changed_at: new Date('2026-06-02T09:00:00.000Z'),
          changed_by: recruiterAId,
        },
        {
          status: 'interviewing',
          changed_at: new Date('2026-06-03T10:00:00.000Z'),
          changed_by: recruiterAId,
        },
      ],
      notes: [
        {
          author_id: recruiterAId,
          author_name: 'Recruiter A',
          content: 'Passed preliminary screening.',
          created_at: new Date(),
        },
      ],
    });
    appA1Id = appA1._id;

    // Next interview for appA1
    await Interview.create({
      enterprise_id: enterpriseAId,
      application_id: appA1Id,
      job_id: jobA1Id,
      applicant_id: candidateId,
      interviewer_ids: [recruiterAId],
      created_by: recruiterAId,
      scheduled_at: new Date(Date.now() + 86400000 * 3), // +3 days
      ends_at: new Date(Date.now() + 86400000 * 3 + 3600000),
      duration_minutes: 60,
      mode: 'online',
      status: 'scheduled',
      status_history: [
        {
          status: 'scheduled',
          changed_at: new Date(),
          changed_by: recruiterAId,
        },
      ],
    });

    const appA2 = await Application.create({
      job_id: jobA2Id,
      applicant_id: candidate2Id,
      cv_id: cvDocId,
      status: 'submitted',
      status_history: [
        {
          status: 'submitted',
          changed_at: new Date('2026-06-10T08:00:00.000Z'),
          changed_by: candidate2Id,
        },
      ],
    });
    appA2Id = appA2._id;

    const appB = await Application.create({
      job_id: jobBId,
      applicant_id: candidateId,
      cv_id: cvDocId,
      status: 'offered',
      status_history: [
        {
          status: 'submitted',
          changed_at: new Date('2026-06-15T08:00:00.000Z'),
          changed_by: candidateId,
        },
      ],
    });
    appBId = appB._id;
  });

  afterAll(async () => {
    await Promise.all([
      Application.deleteMany({ _id: { $in: [appA1Id, appA2Id, appBId] } }),
      JobPosting.deleteMany({ _id: { $in: [jobA1Id, jobA2Id, jobBId] } }),
      User.deleteMany({ _id: { $in: [recruiterAId, recruiterBId, candidateId, candidate2Id] } }),
      Enterprise.deleteMany({ _id: { $in: [enterpriseAId, enterpriseBId] } }),
      Interview.deleteMany({ application_id: appA1Id }),
      Document.deleteMany({ _id: { $in: [cvDocId, coverLetterDocId] } }),
    ]);

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await disconnectDatabase();
  });

  describe('Authentication & Authorization', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const response = await fetch(`${baseUrl}/api/v1/recruiter/applications`);
      expect(response.status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
    });

    it('rejects candidate role with 403', async () => {
      const response = await fetch(`${baseUrl}/api/v1/recruiter/applications`, {
        headers: { Authorization: `Bearer ${candidateToken}` },
      });
      expect(response.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    });
  });

  describe('Data Scope Isolation (BR-06)', () => {
    it('returns only applications belonging to the caller enterprise', async () => {
      const response = await fetch(`${baseUrl}/api/v1/recruiter/applications`, {
        headers: { Authorization: `Bearer ${recruiterAToken}` },
      });

      expect(response.status).toBe(HTTP_STATUS.HTTP_200_OK);
      const data = (await response.json()) as RecruiterApplicationListResponse;
      expect(data.total).toBe(2);
      const appIds = data.items.map((i: { id: string }) => i.id);
      expect(appIds).toContain(String(appA1Id));
      expect(appIds).toContain(String(appA2Id));
      expect(appIds).not.toContain(String(appBId));

      // Verifies enterprise status counts
      expect(data.statusCounts.interviewing).toBe(1);
      expect(data.statusCounts.submitted).toBe(1);
      expect(data.statusCounts.offered).toBe(0);
    });

    it('returns only enterprise B applications for recruiter B', async () => {
      const response = await fetch(`${baseUrl}/api/v1/recruiter/applications`, {
        headers: { Authorization: `Bearer ${recruiterBToken}` },
      });

      expect(response.status).toBe(HTTP_STATUS.HTTP_200_OK);
      const data = (await response.json()) as RecruiterApplicationListResponse;
      expect(data.total).toBe(1);
      expect(data.items[0]?.id).toBe(String(appBId));
      expect(data.statusCounts.offered).toBe(1);
    });

    it('returns empty result set when filtering for a foreign company job (UC-S2-AA-06.EX3)', async () => {
      const response = await fetch(
        `${baseUrl}/api/v1/recruiter/applications?jobId=${jobBId}`,
        {
          headers: { Authorization: `Bearer ${recruiterAToken}` },
        },
      );

      expect(response.status).toBe(HTTP_STATUS.HTTP_200_OK);
      const data = (await response.json()) as RecruiterApplicationListResponse;
      expect(data.total).toBe(0);
      expect(data.items).toEqual([]);
      expect(data.statusCounts.submitted).toBe(0);
    });
  });

  describe('Filters and Keyword Search (UC-S2-AA-05, UC-S2-AA-06)', () => {
    it('filters applications by status', async () => {
      const response = await fetch(
        `${baseUrl}/api/v1/recruiter/applications?status=interviewing`,
        {
          headers: { Authorization: `Bearer ${recruiterAToken}` },
        },
      );

      expect(response.status).toBe(HTTP_STATUS.HTTP_200_OK);
      const data = (await response.json()) as RecruiterApplicationListResponse;
      expect(data.total).toBe(1);
      expect(data.items[0]?.id).toBe(String(appA1Id));
      expect(data.items[0]?.status).toBe('interviewing');
    });

    it('filters applications by documentType (cover_letter)', async () => {
      const response = await fetch(
        `${baseUrl}/api/v1/recruiter/applications?documentType=cover_letter`,
        {
          headers: { Authorization: `Bearer ${recruiterAToken}` },
        },
      );

      expect(response.status).toBe(HTTP_STATUS.HTTP_200_OK);
      const data = (await response.json()) as RecruiterApplicationListResponse;
      expect(data.total).toBe(1);
      expect(data.items[0]?.id).toBe(String(appA1Id));
      expect(data.items[0]?.submittedDocuments).toEqual(['cv', 'cover_letter']);
    });

    it('searches applications by applicant full name keyword', async () => {
      const response = await fetch(
        `${baseUrl}/api/v1/recruiter/applications?search=Lê+Văn+C`,
        {
          headers: { Authorization: `Bearer ${recruiterAToken}` },
        },
      );

      expect(response.status).toBe(HTTP_STATUS.HTTP_200_OK);
      const data = (await response.json()) as RecruiterApplicationListResponse;
      expect(data.total).toBe(1);
      expect(data.items[0]?.applicant.fullName).toBe('Lê Văn C');
    });

    it('searches applications by job title keyword', async () => {
      const response = await fetch(
        `${baseUrl}/api/v1/recruiter/applications?search=Backend`,
        {
          headers: { Authorization: `Bearer ${recruiterAToken}` },
        },
      );

      expect(response.status).toBe(HTTP_STATUS.HTTP_200_OK);
      const data = (await response.json()) as RecruiterApplicationListResponse;
      expect(data.total).toBe(1);
      expect(data.items[0]?.job.title).toBe('Senior Backend Go Developer');
    });

    it('includes upcoming interview details and notes count on item', async () => {
      const response = await fetch(
        `${baseUrl}/api/v1/recruiter/applications?status=interviewing`,
        {
          headers: { Authorization: `Bearer ${recruiterAToken}` },
        },
      );

      expect(response.status).toBe(HTTP_STATUS.HTTP_200_OK);
      const data = (await response.json()) as RecruiterApplicationListResponse;
      const item = data.items[0]!;
      expect(item.notesCount).toBe(1);
      expect(item.nextInterview).not.toBeNull();
      expect(item.nextInterview?.mode).toBe('online');
      expect(item.nextInterview?.scheduledAt).toBeDefined();
    });
  });
});
