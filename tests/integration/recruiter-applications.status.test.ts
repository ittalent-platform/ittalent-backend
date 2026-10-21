import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';

import { app } from '../../src/app.js';
import { connectDatabase } from '../../src/config/db.js';
import { Application } from '../../src/models/application.model.js';
import { Enterprise } from '../../src/models/enterprise.model.js';
import { Interview } from '../../src/models/interview.model.js';
import { JobPosting } from '../../src/models/job-posting.model.js';
import { User } from '../../src/models/user.model.js';
import { HTTP_STATUS } from '../../src/shared/constants/http-status.js';
import type { RecruiterApplicationDetailDTO } from '../../src/modules/applications/recruiter-applications.schemas.js';

describe('Recruiter Applications Status Transitions API (integration: UC-S2-AA-03)', () => {
  let server: Server;
  let baseUrl: string;

  const enterpriseAId = new Types.ObjectId();
  const enterpriseBId = new Types.ObjectId();

  const recruiterAId = new Types.ObjectId();
  const recruiterBId = new Types.ObjectId();
  const recruiterUnassignedId = new Types.ObjectId();
  const candidateId = new Types.ObjectId();

  let recruiterAToken: string;
  let recruiterBToken: string;
  let recruiterUnassignedToken: string;
  let candidateToken: string;

  let jobAId: Types.ObjectId;
  let jobBId: Types.ObjectId;
  let jobLimitedId: Types.ObjectId;

  let appAId: Types.ObjectId;
  let appBId: Types.ObjectId;
  let appLimited1Id: Types.ObjectId;
  let appLimited2Id: Types.ObjectId;

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
        name: 'Enterprise Status Corp A',
        tax_code: `TAX-SA-${Date.now()}`,
        email: 'statusA@corp.test',
        phone: '+84900000050',
        industry: 'Tech',
        company_size: '51-200',
        address: { street: '500 Tech Road', city: 'Hà Nội', country: 'Vietnam' },
        status: 'active',
        creator_account_id: recruiterAId,
        is_deleted: false,
      },
      {
        _id: enterpriseBId,
        name: 'Enterprise Status Corp B',
        tax_code: `TAX-SB-${Date.now()}`,
        email: 'statusB@corp.test',
        phone: '+84900000060',
        industry: 'Finance',
        company_size: '11-50',
        address: { street: '600 Finance Ave', city: 'TP.HCM', country: 'Vietnam' },
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
        username: `recruiterStatusA_${Date.now()}`,
        full_name: 'Lead Recruiter Alpha',
        role: 'recruiter' as const,
        status: 'active' as const,
        enterprise_id: enterpriseAId,
      },
      {
        _id: recruiterBId,
        email: 'recruiterB@company-b.test',
        username: `recruiterStatusB_${Date.now()}`,
        full_name: 'Lead Recruiter Beta',
        role: 'recruiter' as const,
        status: 'active' as const,
        enterprise_id: enterpriseBId,
      },
      {
        _id: recruiterUnassignedId,
        email: 'recruiterNoEnt@test.com',
        username: `recruiterStatusNoEnt_${Date.now()}`,
        role: 'recruiter' as const,
        status: 'active' as const,
        enterprise_id: null,
      },
      {
        _id: candidateId,
        email: 'candidate@example.com',
        username: `candStatus_${Date.now()}`,
        full_name: 'Candidate Status Test',
        role: 'user' as const,
        status: 'active' as const,
      },
    ]);

    // Job Postings
    const jobA = await JobPosting.create({
      enterprise_id: enterpriseAId,
      posted_by_user_id: recruiterAId,
      title: 'Senior Backend Engineer',
      slug: `senior-backend-status-${Date.now()}`,
      status: 'published',
      location: 'Hà Nội',
      employment_type: 'Full-time',
      openings: 5,
    });
    jobAId = jobA._id;

    const jobB = await JobPosting.create({
      enterprise_id: enterpriseBId,
      posted_by_user_id: recruiterBId,
      title: 'DevOps Engineer (Beta)',
      slug: `devops-beta-${Date.now()}`,
      status: 'published',
      location: 'TP.HCM',
      employment_type: 'Full-time',
      openings: 2,
    });
    jobBId = jobB._id;

    const jobLimited = await JobPosting.create({
      enterprise_id: enterpriseAId,
      posted_by_user_id: recruiterAId,
      title: 'Lead Architect (1 opening)',
      slug: `lead-architect-${Date.now()}`,
      status: 'published',
      location: 'Hà Nội',
      employment_type: 'Full-time',
      openings: 1,
    });
    jobLimitedId = jobLimited._id;

    // Applications
    const appA = await Application.create({
      job_id: jobAId,
      applicant_id: candidateId,
      cv_id: new Types.ObjectId(),
      status: 'submitted',
      message: 'Cover message for Alpha',
      status_history: [
        {
          status: 'submitted',
          changed_at: new Date('2026-10-01T08:00:00.000Z'),
          changed_by: candidateId,
        },
      ],
    });
    appAId = appA._id;

    const appB = await Application.create({
      job_id: jobBId,
      applicant_id: candidateId,
      cv_id: new Types.ObjectId(),
      status: 'submitted',
      status_history: [
        {
          status: 'submitted',
          changed_at: new Date('2026-10-02T08:00:00.000Z'),
          changed_by: candidateId,
        },
      ],
    });
    appBId = appB._id;

    const appLim1 = await Application.create({
      job_id: jobLimitedId,
      applicant_id: candidateId,
      cv_id: new Types.ObjectId(),
      status: 'submitted',
      status_history: [
        {
          status: 'submitted',
          changed_at: new Date('2026-10-03T08:00:00.000Z'),
          changed_by: candidateId,
        },
      ],
    });
    appLimited1Id = appLim1._id;

    const appLim2 = await Application.create({
      job_id: jobLimitedId,
      applicant_id: new Types.ObjectId(),
      cv_id: new Types.ObjectId(),
      status: 'submitted',
      status_history: [
        {
          status: 'submitted',
          changed_at: new Date('2026-10-03T08:05:00.000Z'),
          changed_by: candidateId,
        },
      ],
    });
    appLimited2Id = appLim2._id;
  });

  afterAll(async () => {
    await Promise.all([
      Application.deleteMany({
        _id: { $in: [appAId, appBId, appLimited1Id, appLimited2Id] },
      }),
      JobPosting.deleteMany({ _id: { $in: [jobAId, jobBId, jobLimitedId] } }),
      User.deleteMany({
        _id: { $in: [recruiterAId, recruiterBId, recruiterUnassignedId, candidateId] },
      }),
      Enterprise.deleteMany({ _id: { $in: [enterpriseAId, enterpriseBId] } }),
      Interview.deleteMany({
        application_id: { $in: [appAId, appLimited1Id] },
      }),
    ]);

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('Authentication & Authorization', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appAId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'under_review' }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
    });

    it('returns 403 when candidate token is used', async () => {
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appAId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${candidateToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'under_review' }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    });

    it('returns 403 when recruiter has no active enterprise assignment', async () => {
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appAId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${recruiterUnassignedToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'under_review' }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    });
  });

  describe('Multi-tenant Isolation & Opaque 404 (BR-06)', () => {
    it('returns 404 when accessing an application belonging to another enterprise', async () => {
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appBId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${recruiterAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'under_review' }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
      const data = (await res.json()) as { message?: string };
      expect(data.message).toBe('Application not found');
    });

    it('returns 404 when application ID does not exist', async () => {
      const nonexistentId = new Types.ObjectId();
      const res = await fetch(
        `${baseUrl}/api/v1/recruiter/applications/${nonexistentId}/status`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${recruiterAToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'under_review' }),
        },
      );

      expect(res.status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
    });
  });

  describe('Input Validation & Transition Rules (BR-17, BR-37)', () => {
    it('returns 400 when malformed ObjectId is provided in path', async () => {
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/invalid-id/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${recruiterAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'under_review' }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    });

    it('returns 400 when invalid target status is provided', async () => {
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appAId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${recruiterAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'submitted' }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    });

    it('returns 400 when attempting an invalid skip transition (submitted -> hired)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appAId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${recruiterAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'hired' }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
      const data = (await res.json()) as { message?: string };
      expect(data.message).toContain('Allowed next statuses from \'submitted\' are: under_review, rejected');
    });

    it('returns 400 when rejectionReason is provided but shorter than 5 characters', async () => {
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appAId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${recruiterAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'rejected', rejectionReason: 'bad' }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    });

    it('returns 400 when transitioning to interviewing without a scheduled interview (BR-37)', async () => {
      // First move appA to under_review
      const advanceRes = await fetch(
        `${baseUrl}/api/v1/recruiter/applications/${appAId}/status`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${recruiterAToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'under_review' }),
        },
      );
      expect(advanceRes.status).toBe(HTTP_STATUS.HTTP_200_OK);

      // Now attempt to jump to interviewing without scheduling any interview
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appAId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${recruiterAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'interviewing' }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
      const data = (await res.json()) as { message?: string };
      expect(data.message).toBe('An active interview must be scheduled before transitioning to interviewing');
    });

    it('returns 400 when transitioning to offered without a completed interview (BR-37)', async () => {
      // Create a scheduled interview for appA
      const scheduledInterview = await Interview.create({
        enterprise_id: enterpriseAId,
        application_id: appAId,
        job_id: jobAId,
        applicant_id: candidateId,
        interviewer_ids: [recruiterAId],
        created_by: recruiterAId,
        scheduled_at: new Date('2026-10-15T10:00:00.000Z'),
        ends_at: new Date('2026-10-15T11:00:00.000Z'),
        duration_minutes: 60,
        mode: 'online',
        status: 'scheduled',
      });

      // Now move to interviewing - should succeed
      const toInterviewingRes = await fetch(
        `${baseUrl}/api/v1/recruiter/applications/${appAId}/status`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${recruiterAToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'interviewing' }),
        },
      );
      expect(toInterviewingRes.status).toBe(HTTP_STATUS.HTTP_200_OK);

      // Attempt to move to offered with only a 'scheduled' interview (not 'completed')
      const toOfferedRes = await fetch(
        `${baseUrl}/api/v1/recruiter/applications/${appAId}/status`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${recruiterAToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'offered' }),
        },
      );
      expect(toOfferedRes.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
      const data = (await toOfferedRes.json()) as { message?: string };
      expect(data.message).toBe('At least one interview must be completed before making an offer');

      // Clean up interview for next tests
      await Interview.deleteOne({ _id: scheduledInterview._id });
    });
  });

  describe('Happy Path Status Progression & Terminal State Protection (BR-17, BR-24)', () => {
    it('progresses through interviewing -> offered -> hired with valid interview states', async () => {
      // Mark an interview completed for appA
      await Interview.create({
        enterprise_id: enterpriseAId,
        application_id: appAId,
        job_id: jobAId,
        applicant_id: candidateId,
        interviewer_ids: [recruiterAId],
        created_by: recruiterAId,
        scheduled_at: new Date('2026-10-10T10:00:00.000Z'),
        ends_at: new Date('2026-10-10T11:00:00.000Z'),
        duration_minutes: 60,
        mode: 'online',
        status: 'completed',
      });

      // Move to offered
      const offerRes = await fetch(
        `${baseUrl}/api/v1/recruiter/applications/${appAId}/status`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${recruiterAToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'offered',
            note: 'Formal offer sent to candidate',
            messageToCandidate: 'Congratulations! We are delighted to extend an offer.',
          }),
        },
      );

      expect(offerRes.status).toBe(HTTP_STATUS.HTTP_200_OK);
      const offerData = (await offerRes.json()) as RecruiterApplicationDetailDTO;
      expect(offerData.status).toBe('offered');
      const latestOfferHistory = offerData.statusHistory.at(-1);
      expect(latestOfferHistory?.status).toBe('offered');
      expect(latestOfferHistory?.note).toBe('Formal offer sent to candidate');
      expect(latestOfferHistory?.messageToCandidate).toBe(
        'Congratulations! We are delighted to extend an offer.',
      );

      // Move to hired
      const hireRes = await fetch(
        `${baseUrl}/api/v1/recruiter/applications/${appAId}/status`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${recruiterAToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'hired',
            note: 'Contract signed and onboarding scheduled',
          }),
        },
      );

      expect(hireRes.status).toBe(HTTP_STATUS.HTTP_200_OK);
      const hireData = (await hireRes.json()) as RecruiterApplicationDetailDTO;
      expect(hireData.status).toBe('hired');

      // Verify hired state cannot be mutated anymore (terminal state protection)
      const mutateTerminalRes = await fetch(
        `${baseUrl}/api/v1/recruiter/applications/${appAId}/status`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${recruiterAToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'rejected' }),
        },
      );
      expect(mutateTerminalRes.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    });

    it('rejects candidate and logs rejection reason in audit history', async () => {
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appBId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${recruiterBToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'rejected',
          rejectionReason: 'Candidate salary expectations exceed senior band budget',
          messageToCandidate: 'Thank you for your time, but we decided not to move forward.',
        }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
      const data = (await res.json()) as RecruiterApplicationDetailDTO;
      expect(data.status).toBe('rejected');
      const lastHistory = data.statusHistory.at(-1);
      expect(lastHistory?.status).toBe('rejected');
      expect(lastHistory?.rejectionReason).toBe(
        'Candidate salary expectations exceed senior band budget',
      );
      expect(lastHistory?.messageToCandidate).toBe(
        'Thank you for your time, but we decided not to move forward.',
      );
    });
  });

  describe('Vacancy Limit Check & Auto-Close Cascade (BR-18, EX5)', () => {
    it('auto-closes job posting and cascades position_filled to other applications when opening is filled', async () => {
      // Setup: jobLimited has openings: 1.
      // appLimited1 will be moved through to hired.
      // appLimited2 is also submitted for the same job.
      await Interview.create({
        enterprise_id: enterpriseAId,
        application_id: appLimited1Id,
        job_id: jobLimitedId,
        applicant_id: candidateId,
        interviewer_ids: [recruiterAId],
        created_by: recruiterAId,
        scheduled_at: new Date('2026-10-10T10:00:00.000Z'),
        ends_at: new Date('2026-10-10T11:00:00.000Z'),
        duration_minutes: 60,
        mode: 'online',
        status: 'completed',
      });

      // Move appLimited1 to under_review -> interviewing -> offered -> hired
      const r1 = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appLimited1Id}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${recruiterAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'under_review' }),
      });
      expect(r1.status).toBe(HTTP_STATUS.HTTP_200_OK);

      const r2 = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appLimited1Id}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${recruiterAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'interviewing' }),
      });
      expect(r2.status).toBe(HTTP_STATUS.HTTP_200_OK);

      const r3 = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appLimited1Id}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${recruiterAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'offered' }),
      });
      expect(r3.status).toBe(HTTP_STATUS.HTTP_200_OK);

      // Hiring appLimited1 fills the 1 opening!
      const hireRes = await fetch(
        `${baseUrl}/api/v1/recruiter/applications/${appLimited1Id}/status`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${recruiterAToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'hired', note: 'Hired top candidate' }),
        },
      );
      expect(hireRes.status).toBe(HTTP_STATUS.HTTP_200_OK);

      // Verify the job posting was auto-closed
      const updatedJob = await JobPosting.findById(jobLimitedId);
      expect(updatedJob?.status).toBe('closed');

      // Verify appLimited2 was automatically cascaded to position_filled
      const cascadedApp = await Application.findById(appLimited2Id);
      expect(cascadedApp?.status).toBe('position_filled');
      const cascadedHistory = cascadedApp?.status_history.at(-1);
      expect(cascadedHistory?.status).toBe('position_filled');
      expect(cascadedHistory?.note).toContain('Position filled');
    });

    it('returns 409 Conflict when attempting to hire into a fully filled job opening (EX5)', async () => {
      // Create a new application for jobLimited
      const extraApp = await Application.create({
        job_id: jobLimitedId,
        applicant_id: new Types.ObjectId(),
        cv_id: new Types.ObjectId(),
        status: 'offered',
        status_history: [
          {
            status: 'offered',
            changed_at: new Date(),
            changed_by: recruiterAId,
          },
        ],
      });

      try {
        const res = await fetch(
          `${baseUrl}/api/v1/recruiter/applications/${extraApp._id}/status`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${recruiterAToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: 'hired' }),
          },
        );

        expect(res.status).toBe(HTTP_STATUS.HTTP_409_CONFLICT);
        const data = (await res.json()) as { message?: string };
        expect(data.message).toBe('All vacancies for this job posting have been filled');
      } finally {
        await Application.deleteOne({ _id: extraApp._id });
      }
    });
  });
});
