import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

import { app } from '../../src/app.js';
import { connectDatabase } from '../../src/config/db.js';
import { Application } from '../../src/models/application.model.js';
import { Document } from '../../src/models/document.model.js';
import { Enterprise } from '../../src/models/enterprise.model.js';
import { Interview } from '../../src/models/interview.model.js';
import { JobPosting } from '../../src/models/job-posting.model.js';
import { User } from '../../src/models/user.model.js';
import { HTTP_STATUS } from '../../src/shared/constants/http-status.js';
import type {
  RecruiterApplicationCvMetadataDTO,
  RecruiterApplicationDetailDTO,
} from '../../src/modules/applications/recruiter-applications.schemas.js';

describe('Recruiter Applications Detail & CV Download API (integration: UC-S2-AA-02, 04)', () => {
  let server: Server;
  let baseUrl: string;
  const realFetch = globalThis.fetch;

  const enterpriseAId = new Types.ObjectId();
  const enterpriseBId = new Types.ObjectId();

  const recruiterAId = new Types.ObjectId();
  const recruiterBId = new Types.ObjectId();
  const recruiterUnassignedId = new Types.ObjectId();
  const candidateId = new Types.ObjectId();
  const candidateDeletedCvId = new Types.ObjectId();
  const candidateWithoutCvId = new Types.ObjectId();

  let recruiterAToken: string;
  let recruiterBToken: string;
  let recruiterUnassignedToken: string;
  let candidateToken: string;

  let jobAId: Types.ObjectId;
  let jobBId: Types.ObjectId;

  let cvDocAId: Types.ObjectId;
  let coverLetterDocAId: Types.ObjectId;
  let deletedCvDocId: Types.ObjectId;

  let appAId: Types.ObjectId;
  let appBId: Types.ObjectId;
  let appWithoutCvId: Types.ObjectId;
  let appWithDeletedCvId: Types.ObjectId;

  beforeAll(async () => {
    await connectDatabase();
    await Application.syncIndexes();

    vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('https://example.test/')) {
        return Promise.resolve(
          new Response('pdf-stream-bytes-for-recruiter', {
            status: 200,
            headers: { 'Content-Type': 'application/pdf', 'Content-Length': '30' },
          }),
        );
      }
      return realFetch(input, init);
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    recruiterAToken = jwt.sign(
      { sub: String(recruiterAId), email: 'recruiterA@company-a.test', role: 'recruiter' },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: '1h' },
    );

    recruiterBToken = jwt.sign(
      { sub: String(recruiterBId), email: 'recruiterB@company-b.test', role: 'recruiter' },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: '1h' },
    );

    recruiterUnassignedToken = jwt.sign(
      { sub: String(recruiterUnassignedId), email: 'recruiterNoEnt@test.com', role: 'recruiter' },
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
        name: 'Alpha Tech Corp',
        tax_code: `TAX-A-${Date.now()}`,
        email: 'alpha@corp.test',
        phone: '+84900000010',
        industry: 'Software',
        company_size: '51-200',
        address: { street: '100 Tech Blvd', city: 'Hà Nội', country: 'Vietnam' },
        status: 'active',
        creator_account_id: recruiterAId,
        is_deleted: false,
      },
      {
        _id: enterpriseBId,
        name: 'Beta Global Inc',
        tax_code: `TAX-B-${Date.now()}`,
        email: 'beta@corp.test',
        phone: '+84900000020',
        industry: 'Consulting',
        company_size: '11-50',
        address: { street: '200 Finance St', city: 'TP.HCM', country: 'Vietnam' },
        status: 'active',
        creator_account_id: recruiterBId,
        is_deleted: false,
      },
    ]);

    // Users
    await User.create([
      {
        _id: recruiterAId,
        email: 'recruiterA@company-a.test',
        username: `recruiterA_${Date.now()}`,
        full_name: 'Recruiter Lead Alpha',
        role: 'recruiter' as const,
        status: 'active' as const,
        enterprise_id: enterpriseAId,
      },
      {
        _id: recruiterBId,
        email: 'recruiterB@company-b.test',
        username: `recruiterB_${Date.now()}`,
        role: 'recruiter' as const,
        status: 'active' as const,
        enterprise_id: enterpriseBId,
      },
      {
        _id: recruiterUnassignedId,
        email: 'recruiterNoEnt@test.com',
        username: `recruiterNoEnt_${Date.now()}`,
        role: 'recruiter' as const,
        status: 'active' as const,
        enterprise_id: null,
      },
      {
        _id: candidateId,
        email: 'candidate@example.com',
        username: `cand_${Date.now()}`,
        full_name: 'Nguyễn Văn Detail',
        phone: '0909123456',
        role: 'user' as const,
        status: 'active' as const,
      },
      {
        _id: candidateDeletedCvId,
        email: 'candidate_del@example.com',
        username: `cand_del_${Date.now()}`,
        full_name: 'Candidate Deleted CV',
        phone: '0909000111',
        role: 'user' as const,
        status: 'active' as const,
      },
      {
        _id: candidateWithoutCvId,
        email: 'candidate_nocv@example.com',
        username: `cand_nocv_${Date.now()}`,
        full_name: 'Candidate No CV',
        phone: '0909000222',
        role: 'user' as const,
        status: 'active' as const,
      },
    ]);

    // Job Postings
    const jobA = await JobPosting.create({
      enterprise_id: enterpriseAId,
      posted_by_user_id: recruiterAId,
      title: 'Principal Software Engineer',
      slug: `principal-software-engineer-${Date.now()}`,
      status: 'published',
      location: 'Hà Nội',
      employment_type: 'Full-time',
    });
    jobAId = jobA._id;

    const jobB = await JobPosting.create({
      enterprise_id: enterpriseBId,
      posted_by_user_id: recruiterBId,
      title: 'Data Scientist Beta',
      slug: `data-scientist-beta-${Date.now()}`,
      status: 'published',
      location: 'TP.HCM',
      employment_type: 'Full-time',
    });
    jobBId = jobB._id;

    // Documents
    const cvDoc = await Document.create({
      owner_id: candidateId,
      type: 'cv',
      file_url: 'https://example.test/valid-cv.pdf',
      storage_key: `key-cv-valid-${Date.now()}`,
      file_name: 'NguyenVanDetail_CV.pdf',
      mime_type: 'application/pdf',
      size: 1048576,
    });
    cvDocAId = cvDoc._id;

    const coverDoc = await Document.create({
      owner_id: candidateId,
      type: 'cover_letter',
      file_url: 'https://example.test/valid-cover.pdf',
      storage_key: `key-cover-valid-${Date.now()}`,
      file_name: 'CoverLetter.pdf',
      mime_type: 'application/pdf',
      size: 524288,
    });
    coverLetterDocAId = coverDoc._id;

    const deletedCvDoc = await Document.create({
      owner_id: candidateDeletedCvId,
      type: 'cv',
      file_url: 'https://example.test/deleted-cv.pdf',
      storage_key: `key-cv-deleted-${Date.now()}`,
      file_name: 'Deleted_CV.pdf',
      mime_type: 'application/pdf',
      size: 20480,
      deleted_at: new Date(),
    });
    deletedCvDocId = deletedCvDoc._id;

    // Application A (Complete with CV, Cover Letter, Notes, History)
    const appA = await Application.create({
      job_id: jobAId,
      applicant_id: candidateId,
      cv_id: cvDocAId,
      cover_letter_id: coverLetterDocAId,
      status: 'under_review',
      message: 'Excited about the role at Alpha Tech!',
      status_history: [
        {
          status: 'submitted',
          changed_at: new Date('2026-10-01T08:00:00.000Z'),
          changed_by: candidateId,
          actor_role: 'candidate',
        },
        {
          status: 'under_review',
          changed_at: new Date('2026-10-02T09:00:00.000Z'),
          changed_by: recruiterAId,
          actor_role: 'recruiter',
          note: 'Passed initial screening checklist',
        },
      ],
      notes: [
        {
          author_id: recruiterAId,
          author_name: 'Recruiter Lead Alpha',
          content: 'Strong system design experience.',
          created_at: new Date('2026-10-02T10:00:00.000Z'),
        },
      ],
    });
    appAId = appA._id;

    // Interview for appA
    await Interview.create({
      enterprise_id: enterpriseAId,
      application_id: appAId,
      job_id: jobAId,
      applicant_id: candidateId,
      interviewer_ids: [recruiterAId],
      created_by: recruiterAId,
      scheduled_at: new Date('2026-10-20T14:00:00.000Z'),
      ends_at: new Date('2026-10-20T15:00:00.000Z'),
      duration_minutes: 60,
      mode: 'online',
      meeting_link: 'https://meet.google.com/alpha-interview',
      status: 'scheduled',
      notes: 'Initial technical interview',
      status_history: [
        {
          status: 'scheduled',
          changed_at: new Date('2026-10-02T11:00:00.000Z'),
          changed_by: recruiterAId,
        },
      ],
    });

    // Application B (Belongs to Enterprise B)
    const appB = await Application.create({
      job_id: jobBId,
      applicant_id: candidateId,
      cv_id: cvDocAId,
      status: 'submitted',
      status_history: [
        {
          status: 'submitted',
          changed_at: new Date('2026-10-05T08:00:00.000Z'),
          changed_by: candidateId,
        },
      ],
    });
    appBId = appB._id;

    // Application with deleted CV
    const appWithDeletedCv = await Application.create({
      job_id: jobAId,
      applicant_id: candidateDeletedCvId,
      cv_id: deletedCvDocId,
      status: 'submitted',
      status_history: [
        {
          status: 'submitted',
          changed_at: new Date('2026-10-06T08:00:00.000Z'),
          changed_by: candidateDeletedCvId,
        },
      ],
    });
    appWithDeletedCvId = appWithDeletedCv._id;

    // Application without CV (e.g. simulated missing cv reference)
    const appWithoutCv = await Application.create({
      job_id: jobAId,
      applicant_id: candidateWithoutCvId,
      cv_id: new Types.ObjectId(), // dangling reference
      status: 'submitted',
      status_history: [
        {
          status: 'submitted',
          changed_at: new Date('2026-10-07T08:00:00.000Z'),
          changed_by: candidateWithoutCvId,
        },
      ],
    });
    appWithoutCvId = appWithoutCv._id;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();

    await Promise.all([
      Application.deleteMany({
        _id: { $in: [appAId, appBId, appWithDeletedCvId, appWithoutCvId] },
      }),
      JobPosting.deleteMany({ _id: { $in: [jobAId, jobBId] } }),
      User.deleteMany({
        _id: {
          $in: [
            recruiterAId,
            recruiterBId,
            recruiterUnassignedId,
            candidateId,
            candidateDeletedCvId,
            candidateWithoutCvId,
          ],
        },
      }),
      Enterprise.deleteMany({ _id: { $in: [enterpriseAId, enterpriseBId] } }),
      Interview.deleteMany({ application_id: appAId }),
      Document.deleteMany({ _id: { $in: [cvDocAId, coverLetterDocAId, deletedCvDocId] } }),
    ]);

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('GET /api/v1/recruiter/applications/:id (UC-S2-AA-02: View Application Details)', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await realFetch(`${baseUrl}/api/v1/recruiter/applications/${String(appAId)}`);
      expect(res.status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
    });

    it('returns 403 when caller is a candidate user', async () => {
      const res = await realFetch(`${baseUrl}/api/v1/recruiter/applications/${String(appAId)}`, {
        headers: { Authorization: `Bearer ${candidateToken}` },
      });
      expect(res.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    });

    it('returns 403 when recruiter has no active enterprise assignment', async () => {
      const res = await realFetch(`${baseUrl}/api/v1/recruiter/applications/${String(appAId)}`, {
        headers: { Authorization: `Bearer ${recruiterUnassignedToken}` },
      });
      expect(res.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    });

    it('returns 400 when application ID parameter is malformed', async () => {
      const res = await realFetch(`${baseUrl}/api/v1/recruiter/applications/invalid-not-objectid`, {
        headers: { Authorization: `Bearer ${recruiterAToken}` },
      });
      expect(res.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    });

    it('returns opaque 404 when application ID does not exist', async () => {
      const nonExistentId = new Types.ObjectId().toString();
      const res = await realFetch(`${baseUrl}/api/v1/recruiter/applications/${nonExistentId}`, {
        headers: { Authorization: `Bearer ${recruiterAToken}` },
      });
      expect(res.status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
      const data = (await res.json()) as { message?: string };
      expect(data.message).toBe('Application not found');
    });

    it('returns opaque 404 when application belongs to another company job (BR-06 Anti-Probing)', async () => {
      // Recruiter A attempts to view Application B (Enterprise B's job posting)
      const res = await realFetch(`${baseUrl}/api/v1/recruiter/applications/${String(appBId)}`, {
        headers: { Authorization: `Bearer ${recruiterAToken}` },
      });
      expect(res.status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
      const data = (await res.json()) as { message?: string };
      expect(data.message).toBe('Application not found');
    });

    it('returns 200 OK with full hydrated application details for authorized recruiter', async () => {
      const res = await realFetch(`${baseUrl}/api/v1/recruiter/applications/${String(appAId)}`, {
        headers: { Authorization: `Bearer ${recruiterAToken}` },
      });
      expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);

      const body = (await res.json()) as RecruiterApplicationDetailDTO;

      expect(body.id).toBe(String(appAId));
      expect(body.status).toBe('under_review');
      expect(body.reviewStage).toBe('screening');
      expect(body.message).toBe('Excited about the role at Alpha Tech!');
      expect(body.version).toBe(2);

      // Job Snapshot
      expect(body.job.id).toBe(String(jobAId));
      expect(body.job.title).toBe('Principal Software Engineer');
      expect(body.job.location).toBe('Hà Nội');
      expect(body.job.employmentType).toBe('Full-time');
      expect(body.job.status).toBe('published');

      // Candidate Snapshot
      expect(body.applicant.id).toBe(String(candidateId));
      expect(body.applicant.fullName).toBe('Nguyễn Văn Detail');
      expect(body.applicant.email).toBe('candidate@example.com');
      expect(body.applicant.phone).toBe('0909123456');

      // Attachments (CV + Cover letter)
      expect(body.attachments).toHaveLength(2);
      const cvAttachment = body.attachments.find((att) => att.type === 'cv');
      expect(cvAttachment).toBeDefined();
      expect(cvAttachment?.fileName).toBe('NguyenVanDetail_CV.pdf');
      expect(cvAttachment?.mimeType).toBe('application/pdf');

      const clAttachment = body.attachments.find((att) => att.type === 'cover_letter');
      expect(clAttachment).toBeDefined();
      expect(clAttachment?.fileName).toBe('CoverLetter.pdf');

      // Interviews
      expect(body.interviews).toHaveLength(1);
      expect(body.interviews[0]?.mode).toBe('online');
      expect(body.interviews[0]?.meetingLink).toBe('https://meet.google.com/alpha-interview');
      expect(body.interviews[0]?.status).toBe('scheduled');

      // Recruiter Notes
      expect(body.notes).toHaveLength(1);
      expect(body.notes[0]?.authorName).toBe('Recruiter Lead Alpha');
      expect(body.notes[0]?.content).toBe('Strong system design experience.');

      // Status History
      expect(body.statusHistory).toHaveLength(2);
      expect(body.statusHistory[0]?.status).toBe('submitted');
      expect(body.statusHistory[1]?.status).toBe('under_review');
      expect(body.statusHistory[1]?.note).toBe('Passed initial screening checklist');
    });

    it('returns 200 OK when Recruiter B accesses Enterprise B application', async () => {
      const res = await realFetch(`${baseUrl}/api/v1/recruiter/applications/${String(appBId)}`, {
        headers: { Authorization: `Bearer ${recruiterBToken}` },
      });
      expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
      const body = (await res.json()) as RecruiterApplicationDetailDTO;
      expect(body.id).toBe(String(appBId));
      expect(body.job.id).toBe(String(jobBId));
      expect(body.status).toBe('submitted');
    });
  });

  describe('GET /api/v1/recruiter/applications/:id/cv (UC-S2-AA-04: Download Applicant CV)', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await realFetch(`${baseUrl}/api/v1/recruiter/applications/${String(appAId)}/cv`);
      expect(res.status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
    });

    it('returns 403 when caller is a candidate user', async () => {
      const res = await realFetch(`${baseUrl}/api/v1/recruiter/applications/${String(appAId)}/cv`, {
        headers: { Authorization: `Bearer ${candidateToken}` },
      });
      expect(res.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    });

    it('returns 400 when application ID parameter is malformed', async () => {
      const res = await realFetch(`${baseUrl}/api/v1/recruiter/applications/invalid-id/cv`, {
        headers: { Authorization: `Bearer ${recruiterAToken}` },
      });
      expect(res.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    });

    it('returns opaque 404 when application belongs to another company job', async () => {
      const res = await realFetch(`${baseUrl}/api/v1/recruiter/applications/${String(appBId)}/cv`, {
        headers: { Authorization: `Bearer ${recruiterAToken}` },
      });
      expect(res.status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
    });

    it('returns 404 when referenced CV document is deleted (BR-22)', async () => {
      const res = await realFetch(
        `${baseUrl}/api/v1/recruiter/applications/${String(appWithDeletedCvId)}/cv`,
        { headers: { Authorization: `Bearer ${recruiterAToken}` } },
      );
      expect(res.status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
      const data = (await res.json()) as { message?: string };
      expect(data.message).toBe('CV not found or has been removed');
    });

    it('returns 404 when referenced CV document does not exist', async () => {
      const res = await realFetch(
        `${baseUrl}/api/v1/recruiter/applications/${String(appWithoutCvId)}/cv`,
        { headers: { Authorization: `Bearer ${recruiterAToken}` } },
      );
      expect(res.status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
    });

    it('returns 200 OK with CV metadata when ?metadata=true is queried', async () => {
      const res = await realFetch(
        `${baseUrl}/api/v1/recruiter/applications/${String(appAId)}/cv?metadata=true`,
        { headers: { Authorization: `Bearer ${recruiterAToken}` } },
      );
      expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);

      const data = (await res.json()) as RecruiterApplicationCvMetadataDTO;
      expect(data.documentId).toBe(String(cvDocAId));
      expect(data.fileName).toBe('NguyenVanDetail_CV.pdf');
      expect(data.mimeType).toBe('application/pdf');
      expect(data.size).toBe(1048576);
      expect(data.fileUrl).toBe('https://example.test/valid-cv.pdf');
    });

    it('returns 200 OK streaming file with Content-Disposition attachment', async () => {
      const res = await realFetch(
        `${baseUrl}/api/v1/recruiter/applications/${String(appAId)}/cv`,
        { headers: { Authorization: `Bearer ${recruiterAToken}` } },
      );
      expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
      expect(res.headers.get('content-type')).toContain('application/pdf');
      expect(res.headers.get('content-disposition')).toContain('attachment');
      expect(res.headers.get('content-disposition')).toContain('NguyenVanDetail_CV.pdf');

      const bodyText = await res.text();
      expect(bodyText).toBe('pdf-stream-bytes-for-recruiter');
    });
  });
});
