import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';

import { app } from '../../src/app.js';
import { connectDatabase } from '../../src/config/db.js';
import { Application } from '../../src/models/application.model.js';
import { Enterprise } from '../../src/models/enterprise.model.js';
import { JobPosting } from '../../src/models/job-posting.model.js';
import { User } from '../../src/models/user.model.js';
import { HTTP_STATUS } from '../../src/shared/constants/http-status.js';
import type { RecruiterApplicantCompanyHistoryResponse } from '../../src/modules/applications/recruiter-applications.schemas.js';

describe('Recruiter Applications Cross-Job Company History API (integration: UC-S2-AA-07)', () => {
  let server: Server;
  let baseUrl: string;

  const enterpriseAId = new Types.ObjectId();
  const enterpriseBId = new Types.ObjectId();

  const recruiterAId = new Types.ObjectId();
  const recruiterBId = new Types.ObjectId();
  const recruiterUnassignedId = new Types.ObjectId();
  const candidateId = new Types.ObjectId();
  const firstTimeCandidateId = new Types.ObjectId();

  let recruiterAToken: string;
  let recruiterBToken: string;
  let recruiterUnassignedToken: string;
  let candidateToken: string;

  let jobA1Id: Types.ObjectId;
  let jobA2Id: Types.ObjectId;
  let jobBId: Types.ObjectId;

  let appA1Id: Types.ObjectId;
  let appA2Id: Types.ObjectId;
  let appBId: Types.ObjectId;
  let appFirstTimeId: Types.ObjectId;

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
      { sub: String(recruiterAId), email: 'recruiterHistA@corp-a.test', role: 'recruiter' },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: '1h' },
    );

    recruiterBToken = jwt.sign(
      { sub: String(recruiterBId), email: 'recruiterHistB@corp-b.test', role: 'recruiter' },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: '1h' },
    );

    recruiterUnassignedToken = jwt.sign(
      { sub: String(recruiterUnassignedId), email: 'recruiterNoEntHist@test.com', role: 'recruiter' },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: '1h' },
    );

    candidateToken = jwt.sign(
      { sub: String(candidateId), email: 'candidateHist@example.com', role: 'user' },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: '1h' },
    );

    // Enterprises
    await Enterprise.create([
      {
        _id: enterpriseAId,
        name: 'Enterprise History Corp A',
        tax_code: `TAX-HA-${Date.now()}`,
        email: 'histA@corp.test',
        phone: '+84900000070',
        industry: 'Tech',
        company_size: '51-200',
        address: { street: '700 Tech Road', city: 'Hà Nội', country: 'Vietnam' },
        status: 'active',
        creator_account_id: recruiterAId,
        is_deleted: false,
      },
      {
        _id: enterpriseBId,
        name: 'Enterprise History Corp B',
        tax_code: `TAX-HB-${Date.now()}`,
        email: 'histB@corp.test',
        phone: '+84900000080',
        industry: 'Finance',
        company_size: '11-50',
        address: { street: '800 Finance Ave', city: 'TP.HCM', country: 'Vietnam' },
        status: 'active',
        creator_account_id: recruiterBId,
        is_deleted: false,
      },
    ]);

    // Users
    await User.create([
      {
        _id: recruiterAId,
        email: 'recruiterHistA@corp-a.test',
        username: `recruiterHistA_${Date.now()}`,
        full_name: 'Lead Recruiter Alpha',
        role: 'recruiter' as const,
        status: 'active' as const,
        enterprise_id: enterpriseAId,
      },
      {
        _id: recruiterBId,
        email: 'recruiterHistB@corp-b.test',
        username: `recruiterHistB_${Date.now()}`,
        full_name: 'Lead Recruiter Beta',
        role: 'recruiter' as const,
        status: 'active' as const,
        enterprise_id: enterpriseBId,
      },
      {
        _id: recruiterUnassignedId,
        email: 'recruiterNoEntHist@test.com',
        username: `recruiterNoEntHist_${Date.now()}`,
        role: 'recruiter' as const,
        status: 'active' as const,
        enterprise_id: null,
      },
      {
        _id: candidateId,
        email: 'candidateHist@example.com',
        username: `candHist_${Date.now()}`,
        full_name: 'Frequent Candidate',
        phone: '+84901234567',
        role: 'user' as const,
        status: 'active' as const,
      },
      {
        _id: firstTimeCandidateId,
        email: 'firstTimeHist@example.com',
        username: `candFirstTime_${Date.now()}`,
        full_name: 'First Time Candidate',
        phone: '+84909876543',
        role: 'user' as const,
        status: 'active' as const,
      },
    ]);

    // Job Postings
    const jobA1 = await JobPosting.create({
      enterprise_id: enterpriseAId,
      posted_by_user_id: recruiterAId,
      title: 'Senior Backend Engineer',
      slug: `backend-hist-${Date.now()}`,
      status: 'published',
      location: 'Hà Nội',
      employment_type: 'Full-time',
    });
    jobA1Id = jobA1._id;

    const jobA2 = await JobPosting.create({
      enterprise_id: enterpriseAId,
      posted_by_user_id: recruiterAId,
      title: 'Engineering Manager',
      slug: `manager-hist-${Date.now()}`,
      status: 'closed',
      location: 'Hà Nội',
      employment_type: 'Full-time',
    });
    jobA2Id = jobA2._id;

    const jobB = await JobPosting.create({
      enterprise_id: enterpriseBId,
      posted_by_user_id: recruiterBId,
      title: 'Security Specialist (Corp B)',
      slug: `security-b-${Date.now()}`,
      status: 'published',
      location: 'TP.HCM',
      employment_type: 'Full-time',
    });
    jobBId = jobB._id;

    // Applications for `candidateId`:
    // 1. Older application to Job A2 (Company A) that was rejected (created earlier)
    const appA2 = await Application.create({
      job_id: jobA2Id,
      applicant_id: candidateId,
      cv_id: new Types.ObjectId(),
      cover_letter_id: new Types.ObjectId(),
      status: 'rejected',
      status_history: [
        {
          status: 'submitted',
          changed_at: new Date('2026-08-01T08:00:00.000Z'),
          changed_by: candidateId,
        },
        {
          status: 'rejected',
          changed_at: new Date('2026-08-10T14:00:00.000Z'),
          changed_by: recruiterAId,
          rejection_reason: 'Requires minimum 8 years of managerial experience',
        },
      ],
    });
    appA2Id = appA2._id;

    // Small delay or explicit timestamp update to ensure deterministic createdAt ordering
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 2. Current application to Job A1 (Company A) (created later)
    const appA1 = await Application.create({
      job_id: jobA1Id,
      applicant_id: candidateId,
      cv_id: new Types.ObjectId(),
      status: 'interviewing',
      status_history: [
        {
          status: 'submitted',
          changed_at: new Date('2026-10-05T08:00:00.000Z'),
          changed_by: candidateId,
        },
        {
          status: 'interviewing',
          changed_at: new Date('2026-10-06T09:00:00.000Z'),
          changed_by: recruiterAId,
        },
      ],
      notes: [
        {
          author_id: recruiterAId,
          author_name: 'Lead Recruiter Alpha',
          content: 'Impressive system design answers',
          created_at: new Date('2026-10-06T10:00:00.000Z'),
        },
      ],
    });
    appA1Id = appA1._id;

    // 3. Application to Job B (Competitor Company B) by the same candidate
    const appB = await Application.create({
      job_id: jobBId,
      applicant_id: candidateId,
      cv_id: new Types.ObjectId(),
      status: 'hired',
      status_history: [
        {
          status: 'submitted',
          changed_at: new Date('2026-07-01T08:00:00.000Z'),
          changed_by: candidateId,
        },
        {
          status: 'hired',
          changed_at: new Date('2026-07-20T08:00:00.000Z'),
          changed_by: recruiterBId,
        },
      ],
    });
    appBId = appB._id;

    // 4. First-time candidate with only 1 application to Job A1
    const appFirst = await Application.create({
      job_id: jobA1Id,
      applicant_id: firstTimeCandidateId,
      cv_id: new Types.ObjectId(),
      status: 'submitted',
      status_history: [
        {
          status: 'submitted',
          changed_at: new Date('2026-10-10T08:00:00.000Z'),
          changed_by: firstTimeCandidateId,
        },
      ],
    });
    appFirstTimeId = appFirst._id;
  });

  afterAll(async () => {
    await Promise.all([
      Application.deleteMany({
        _id: { $in: [appA1Id, appA2Id, appBId, appFirstTimeId] },
      }),
      JobPosting.deleteMany({ _id: { $in: [jobA1Id, jobA2Id, jobBId] } }),
      User.deleteMany({
        _id: {
          $in: [
            recruiterAId,
            recruiterBId,
            recruiterUnassignedId,
            candidateId,
            firstTimeCandidateId,
          ],
        },
      }),
      Enterprise.deleteMany({ _id: { $in: [enterpriseAId, enterpriseBId] } }),
    ]);

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('Authentication & Authorization', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/recruiter/applications/${appA1Id}/company-history`,
      );
      expect(res.status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
    });

    it('returns 403 when candidate token is used', async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/recruiter/applications/${appA1Id}/company-history`,
        {
          headers: { Authorization: `Bearer ${candidateToken}` },
        },
      );
      expect(res.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    });

    it('returns 403 when recruiter has no active enterprise assignment', async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/recruiter/applications/${appA1Id}/company-history`,
        {
          headers: { Authorization: `Bearer ${recruiterUnassignedToken}` },
        },
      );
      expect(res.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    });
  });

  describe('Multi-Tenant Boundary Isolation & Opaque 404 (BR-06, EX2)', () => {
    it('returns 404 when recruiter of company B attempts to view application history of company A', async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/recruiter/applications/${appA1Id}/company-history`,
        {
          headers: { Authorization: `Bearer ${recruiterBToken}` },
        },
      );
      expect(res.status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
      const data = (await res.json()) as { message?: string };
      expect(data.message).toBe('Application not found');
    });

    it('returns 404 when requesting an application belonging to another enterprise', async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/recruiter/applications/${appBId}/company-history`,
        {
          headers: { Authorization: `Bearer ${recruiterAToken}` },
        },
      );
      expect(res.status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
      const data = (await res.json()) as { message?: string };
      expect(data.message).toBe('Application not found');
    });

    it('returns 404 when application ID does not exist', async () => {
      const nonexistentId = new Types.ObjectId();
      const res = await fetch(
        `${baseUrl}/api/v1/recruiter/applications/${nonexistentId}/company-history`,
        {
          headers: { Authorization: `Bearer ${recruiterAToken}` },
        },
      );
      expect(res.status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
    });

    it('returns 400 when malformed ObjectId is provided in path', async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/recruiter/applications/invalid-id/company-history`,
        {
          headers: { Authorization: `Bearer ${recruiterAToken}` },
        },
      );
      expect(res.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    });
  });

  describe('Company History Retrieval & Cross-Company Data Privacy (UC-S2-AA-07)', () => {
    it('returns cross-job company submissions strictly scoped to caller enterprise', async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/recruiter/applications/${appA1Id}/company-history`,
        {
          headers: { Authorization: `Bearer ${recruiterAToken}` },
        },
      );

      expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
      const data = (await res.json()) as RecruiterApplicantCompanyHistoryResponse;

      expect(data.applicant.id).toBe(String(candidateId));
      expect(data.applicant.fullName).toBe('Frequent Candidate');
      expect(data.applicant.email).toBe('candidatehist@example.com');
      expect(data.applicant.phone).toBe('+84901234567');

      // Candidate applied to Job A1, Job A2 (Company A) and Job B (Company B).
      // Total submissions to Company A MUST be 2. Application to Company B MUST be omitted!
      expect(data.isFirstTimeApplicant).toBe(false);
      expect(data.totalSubmissionsToCompany).toBe(2);
      expect(data.items).toHaveLength(2);

      // Chronological descending order (A1 submitted Oct 5, A2 submitted Aug 1)
      const item1 = data.items[0];
      expect(item1?.id).toBe(String(appA1Id));
      expect(item1?.isCurrentApplication).toBe(true);
      expect(item1?.job.title).toBe('Senior Backend Engineer');
      expect(item1?.job.status).toBe('published');
      expect(item1?.status).toBe('interviewing');
      expect(item1?.reviewStage).toBe('interview');
      expect(item1?.notesCount).toBe(1);
      expect(item1?.submittedDocuments).toEqual(['cv']);

      const item2 = data.items[1];
      expect(item2?.id).toBe(String(appA2Id));
      expect(item2?.isCurrentApplication).toBe(false);
      expect(item2?.job.title).toBe('Engineering Manager');
      expect(item2?.job.status).toBe('closed');
      expect(item2?.status).toBe('rejected');
      expect(item2?.reviewStage).toBe('rejected');
      expect(item2?.rejectionReason).toBe(
        'Requires minimum 8 years of managerial experience',
      );
      expect(item2?.submittedDocuments).toEqual(['cv', 'cover_letter']);
      expect(item2?.notesCount).toBe(0);

      // Verify that Job B submission is nowhere in the returned items
      const hasJobB = data.items.some((item) => item.id === String(appBId));
      expect(hasJobB).toBe(false);
    });

    it('returns isFirstTimeApplicant: true for candidate with only 1 submission to enterprise (AC.1)', async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/recruiter/applications/${appFirstTimeId}/company-history`,
        {
          headers: { Authorization: `Bearer ${recruiterAToken}` },
        },
      );

      expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
      const data = (await res.json()) as RecruiterApplicantCompanyHistoryResponse;

      expect(data.applicant.email).toBe('firsttimehist@example.com');
      expect(data.isFirstTimeApplicant).toBe(true);
      expect(data.totalSubmissionsToCompany).toBe(1);
      expect(data.items).toHaveLength(1);
      expect(data.items[0]?.id).toBe(String(appFirstTimeId));
      expect(data.items[0]?.isCurrentApplication).toBe(true);
      expect(data.items[0]?.status).toBe('submitted');
      expect(data.items[0]?.reviewStage).toBeNull();
    });
  });
});
