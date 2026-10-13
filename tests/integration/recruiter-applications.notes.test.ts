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
import type {
  RecruiterNoteEntryDTO,
  RecruiterNotesListResponse,
} from '../../src/modules/applications/recruiter-applications.schemas.js';

describe('Recruiter Applications Internal Notes API (integration: UC-S2-AA-03)', () => {
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

  let appAId: Types.ObjectId;
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
        name: 'Enterprise Notes Corp A',
        tax_code: `TAX-NA-${Date.now()}`,
        email: 'notesA@corp.test',
        phone: '+84900000030',
        industry: 'Tech',
        company_size: '51-200',
        address: { street: '300 Tech Road', city: 'Hà Nội', country: 'Vietnam' },
        status: 'active',
        creator_account_id: recruiterAId,
        is_deleted: false,
      },
      {
        _id: enterpriseBId,
        name: 'Enterprise Notes Corp B',
        tax_code: `TAX-NB-${Date.now()}`,
        email: 'notesB@corp.test',
        phone: '+84900000040',
        industry: 'Finance',
        company_size: '11-50',
        address: { street: '400 Finance Ave', city: 'TP.HCM', country: 'Vietnam' },
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
        username: `recruiterNotesA_${Date.now()}`,
        full_name: 'Lead Recruiter Alpha',
        role: 'recruiter' as const,
        status: 'active' as const,
        enterprise_id: enterpriseAId,
      },
      {
        _id: recruiterBId,
        email: 'recruiterB@company-b.test',
        username: `recruiterNotesB_${Date.now()}`,
        full_name: 'Lead Recruiter Beta',
        role: 'recruiter' as const,
        status: 'active' as const,
        enterprise_id: enterpriseBId,
      },
      {
        _id: recruiterUnassignedId,
        email: 'recruiterNoEnt@test.com',
        username: `recruiterNotesNoEnt_${Date.now()}`,
        role: 'recruiter' as const,
        status: 'active' as const,
        enterprise_id: null,
      },
      {
        _id: candidateId,
        email: 'candidate@example.com',
        username: `candNotes_${Date.now()}`,
        full_name: 'Candidate Notes Test',
        role: 'user' as const,
        status: 'active' as const,
      },
    ]);

    // Job Postings
    const jobA = await JobPosting.create({
      enterprise_id: enterpriseAId,
      posted_by_user_id: recruiterAId,
      title: 'Backend Engineer (Alpha)',
      slug: `backend-engineer-alpha-${Date.now()}`,
      status: 'published',
      location: 'Hà Nội',
      employment_type: 'Full-time',
    });
    jobAId = jobA._id;

    const jobB = await JobPosting.create({
      enterprise_id: enterpriseBId,
      posted_by_user_id: recruiterBId,
      title: 'Frontend Engineer (Beta)',
      slug: `frontend-engineer-beta-${Date.now()}`,
      status: 'published',
      location: 'TP.HCM',
      employment_type: 'Full-time',
    });
    jobBId = jobB._id;

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
      notes: [
        {
          author_id: recruiterAId,
          author_name: 'Lead Recruiter Alpha',
          content: 'Initial auto-note',
          created_at: new Date('2026-10-01T08:30:00.000Z'),
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
  });

  afterAll(async () => {
    await Promise.all([
      Application.deleteMany({ _id: { $in: [appAId, appBId] } }),
      JobPosting.deleteMany({ _id: { $in: [jobAId, jobBId] } }),
      User.deleteMany({
        _id: { $in: [recruiterAId, recruiterBId, recruiterUnassignedId, candidateId] },
      }),
      Enterprise.deleteMany({ _id: { $in: [enterpriseAId, enterpriseBId] } }),
    ]);

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('Authentication & Authorization', () => {
    it('returns 401 when no token is provided on POST /notes', async () => {
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appAId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Note without auth' }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
    });

    it('returns 401 when no token is provided on GET /notes', async () => {
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appAId}/notes`);

      expect(res.status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
    });

    it('returns 403 when candidate token is used on POST /notes', async () => {
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appAId}/notes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${candidateToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: 'Candidate tampering note' }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    });

    it('returns 403 when candidate token is used on GET /notes', async () => {
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appAId}/notes`, {
        headers: { Authorization: `Bearer ${candidateToken}` },
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    });

    it('returns 403 when recruiter has no assigned enterprise on POST /notes', async () => {
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appAId}/notes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${recruiterUnassignedToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: 'Unassigned recruiter note' }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
      const data = (await res.json()) as { message: string };
      expect(data.message).toBe('Active enterprise assignment required');
    });

    it('returns 403 when recruiter has no assigned enterprise on GET /notes', async () => {
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appAId}/notes`, {
        headers: { Authorization: `Bearer ${recruiterUnassignedToken}` },
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
      const data = (await res.json()) as { message: string };
      expect(data.message).toBe('Active enterprise assignment required');
    });
  });

  describe('Enterprise Isolation & Anti-Probing (BR-06)', () => {
    it('returns opaque 404 when application ID does not exist on POST /notes', async () => {
      const nonExistentId = new Types.ObjectId().toString();
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${nonExistentId}/notes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${recruiterAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: 'Note for missing application' }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
      const data = (await res.json()) as { message: string };
      expect(data.message).toBe('Application not found');
    });

    it('returns opaque 404 when application ID does not exist on GET /notes', async () => {
      const nonExistentId = new Types.ObjectId().toString();
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${nonExistentId}/notes`, {
        headers: { Authorization: `Bearer ${recruiterAToken}` },
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
      const data = (await res.json()) as { message: string };
      expect(data.message).toBe('Application not found');
    });

    it('returns opaque 404 when Recruiter B attempts to POST note to Application A', async () => {
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appAId}/notes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${recruiterBToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: 'Cross-tenant probe note' }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
      const data = (await res.json()) as { message: string };
      expect(data.message).toBe('Application not found');
    });

    it('returns opaque 404 when Recruiter B attempts to GET notes of Application A', async () => {
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appAId}/notes`, {
        headers: { Authorization: `Bearer ${recruiterBToken}` },
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
      const data = (await res.json()) as { message: string };
      expect(data.message).toBe('Application not found');
    });
  });

  describe('Validation & Edge Cases', () => {
    it('returns 400 when note content is empty string', async () => {
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appAId}/notes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${recruiterAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: '' }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    });

    it('returns 400 when note content is whitespace-only', async () => {
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appAId}/notes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${recruiterAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: '    ' }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    });

    it('returns 400 when note content exceeds 2000 characters', async () => {
      const overlyLongContent = 'A'.repeat(2001);
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appAId}/notes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${recruiterAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: overlyLongContent }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    });

    it('returns 400 when unexpected extra properties are provided', async () => {
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appAId}/notes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${recruiterAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: 'Valid note',
          authorName: 'Spoofed Author',
          authorId: new Types.ObjectId().toString(),
        }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    });

    it('returns 400 when application ID is malformed on POST', async () => {
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/invalid-id/notes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${recruiterAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: 'Valid note content' }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    });

    it('returns 400 when application ID is malformed on GET', async () => {
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/invalid-id/notes`, {
        headers: { Authorization: `Bearer ${recruiterAToken}` },
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    });
  });

  describe('Happy Path & End-to-End Workflow', () => {
    it('successfully appends note with 201 Created and secure author attribution', async () => {
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appAId}/notes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${recruiterAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: '  Candidate showed strong knowledge in distributed caching  ' }),
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_201_CREATED);
      const note = (await res.json()) as RecruiterNoteEntryDTO;

      expect(note.authorId).toBe(String(recruiterAId));
      expect(note.authorName).toBe('Lead Recruiter Alpha');
      expect(note.content).toBe('Candidate showed strong knowledge in distributed caching');
      expect(new Date(note.createdAt).getTime()).toBeGreaterThan(0);
    });

    it('lists all notes in chronological order with 200 OK', async () => {
      const res = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appAId}/notes`, {
        headers: { Authorization: `Bearer ${recruiterAToken}` },
      });

      expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
      const list = (await res.json()) as RecruiterNotesListResponse;

      expect(list.total).toBe(2);
      expect(list.items).toHaveLength(2);
      expect(list.items[0]?.content).toBe('Initial auto-note');
      expect(list.items[1]?.content).toBe('Candidate showed strong knowledge in distributed caching');
    });

    it('allows appending multiple notes concurrently and maintains all entries', async () => {
      const noteA = fetch(`${baseUrl}/api/v1/recruiter/applications/${appAId}/notes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${recruiterAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: 'Second feedback note' }),
      });

      const noteB = fetch(`${baseUrl}/api/v1/recruiter/applications/${appAId}/notes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${recruiterAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: 'Third feedback note' }),
      });

      const [resA, resB] = await Promise.all([noteA, noteB]);
      expect(resA.status).toBe(HTTP_STATUS.HTTP_201_CREATED);
      expect(resB.status).toBe(HTTP_STATUS.HTTP_201_CREATED);

      const listRes = await fetch(`${baseUrl}/api/v1/recruiter/applications/${appAId}/notes`, {
        headers: { Authorization: `Bearer ${recruiterAToken}` },
      });
      const list = (await listRes.json()) as RecruiterNotesListResponse;

      expect(list.total).toBe(4);
      expect(list.items.map((i) => i.content)).toEqual(
        expect.arrayContaining([
          'Initial auto-note',
          'Candidate showed strong knowledge in distributed caching',
          'Second feedback note',
          'Third feedback note',
        ]),
      );
    });
  });
});
