import bcrypt from 'bcryptjs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { app } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/db.js';
import { disconnectRedis } from '../../src/config/redis.js';
import { Account } from '../../src/models/account.model.js';
import { Application } from '../../src/models/application.model.js';
import { Enterprise } from '../../src/models/enterprise.model.js';
import { JobPosting } from '../../src/models/job-posting.model.js';
import { JobPostingAuditEvent } from '../../src/models/job-posting-audit.model.js';
import { User, type UserDoc } from '../../src/models/user.model.js';
import { usersService } from '../../src/modules/users/users.service.js';
import { HTTP_STATUS } from '../../src/shared/constants/http-status.js';

type LoginResponse = { user: { id: string; role: string }; tokens: { accessToken: string } };
type JobResponse = {
  recruitmentStatus: string;
  applicationCount?: number;
  id: string;
  enterpriseId: string;
  enterprise: { id: string; name: string; logoUrl: string | null };
  postedByUserId: string;
  salaryNegotiable: boolean;
  status: string;
  title: string;
  location?: string;
  employmentType?: string;
  salaryMin?: number;
  salaryMax?: number;
  level?: string;
  description?: string;
  requirements?: string;
  benefits?: string;
  openings?: number;
  expiresAt?: string;
};
type OpenApiOperation = {
  parameters?: { in: string; name: string }[];
  requestBody?: { content: Record<string, { schema?: unknown }> };
  responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
};
type OpenApiDocument = {
  components: { schemas: Record<string, OpenApiSchema> };
  paths: Record<string, { delete?: OpenApiOperation; get?: OpenApiOperation; patch?: OpenApiOperation; post?: OpenApiOperation }>;
};
type OpenApiSchema = { properties?: Record<string, { nullable?: boolean }> };

const password = 'Password123!';
const validFields = {
  location: 'Ho Chi Minh City', employment_type: 'Full-time',
  description: 'Build reliable backend services for enterprise customers.', requirements: 'Node.js, TypeScript and MongoDB experience.', benefits: 'Flexible hours and private health cover.',
  published_at: new Date(), expires_at: new Date('2099-01-01T16:59:59.999Z'),
};
const validPayload = {
  title: 'Senior Backend Engineer', location: 'Ho Chi Minh City', employment_type: 'Full-time',
  description: 'Build reliable backend services for enterprise customers.', requirements: 'Node.js, TypeScript and MongoDB experience.', benefits: 'Flexible hours and private health cover.',
  expires_at: '2099-01-01', salary_min: 1000, salary_max: 2000,
};
let server: Server;
let baseUrl: string;
let recruiterA1: UserDoc;
let recruiterA2: UserDoc;
let recruiterB: UserDoc;
let recruiterWithoutEnterprise: UserDoc;
let admin: UserDoc;
let enterpriseAId: string;
let enterpriseBId: string;
let jobAId: string;
let jobBId: string;

async function createUser(email: string, username: string, role: 'admin' | 'recruiter'): Promise<UserDoc> {
  const user = await User.create({ email, username, role, status: 'active' });
  await Account.create({ user_id: user._id, provider: 'local', password_hash: await bcrypt.hash(password, 10) });
  return user;
}

async function login(email: string): Promise<LoginResponse> {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: email, password }),
  });
  expect(response.status).toBe(HTTP_STATUS.HTTP_200_OK);
  return response.json() as Promise<LoginResponse>;
}

function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

describe('Job posting enterprise ownership integration', () => {
  beforeAll(async () => {
    await connectDatabase();
    await Promise.all([Account.syncIndexes(), User.syncIndexes(), Enterprise.createIndexes(), JobPosting.syncIndexes(), Application.syncIndexes(), JobPostingAuditEvent.syncIndexes()]);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await Promise.all([Application.deleteMany({}), JobPosting.deleteMany({}), JobPostingAuditEvent.deleteMany({}), Enterprise.deleteMany({}), Account.deleteMany({}), User.deleteMany({})]);
    await disconnectRedis();
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await Promise.all([Application.deleteMany({}), JobPosting.deleteMany({}), JobPostingAuditEvent.deleteMany({}), Enterprise.deleteMany({}), Account.deleteMany({}), User.deleteMany({})]);
    recruiterA1 = await createUser('recruiter@gmail.com', 'recruiter_a1', 'recruiter');
    recruiterA2 = await createUser('recruiter-a2@integration.test', 'recruiter_a2', 'recruiter');
    recruiterB = await createUser('recruiter-b@integration.test', 'recruiter_b', 'recruiter');
    recruiterWithoutEnterprise = await createUser('recruiter-none@integration.test', 'recruiter_none', 'recruiter');
    admin = await createUser('admin@integration.test', 'integration_admin', 'admin');

    const enterpriseA = await Enterprise.create({
      name: 'Integration Enterprise A', tax_code: '9000000001', email: 'enterprise-a@integration.test', phone: '+84900000001',
      industry: 'Information Technology', company_size: '1-10', address: { street: 'A Street', city: 'Ho Chi Minh City', country: 'Vietnam' },
      logo_url: 'https://cdn.example.test/enterprise-a-logo.png', status: 'active', creator_account_id: recruiterA1._id, is_deleted: false,
    });
    const enterpriseB = await Enterprise.create({
      name: 'Integration Enterprise B', tax_code: '9000000002', email: 'enterprise-b@integration.test', phone: '+84900000002',
      industry: 'Information Technology', company_size: '1-10', address: { street: 'B Street', city: 'Ha Noi', country: 'Vietnam' },
      status: 'active', creator_account_id: recruiterB._id, is_deleted: false,
    });
    enterpriseAId = String(enterpriseA._id);
    enterpriseBId = String(enterpriseB._id);
    await User.updateMany(
      { _id: { $in: [recruiterA1._id, recruiterA2._id] } },
      { $set: { enterprise_id: enterpriseA._id } },
    );
    await User.updateOne({ _id: recruiterB._id }, { $set: { enterprise_id: enterpriseB._id } });
    const jobA = await JobPosting.create({ enterprise_id: enterpriseA._id, posted_by_user_id: recruiterA1._id, title: 'Enterprise A Published Job', slug: 'enterprise-a-published-job', status: 'published', ...validFields });
    const jobB = await JobPosting.create({ enterprise_id: enterpriseB._id, posted_by_user_id: recruiterB._id, title: 'Enterprise B Published Job', slug: 'enterprise-b-published-job', status: 'published', ...validFields });
    jobAId = String(jobA._id);
    jobBId = String(jobB._id);
  });

  async function post(token: string, payload: Record<string, unknown>): Promise<Response> {
    return fetch(`${baseUrl}/api/v1/job-postings`, { method: 'POST', headers: auth(token), body: JSON.stringify(payload) });
  }
  async function patch(token: string, id: string, payload: Record<string, unknown>): Promise<Response> {
    return fetch(`${baseUrl}/api/v1/job-postings/${id}`, { method: 'PATCH', headers: auth(token), body: JSON.stringify(payload) });
  }
  async function remove(token: string, id: string): Promise<Response> {
    return fetch(`${baseUrl}/api/v1/job-postings/${id}`, { method: 'DELETE', headers: auth(token) });
  }

  it('queries only recruiters whose User.enterprise_id matches the enterprise', async () => {
    const enterpriseARecruiters = await usersService.findRecruitersByEnterpriseId(enterpriseAId);
    const recruiterIds = enterpriseARecruiters.map((recruiter) => String(recruiter._id));
    const enterpriseA = await Enterprise.findById(enterpriseAId).lean();

    expect(recruiterIds).toEqual(expect.arrayContaining([String(recruiterA1._id), String(recruiterA2._id)]));
    expect(recruiterIds).not.toContain(String(recruiterB._id));
    expect(Object.hasOwn(enterpriseA ?? {}, 'recruiter_ids')).toBe(false);
  });

  it('authenticates recruiters and scopes the recruiter list to their enterprise (two-company isolation)', async () => {
    const recruiterLogin = await login(recruiterA1.email);
    const persistedRecruiter = await User.findById(recruiterA1._id).lean();
    expect(String(persistedRecruiter?.enterprise_id)).toBe(enterpriseAId);

    const scopedResponse = await fetch(`${baseUrl}/api/v1/recruiter/job-postings`, { headers: auth(recruiterLogin.tokens.accessToken) });
    expect(scopedResponse.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const scoped = await scopedResponse.json() as { items: JobResponse[] };
    expect(scoped.items.map((item) => item.id)).toEqual([jobAId]);
    expect(scoped.items[0]?.enterprise).toEqual({ id: enterpriseAId, name: 'Integration Enterprise A', logoUrl: 'https://cdn.example.test/enterprise-a-logo.png' });
    expect(scoped.items[0]?.recruitmentStatus).toBe('open');
    expect(scoped.items[0]?.applicationCount).toBe(0);

    // A client-supplied company identifier is ignored for the list.
    const tampered = await fetch(`${baseUrl}/api/v1/recruiter/job-postings?enterprise_id=${enterpriseBId}`, { headers: auth(recruiterLogin.tokens.accessToken) });
    expect((await tampered.json() as { items: JobResponse[] }).items.map((item) => item.id)).toEqual([jobAId]);

    expect((await fetch(`${baseUrl}/api/v1/recruiter/job-postings`)).status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
    const adminLogin = await login(admin.email);
    expect((await fetch(`${baseUrl}/api/v1/recruiter/job-postings`, { headers: auth(adminLogin.tokens.accessToken) })).status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    expect((await fetch(`${baseUrl}/api/v1/recruiter/job-postings?page=0`, { headers: auth(recruiterLogin.tokens.accessToken) })).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
  });

  it('counts applications in the company list and detail but never in the public list', async () => {
    const recruiterLogin = await login(recruiterA1.email);
    await Application.create([{ job_id: jobAId, applicant_id: recruiterA1._id, cv_id: jobAId, status_history: [] }, { job_id: jobAId, applicant_id: recruiterA2._id, cv_id: jobAId, status_history: [] }]);
    const list = await (await fetch(`${baseUrl}/api/v1/recruiter/job-postings`, { headers: auth(recruiterLogin.tokens.accessToken) })).json() as { items: JobResponse[] };
    expect(list.items[0]?.applicationCount).toBe(2);
    const detail = await (await fetch(`${baseUrl}/api/v1/job-postings/${jobAId}`, { headers: auth(recruiterLogin.tokens.accessToken) })).json() as JobResponse;
    expect(detail.applicationCount).toBe(2);
    const publicList = await (await fetch(`${baseUrl}/api/v1/job-postings`)).json() as { items: JobResponse[] };
    expect(publicList.items.length).toBeGreaterThan(0);
    expect(publicList.items.every((item) => item.applicationCount === undefined)).toBe(true);
  });

  it('lets the admin read every company but not change it', async () => {
    const adminLogin = await login(admin.email);
    const list = await fetch(`${baseUrl}/api/v1/admin/job-postings`, { headers: auth(adminLogin.tokens.accessToken) });
    expect(list.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect((await list.json() as { items: JobResponse[] }).items).toHaveLength(2);
    expect((await fetch(`${baseUrl}/api/v1/job-postings/${jobBId}`, { headers: auth(adminLogin.tokens.accessToken) })).status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect((await patch(adminLogin.tokens.accessToken, jobBId, { title: 'Admin Updated Job B' })).status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    expect((await remove(adminLogin.tokens.accessToken, jobBId)).status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    expect(await JobPosting.exists({ _id: jobBId })).not.toBeNull();
    expect((await post(adminLogin.tokens.accessToken, validPayload)).status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
  });

  it('creates and publishes a job in one step under the recruiter enterprise (AC-JOB-01-01)', async () => {
    const recruiterLogin = await login(recruiterA1.email);
    const response = await post(recruiterLogin.tokens.accessToken, { ...validPayload, salary_negotiable: true });
    expect(response.status).toBe(HTTP_STATUS.HTTP_201_CREATED);
    const body = await response.json() as JobResponse;
    expect(body.status).toBe('published');
    expect(body.recruitmentStatus).toBe('open');
    expect(body.enterpriseId).toBe(enterpriseAId);
    expect(body.postedByUserId).toBe(String(recruiterA1._id));
    expect(body.salaryNegotiable).toBe(true);
    // Date-only deadline = end of that day in Asia/Ho_Chi_Minh.
    expect(body.expiresAt).toBe('2099-01-01T16:59:59.999Z');
    const stored = await JobPosting.findById(body.id).lean();
    expect(stored?.status).toBe('published');
    expect(stored?.published_at).toBeTruthy();
    const audit = await JobPostingAuditEvent.find({ job_posting_id: body.id }).lean();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'create', result: 'success', job_title: validPayload.title });
    expect(String(audit[0]?.actor_user_id)).toBe(String(recruiterA1._id));
  });

  it('rejects status and ownership fields on create and edit (no Draft, no ownership change)', async () => {
    const recruiterLogin = await login(recruiterA1.email);
    const token = recruiterLogin.tokens.accessToken;
    for (const extra of [{ status: 'draft' }, { status: 'published' }, { enterprise_id: enterpriseBId }, { posted_by_user_id: String(recruiterB._id) }]) {
      expect((await post(token, { ...validPayload, ...extra })).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
      expect((await patch(token, jobAId, extra)).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    }
    const stored = await JobPosting.findById(jobAId).lean();
    expect(stored?.status).toBe('published');
    expect(String(stored?.enterprise_id)).toBe(enterpriseAId);
    expect(await JobPosting.countDocuments()).toBe(2);
  });

  it('validates the Published-field boundaries and creates nothing when they fail (AC-JOB-01-04/05)', async () => {
    const recruiterLogin = await login(recruiterA1.email);
    const token = recruiterLogin.tokens.accessToken;
    const invalid: Record<string, unknown>[] = [
      { title: 'abcd' }, { title: 'x'.repeat(151) },
      { description: 'too short' }, { requirements: 'x'.repeat(5001) }, { benefits: 'short' },
      { location: 'H' }, { location: 'x'.repeat(151) },
      { employment_type: 'full_time' }, { employment_type: 'Freelance' },
      { expires_at: '2020-01-01' }, { expires_at: 'not-a-date' }, { expires_at: '2099-02-30' },
      { salary_min: -1 }, { salary_min: 3000, salary_max: 2000 },
    ];
    for (const change of invalid) {
      expect((await post(token, { ...validPayload, ...change })).status, JSON.stringify(change)).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    }
    for (const missing of ['location', 'employment_type', 'description', 'requirements', 'benefits', 'expires_at', 'title']) {
      const rest = Object.fromEntries(Object.entries(validPayload).filter(([key]) => key !== missing));
      expect((await post(token, rest)).status, missing).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    }
    expect(await JobPosting.countDocuments()).toBe(2);
    expect(await JobPostingAuditEvent.countDocuments()).toBe(0);
  });

  it('accepts deadline today and every allowed job type, including an ISO datetime', async () => {
    const recruiterLogin = await login(recruiterA1.email);
    const token = recruiterLogin.tokens.accessToken;
    const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const todayResponse = await post(token, { ...validPayload, title: 'Deadline Today Job', expires_at: today });
    expect(todayResponse.status).toBe(HTTP_STATUS.HTTP_201_CREATED);
    for (const type of ['Part-time', 'Internship', 'Contract', 'Remote']) {
      expect((await post(token, { ...validPayload, title: `${type} Engineer`, employment_type: type, expires_at: '2099-01-01T05:00:00.000Z' })).status).toBe(HTTP_STATUS.HTTP_201_CREATED);
    }
  });

  it('rejects a recruiter without enterprise membership or whose enterprise is not Active (AC-JOB-01-03)', async () => {
    const noEnterprise = await login(recruiterWithoutEnterprise.email);
    const unassigned = await post(noEnterprise.tokens.accessToken, validPayload);
    expect(unassigned.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    expect((await unassigned.json() as { message: string }).message).toBe('Recruiter is not assigned to an enterprise');

    await Enterprise.updateOne({ _id: enterpriseAId }, { $set: { status: 'suspended' } });
    const recruiterLogin = await login(recruiterA1.email);
    expect((await post(recruiterLogin.tokens.accessToken, validPayload)).status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    expect(await JobPosting.countDocuments({ enterprise_id: enterpriseAId })).toBe(1);
  });

  it('rechecks membership at mutation time instead of trusting the session (AC-JOB-03-09)', async () => {
    const recruiterLogin = await login(recruiterA1.email);
    await User.updateOne({ _id: recruiterA1._id }, { $unset: { enterprise_id: 1 } });
    expect((await fetch(`${baseUrl}/api/v1/recruiter/job-postings`, { headers: auth(recruiterLogin.tokens.accessToken) })).status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    expect((await patch(recruiterLogin.tokens.accessToken, jobAId, { title: 'Stale session edit' })).status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    expect((await remove(recruiterLogin.tokens.accessToken, jobAId)).status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    expect(await JobPosting.exists({ _id: jobAId })).not.toBeNull();
  });

  it('edits permitted fields for the same enterprise, keeps state and ownership, and audits the change', async () => {
    const recruiterA2Login = await login(recruiterA2.email);
    const update = await patch(recruiterA2Login.tokens.accessToken, jobAId, { title: 'Updated By Recruiter A2', salary_min: 10, salary_max: 20, level: 'Senior', openings: 2 });
    expect(update.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const body = await update.json() as JobResponse;
    expect(body.status).toBe('published');
    expect(body.enterpriseId).toBe(enterpriseAId);
    const stored = await JobPosting.findById(jobAId).lean();
    expect(stored?.title).toBe('Updated By Recruiter A2');
    expect(String(stored?.enterprise_id)).toBe(enterpriseAId);
    const audit = await JobPostingAuditEvent.findOne({ job_posting_id: jobAId, action: 'update' }).lean();
    expect(audit?.changed_fields).toEqual(['title', 'salary_min', 'salary_max', 'level', 'openings']);

    const recruiterBLogin = await login(recruiterB.email);
    const crossDetail = await fetch(`${baseUrl}/api/v1/job-postings/${jobAId}`, { headers: auth(recruiterBLogin.tokens.accessToken) });
    expect(crossDetail.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    expect((await crossDetail.json() as { message: string }).message).toBe('Job posting belongs to another enterprise');
    expect((await patch(recruiterBLogin.tokens.accessToken, jobAId, { title: 'Not Allowed' })).status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    expect((await remove(recruiterBLogin.tokens.accessToken, jobAId)).status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
  });

  it('clears only optional fields and never a Published-field (AC-JOB-02-09)', async () => {
    const recruiterLogin = await login(recruiterA1.email);
    const token = recruiterLogin.tokens.accessToken;
    expect((await patch(token, jobAId, { level: 'Senior', salary_min: 10, salary_max: 20, openings: 3 })).status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect((await patch(token, jobAId, { level: null, salary_min: null, salary_max: null, openings: null })).status).toBe(HTTP_STATUS.HTTP_200_OK);
    const detail = await (await fetch(`${baseUrl}/api/v1/job-postings/${jobAId}`, { headers: auth(token) })).json() as JobResponse;
    for (const field of ['level', 'salaryMin', 'salaryMax', 'openings']) expect(detail).not.toHaveProperty(field);
    for (const field of ['location', 'employment_type', 'description', 'requirements', 'benefits', 'expires_at']) {
      expect((await patch(token, jobAId, { [field]: null })).status, field).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    }
    expect((await patch(token, jobAId, { description: 'short' })).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    expect((await patch(token, jobAId, { expires_at: '2020-01-01' })).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    expect((await patch(token, jobAId, {})).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
  });

  it('closes a job whose deadline passed and reopens it when the deadline moves forward', async () => {
    const recruiterLogin = await login(recruiterA1.email);
    const token = recruiterLogin.tokens.accessToken;
    await JobPosting.updateOne({ _id: jobAId }, { $set: { expires_at: new Date('2020-01-01T16:59:59.999Z') } });
    const closed = await (await fetch(`${baseUrl}/api/v1/job-postings/${jobAId}`, { headers: auth(token) })).json() as JobResponse;
    expect(closed.status).toBe('published');
    expect(closed.recruitmentStatus).toBe('closed');
    expect((await patch(token, jobAId, { title: 'Edited While Closed' })).status).toBe(HTTP_STATUS.HTTP_200_OK);
    const reopened = await patch(token, jobAId, { expires_at: '2099-06-30' });
    expect(reopened.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect((await reopened.json() as JobResponse).recruitmentStatus).toBe('open');
  });

  it('keeps legacy archived postings read-only', async () => {
    const recruiterLogin = await login(recruiterA1.email);
    await JobPosting.updateOne({ _id: jobAId }, { $set: { status: 'archived' } });
    expect((await patch(recruiterLogin.tokens.accessToken, jobAId, { title: 'Edit Archived' })).status).toBe(HTTP_STATUS.HTTP_409_CONFLICT);
  });

  it('shows the public only Published, open jobs of Active enterprises', async () => {
    const hidden = { enterprise_id: enterpriseAId, posted_by_user_id: recruiterA1._id, ...validFields };
    await JobPosting.create([
      { ...hidden, title: 'Legacy Draft Job', slug: 'legacy-draft-job', status: 'draft' },
      { ...hidden, title: 'Legacy Archived Job', slug: 'legacy-archived-job', status: 'archived' },
      { ...hidden, title: 'Expired Job', slug: 'expired-job', status: 'published', expires_at: new Date('2020-01-01T16:59:59.999Z') },
      { ...hidden, title: 'Being Deleted Job', slug: 'being-deleted-job', status: 'published', deleting: true },
    ]);
    const titles = async (): Promise<string[]> => ((await (await fetch(`${baseUrl}/api/v1/job-postings?limit=50`)).json()) as { items: JobResponse[] }).items.map((item) => item.title);
    expect((await titles()).sort()).toEqual(['Enterprise A Published Job', 'Enterprise B Published Job']);

    await Enterprise.updateOne({ _id: enterpriseBId }, { $set: { status: 'suspended' } });
    expect(await titles()).toEqual(['Enterprise A Published Job']);
    // The company still sees its own job, now marked with its state.
    const recruiterB2 = await login(recruiterB.email);
    const own = await (await fetch(`${baseUrl}/api/v1/recruiter/job-postings`, { headers: auth(recruiterB2.tokens.accessToken) })).json() as { items: JobResponse[] };
    expect(own.items.map((item) => item.id)).toEqual([jobBId]);
  });

  it('narrows the public list by enterprise_id without leaking other companies or inactive ones', async () => {
    const byCompany = async (id: string): Promise<string[]> =>
      ((await (await fetch(`${baseUrl}/api/v1/job-postings?enterprise_id=${id}`)).json()) as { items: JobResponse[] }).items.map((item) => item.id);
    expect(await byCompany(enterpriseAId)).toEqual([jobAId]);
    expect(await byCompany(enterpriseBId)).toEqual([jobBId]);
    // A suspended enterprise stays hidden even when asked for by id.
    await Enterprise.updateOne({ _id: enterpriseBId }, { $set: { status: 'suspended' } });
    expect(await byCompany(enterpriseBId)).toEqual([]);
    expect((await fetch(`${baseUrl}/api/v1/job-postings?enterprise_id=not-an-id`)).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
  });

  it('counts only open, published jobs as the open roles of an enterprise', async () => {
    await JobPosting.create([
      { enterprise_id: enterpriseAId, posted_by_user_id: recruiterA1._id, title: 'Expired Job', slug: 'open-roles-expired', status: 'published', ...validFields, expires_at: new Date('2020-01-01T16:59:59.999Z') },
      { enterprise_id: enterpriseAId, posted_by_user_id: recruiterA1._id, title: 'Legacy Draft', slug: 'open-roles-draft', status: 'draft' },
    ]);
    const list = (await (await fetch(`${baseUrl}/api/v1/enterprises?limit=100`)).json()) as { items: { id: string; openRoleCount: number }[] };
    expect(list.items.find((item) => item.id === enterpriseAId)?.openRoleCount).toBe(1);
  });

  it('serves the public job detail only while the job is open', async () => {
    const detail = async (id: string): Promise<Response> => fetch(`${baseUrl}/api/v1/job-postings/${id}/public`);
    const open = await detail(jobAId);
    expect(open.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const body = await open.json() as JobResponse;
    expect(body.enterprise.name).toBe('Integration Enterprise A');
    expect(body.applicationCount).toBeUndefined();

    await JobPosting.updateOne({ _id: jobAId }, { $set: { expires_at: new Date('2020-01-01T16:59:59.999Z') } });
    expect((await detail(jobAId)).status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
    await JobPosting.updateOne({ _id: jobAId }, { $set: { expires_at: new Date('2099-01-01T16:59:59.999Z'), status: 'archived' } });
    expect((await detail(jobAId)).status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
    await Enterprise.updateOne({ _id: enterpriseBId }, { $set: { status: 'suspended' } });
    expect((await detail(jobBId)).status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
    expect((await detail('not-an-id')).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
  });

  it('hard-removes a job with no application history in any state and writes a separate audit event (AC-JOB-03-01)', async () => {
    const recruiterLogin = await login(recruiterA1.email);
    const archived = await JobPosting.create({ enterprise_id: enterpriseAId, posted_by_user_id: recruiterA1._id, title: 'Archived Job', slug: 'integration-archived-job', status: 'archived' });
    const draft = await JobPosting.create({ enterprise_id: enterpriseAId, posted_by_user_id: recruiterA1._id, title: 'Legacy Draft', slug: 'integration-legacy-draft', status: 'draft' });
    for (const id of [jobAId, String(archived._id), String(draft._id)]) {
      expect((await remove(recruiterLogin.tokens.accessToken, id)).status).toBe(HTTP_STATUS.HTTP_204_NO_CONTENT);
      expect(await JobPosting.findById(id)).toBeNull();
      expect((await fetch(`${baseUrl}/api/v1/job-postings/${id}`, { headers: auth(recruiterLogin.tokens.accessToken) })).status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
    }
    expect(await JobPostingAuditEvent.countDocuments({ action: 'delete', result: 'success' })).toBe(3);
    expect((await remove(recruiterLogin.tokens.accessToken, jobAId)).status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
  });

  it('rejects deletion when any application state exists and leaves everything untouched (AC-JOB-03-04)', async () => {
    const recruiterLogin = await login(recruiterA1.email);
    for (const status of ['submitted', 'under_review', 'interviewing', 'offered', 'hired', 'withdrawn', 'rejected']) {
      await Application.deleteMany({});
      await Application.collection.insertOne({ job_id: new Types.ObjectId(jobAId), applicant_id: recruiterA1._id, cv_id: new Types.ObjectId(jobAId), status, status_history: [], createdAt: new Date(), updatedAt: new Date() });
      const deletion = await remove(recruiterLogin.tokens.accessToken, jobAId);
      expect(deletion.status, status).toBe(HTTP_STATUS.HTTP_409_CONFLICT);
      expect((await deletion.json() as { message: string }).message).toBe('Cannot delete job posting because applications already exist for this job.');
      const stored = await JobPosting.findById(jobAId).lean();
      expect(stored).not.toBeNull();
      expect(stored?.deleting).toBeUndefined();
      expect(await Application.countDocuments({ job_id: jobAId })).toBe(1);
    }
    expect(await JobPostingAuditEvent.countDocuments({ action: 'delete' })).toBe(0);
  });

  it('refuses applications for a job that is being deleted and removes one saved during a delete (AC-JOB-03-06)', async () => {
    const { jobPostingsService } = await import('../../src/modules/job-postings/job-postings.service.js');
    await JobPosting.updateOne({ _id: jobAId }, { $set: { deleting: true } });
    expect(await jobPostingsService.findPublicJobById(jobAId)).toBeNull();
    await JobPosting.updateOne({ _id: jobAId }, { $unset: { deleting: 1 } });
    expect(await jobPostingsService.findPublicJobById(jobAId)).not.toBeNull();
    await Enterprise.updateOne({ _id: enterpriseAId }, { $set: { status: 'suspended' } });
    expect(await jobPostingsService.findPublicJobById(jobAId)).toBeNull();
    await JobPosting.deleteOne({ _id: jobAId });
    expect(await jobPostingsService.stillExists(jobAId)).toBe(false);
  });

  it('publishes concrete Job Posting and Document contracts in OpenAPI', async () => {
    const spec = (await (await fetch(`${baseUrl}/openapi.json`)).json()) as OpenApiDocument;
    const publicList = spec.paths['/api/v1/job-postings']?.get;
    const recruiterList = spec.paths['/api/v1/recruiter/job-postings']?.get;
    const adminList = spec.paths['/api/v1/admin/job-postings']?.get;
    const create = spec.paths['/api/v1/job-postings']?.post;
    const update = spec.paths['/api/v1/job-postings/{id}']?.patch;
    const upload = spec.paths['/api/v1/documents']?.post;
    const documentList = spec.paths['/api/v1/documents']?.get;
    const adminDocumentList = spec.paths['/api/v1/admin/documents']?.get;

    expect(adminList).toBeDefined();
    for (const operation of [publicList, recruiterList, adminList, documentList, adminDocumentList]) {
      expect(operation?.parameters?.some((parameter) => parameter.in === 'query' && parameter.name === 'page')).toBe(true);
      expect(operation?.responses?.['200']?.content?.['application/json']?.schema).toBeDefined();
    }
    expect(create?.requestBody?.content['application/json']?.schema).toBeDefined();
    expect(update?.requestBody?.content['application/json']?.schema).toBeDefined();
    expect(upload?.requestBody?.content['multipart/form-data']?.schema).toBeDefined();
    expect(upload?.responses?.['201']?.content?.['application/json']?.schema).toBeDefined();
    expect(spec.components.schemas).toHaveProperty('JobPosting');
    expect(spec.components.schemas).toHaveProperty('JobPostingEnterpriseSummary');
    expect(spec.components.schemas).toHaveProperty('PaginatedJobPostings');
    const createSchema = spec.components.schemas.CreateJobPostingRequest;
    const updateSchema = spec.components.schemas.UpdateJobPostingRequest;
    expect(createSchema?.properties).not.toHaveProperty('status');
    expect(updateSchema?.properties).not.toHaveProperty('status');
    for (const field of ['salary_min', 'salary_max', 'level', 'openings']) {
      expect(updateSchema?.properties?.[field]?.nullable).toBe(true);
    }
    for (const field of ['location', 'employment_type', 'description', 'requirements', 'benefits', 'expires_at']) {
      expect(updateSchema?.properties?.[field]?.nullable).not.toBe(true);
    }
    const jobPostingSchema = spec.components.schemas.JobPosting;
    expect(jobPostingSchema?.properties?.enterprise).toBeDefined();
    expect(jobPostingSchema?.properties).toHaveProperty('recruitmentStatus');
    expect(spec.components.schemas).toHaveProperty('Document');
    expect(spec.components.schemas).toHaveProperty('PaginatedDocuments');
  });
});
