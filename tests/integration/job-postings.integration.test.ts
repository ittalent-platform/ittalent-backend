import bcrypt from 'bcryptjs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { app } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/db.js';
import { disconnectRedis } from '../../src/config/redis.js';
import { Account } from '../../src/models/account.model.js';
import { Application } from '../../src/models/application.model.js';
import { Enterprise } from '../../src/models/enterprise.model.js';
import { JobPosting } from '../../src/models/job-posting.model.js';
import { User, type UserDoc } from '../../src/models/user.model.js';
import { usersService } from '../../src/modules/users/users.service.js';
import { HTTP_STATUS } from '../../src/shared/constants/http-status.js';

type LoginResponse = { user: { id: string; role: string }; tokens: { accessToken: string } };
type JobResponse = {
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
    await Promise.all([Account.syncIndexes(), User.syncIndexes(), Enterprise.createIndexes(), JobPosting.syncIndexes(), Application.syncIndexes()]);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await Promise.all([Application.deleteMany({}), JobPosting.deleteMany({}), Enterprise.deleteMany({}), Account.deleteMany({}), User.deleteMany({})]);
    await disconnectRedis();
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await Promise.all([Application.deleteMany({}), JobPosting.deleteMany({}), Enterprise.deleteMany({}), Account.deleteMany({}), User.deleteMany({})]);
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
    const jobA = await JobPosting.create({ enterprise_id: enterpriseA._id, posted_by_user_id: recruiterA1._id, title: 'Enterprise A Draft Job', slug: 'enterprise-a-draft-job', status: 'draft' });
    const jobB = await JobPosting.create({ enterprise_id: enterpriseB._id, posted_by_user_id: recruiterB._id, title: 'Enterprise B Draft Job', slug: 'enterprise-b-draft-job', status: 'draft' });
    jobAId = String(jobA._id);
    jobBId = String(jobB._id);
  });

  it('authenticates recruiters and scopes the recruiter list to their enterprise', async () => {
    const recruiterLogin = await login(recruiterA1.email);
    expect(recruiterLogin.user.role).toBe('recruiter');
    expect(recruiterLogin.tokens.accessToken).toBeTruthy();
    const persistedRecruiter = await User.findById(recruiterA1._id).lean();
    expect(String(persistedRecruiter?.enterprise_id)).toBe(enterpriseAId);

    const scopedResponse = await fetch(`${baseUrl}/api/v1/recruiter/job-postings`, { headers: auth(recruiterLogin.tokens.accessToken) });
    expect(scopedResponse.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const scoped = await scopedResponse.json() as { items: JobResponse[] };
    expect(scoped.items.map((item) => item.id)).toContain(jobAId);
    expect(scoped.items.map((item) => item.id)).not.toContain(jobBId);
    expect(scoped.items.every((item) => item.enterpriseId === enterpriseAId)).toBe(true);
    expect(scoped.items.every((item) => item.enterprise.id === enterpriseAId && item.enterprise.name === 'Integration Enterprise A' && item.enterprise.logoUrl === 'https://cdn.example.test/enterprise-a-logo.png')).toBe(true);

    expect((await fetch(`${baseUrl}/api/v1/recruiter/job-postings`)).status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
    const adminLogin = await login(admin.email);
    expect((await fetch(`${baseUrl}/api/v1/recruiter/job-postings`, { headers: auth(adminLogin.tokens.accessToken) })).status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
  });

  it('includes enterprise identity in public, recruiter, admin list, and management detail responses', async () => {
    const recruiterLogin = await login(recruiterA1.email);
    const detailResponse = await fetch(`${baseUrl}/api/v1/job-postings/${jobAId}`, { headers: auth(recruiterLogin.tokens.accessToken) });
    const detail = await detailResponse.json() as JobResponse;
    expect(detailResponse.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(detail.enterprise).toEqual({ id: enterpriseAId, name: 'Integration Enterprise A', logoUrl: 'https://cdn.example.test/enterprise-a-logo.png' });

    const recruiterListResponse = await fetch(`${baseUrl}/api/v1/recruiter/job-postings`, { headers: auth(recruiterLogin.tokens.accessToken) });
    const recruiterList = await recruiterListResponse.json() as { items: JobResponse[] };
    expect(recruiterList.items.find((item) => item.id === jobAId)?.enterprise).toEqual(detail.enterprise);

    const adminLogin = await login(admin.email);
    const adminListResponse = await fetch(`${baseUrl}/api/v1/admin/job-postings`, { headers: auth(adminLogin.tokens.accessToken) });
    const adminList = await adminListResponse.json() as { items: JobResponse[] };
    expect(adminListResponse.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(adminList.items.find((item) => item.id === jobAId)?.enterprise).toEqual(detail.enterprise);
    expect(adminList.items.find((item) => item.id === jobBId)?.enterprise).toEqual({ id: enterpriseBId, name: 'Integration Enterprise B', logoUrl: null });

    const publishResponse = await fetch(`${baseUrl}/api/v1/job-postings/${jobAId}`, {
      method: 'PATCH',
      headers: auth(recruiterLogin.tokens.accessToken),
      body: JSON.stringify({ status: 'published', description: 'A sufficiently detailed backend engineering position.', requirements: 'Node.js and TypeScript', benefits: 'Flexible schedule', location: 'Ho Chi Minh City', employment_type: 'full_time', expires_at: '2027-01-01T00:00:00.000Z' }),
    });
    expect(publishResponse.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const publicListResponse = await fetch(`${baseUrl}/api/v1/job-postings`);
    const publicList = await publicListResponse.json() as { items: JobResponse[] };
    expect(publicListResponse.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(publicList.items.find((item) => item.id === jobAId)?.enterprise).toEqual(detail.enterprise);
  });

  it('queries only recruiters whose User.enterprise_id matches the enterprise', async () => {
    const enterpriseARecruiters = await usersService.findRecruitersByEnterpriseId(enterpriseAId);
    const recruiterIds = enterpriseARecruiters.map((recruiter) => String(recruiter._id));
    const enterpriseA = await Enterprise.findById(enterpriseAId).lean();

    expect(recruiterIds).toEqual(expect.arrayContaining([String(recruiterA1._id), String(recruiterA2._id)]));
    expect(recruiterIds).not.toContain(String(recruiterB._id));
    expect(Object.hasOwn(enterpriseA ?? {}, 'recruiter_ids')).toBe(false);
  });

  it('derives ownership from the recruiter and ignores client ownership fields', async () => {
    const recruiterLogin = await login(recruiterA1.email);
    const response = await fetch(`${baseUrl}/api/v1/job-postings`, {
      method: 'POST', headers: auth(recruiterLogin.tokens.accessToken),
      body: JSON.stringify({ title: 'Integration Created Draft', salary_negotiable: true, enterprise_id: enterpriseBId, posted_by_user_id: String(recruiterB._id) }),
    });
    expect(response.status).toBe(HTTP_STATUS.HTTP_201_CREATED);
    const body = await response.json() as JobResponse;
    expect(body.enterpriseId).toBe(enterpriseAId);
    expect(body.postedByUserId).toBe(String(recruiterA1._id));
    expect(body.status).toBe('draft');
    expect(body.salaryNegotiable).toBe(true);
    const stored = await JobPosting.findById(body.id).lean();
    expect(String(stored?.enterprise_id)).toBe(enterpriseAId);
    expect(String(stored?.posted_by_user_id)).toBe(String(recruiterA1._id));
    expect(stored?.salary_negotiable).toBe(true);
  });

  it('rejects a recruiter without enterprise membership', async () => {
    const recruiterLogin = await login(recruiterWithoutEnterprise.email);
    const response = await fetch(`${baseUrl}/api/v1/job-postings`, {
      method: 'POST', headers: auth(recruiterLogin.tokens.accessToken), body: JSON.stringify({ title: 'Unassigned Recruiter Job' }),
    });
    expect(response.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    expect((await response.json() as { message: string }).message).toBe('Recruiter is not assigned to an enterprise');
  });

  it('allows same-enterprise recruiters and blocks cross-enterprise management', async () => {
    const recruiterA2Login = await login(recruiterA2.email);
    const sameEnterpriseUpdate = await fetch(`${baseUrl}/api/v1/job-postings/${jobAId}`, {
      method: 'PATCH', headers: auth(recruiterA2Login.tokens.accessToken), body: JSON.stringify({ title: 'Updated By Recruiter A2', enterprise_id: enterpriseBId }),
    });
    expect(sameEnterpriseUpdate.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const stored = await JobPosting.findById(jobAId).lean();
    expect(stored?.title).toBe('Updated By Recruiter A2');
    expect(String(stored?.enterprise_id)).toBe(enterpriseAId);

    const recruiterBLogin = await login(recruiterB.email);
    const crossDetail = await fetch(`${baseUrl}/api/v1/job-postings/${jobAId}`, { headers: auth(recruiterBLogin.tokens.accessToken) });
    expect(crossDetail.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    expect((await crossDetail.json() as { message: string }).message).toBe('Job posting belongs to another enterprise');
    const crossUpdate = await fetch(`${baseUrl}/api/v1/job-postings/${jobAId}`, { method: 'PATCH', headers: auth(recruiterBLogin.tokens.accessToken), body: JSON.stringify({ title: 'Not Allowed' }) });
    expect(crossUpdate.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    const crossDelete = await fetch(`${baseUrl}/api/v1/job-postings/${jobAId}`, { method: 'DELETE', headers: auth(recruiterBLogin.tokens.accessToken) });
    expect(crossDelete.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
  });

  it('clears nullable optional fields and omits them from detail and recruiter list responses', async () => {
    const recruiterLogin = await login(recruiterA1.email);
    const setOptionalFields = await fetch(`${baseUrl}/api/v1/job-postings/${jobAId}`, {
      method: 'PATCH',
      headers: auth(recruiterLogin.tokens.accessToken),
      body: JSON.stringify({
        location: 'Ho Chi Minh City',
        employment_type: 'full_time',
        level: 'senior',
        description: 'Build reliable systems for enterprise customers.',
        requirements: 'TypeScript and MongoDB',
        benefits: 'Flexible hours',
        salary_min: 30000000,
        salary_max: 50000000,
        openings: 2,
        expires_at: '2027-01-01T00:00:00.000Z',
      }),
    });
    expect(setOptionalFields.status).toBe(HTTP_STATUS.HTTP_200_OK);

    const clearTextFields = await fetch(`${baseUrl}/api/v1/job-postings/${jobAId}`, {
      method: 'PATCH',
      headers: auth(recruiterLogin.tokens.accessToken),
      body: JSON.stringify({ location: null, employment_type: null, level: null, description: null, requirements: null, benefits: null }),
    });
    expect(clearTextFields.status).toBe(HTTP_STATUS.HTTP_200_OK);

    const clearNumberAndDateFields = await fetch(`${baseUrl}/api/v1/job-postings/${jobAId}`, {
      method: 'PATCH',
      headers: auth(recruiterLogin.tokens.accessToken),
      body: JSON.stringify({ salary_min: null, salary_max: null, openings: null, expires_at: null }),
    });
    expect(clearNumberAndDateFields.status).toBe(HTTP_STATUS.HTTP_200_OK);

    const detailResponse = await fetch(`${baseUrl}/api/v1/job-postings/${jobAId}`, { headers: auth(recruiterLogin.tokens.accessToken) });
    expect(detailResponse.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const detail = await detailResponse.json() as JobResponse;
    for (const field of ['location', 'employmentType', 'level', 'description', 'requirements', 'benefits', 'salaryMin', 'salaryMax', 'openings', 'expiresAt']) {
      expect(detail).not.toHaveProperty(field);
    }

    const recruiterListResponse = await fetch(`${baseUrl}/api/v1/recruiter/job-postings`, { headers: auth(recruiterLogin.tokens.accessToken) });
    expect(recruiterListResponse.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const recruiterList = await recruiterListResponse.json() as { items: JobResponse[] };
    const listedJob = recruiterList.items.find((item) => item.id === jobAId);
    expect(listedJob).toBeDefined();
    for (const field of ['location', 'employmentType', 'level', 'description', 'requirements', 'benefits', 'salaryMin', 'salaryMax', 'openings', 'expiresAt']) {
      expect(listedJob).not.toHaveProperty(field);
    }
  });

  it('enforces publish validation, exposes only published jobs publicly, and supports archive/delete', async () => {
    const recruiterLogin = await login(recruiterA1.email);
    const incompletePublish = await fetch(`${baseUrl}/api/v1/job-postings/${jobAId}`, { method: 'PATCH', headers: auth(recruiterLogin.tokens.accessToken), body: JSON.stringify({ status: 'published' }) });
    expect(incompletePublish.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    const publish = await fetch(`${baseUrl}/api/v1/job-postings/${jobAId}`, {
      method: 'PATCH', headers: auth(recruiterLogin.tokens.accessToken),
      body: JSON.stringify({ status: 'published', description: 'A sufficiently detailed backend engineering position.', requirements: 'Node.js and TypeScript', benefits: 'Flexible schedule', location: 'Ho Chi Minh City', employment_type: 'full_time', expires_at: '2027-01-01T00:00:00.000Z' }),
    });
    expect(publish.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect((await publish.json() as JobResponse).status).toBe('published');
    const clearPublishedRequirement = await fetch(`${baseUrl}/api/v1/job-postings/${jobAId}`, { method: 'PATCH', headers: auth(recruiterLogin.tokens.accessToken), body: JSON.stringify({ description: null }) });
    expect(clearPublishedRequirement.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    await JobPosting.create({ enterprise_id: enterpriseAId, posted_by_user_id: recruiterA1._id, title: 'Archived Job', slug: 'integration-archived-job', status: 'archived' });
    const publicList = await fetch(`${baseUrl}/api/v1/job-postings`);
    const publicBody = await publicList.json() as { items: JobResponse[] };
    expect(publicList.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(publicBody.items.map((item) => item.id)).toContain(jobAId);
    expect(publicBody.items.every((item) => item.status === 'published')).toBe(true);

    const archive = await fetch(`${baseUrl}/api/v1/job-postings/${jobAId}`, { method: 'PATCH', headers: auth(recruiterLogin.tokens.accessToken), body: JSON.stringify({ status: 'archived' }) });
    expect(archive.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const deletion = await fetch(`${baseUrl}/api/v1/job-postings/${jobAId}`, { method: 'DELETE', headers: auth(recruiterLogin.tokens.accessToken) });
    expect(deletion.status).toBe(HTTP_STATUS.HTTP_204_NO_CONTENT);
    expect(await JobPosting.findById(jobAId)).toBeNull();
    expect((await fetch(`${baseUrl}/api/v1/job-postings/${jobAId}`, { headers: auth(recruiterLogin.tokens.accessToken) })).status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
  });

  it('rejects deletion when one application references the job posting', async () => {
    const recruiterLogin = await login(recruiterA1.email);
    await Application.create({ job_id: jobAId, applicant_id: recruiterA1._id, cv_id: jobAId, status_history: [] });

    const deletion = await fetch(`${baseUrl}/api/v1/job-postings/${jobAId}`, {
      method: 'DELETE', headers: auth(recruiterLogin.tokens.accessToken),
    });

    expect(deletion.status).toBe(HTTP_STATUS.HTTP_409_CONFLICT);
    expect((await deletion.json() as { message: string }).message).toBe('Cannot delete job posting because applications already exist for this job.');
    expect(await JobPosting.exists({ _id: jobAId })).not.toBeNull();
    expect(await Application.exists({ job_id: jobAId })).not.toBeNull();
  });

  it('rejects deletion when multiple applications reference the job posting', async () => {
    const recruiterLogin = await login(recruiterA1.email);
    await Application.create([
      { job_id: jobAId, applicant_id: recruiterA1._id, cv_id: jobAId, status_history: [] },
      { job_id: jobAId, applicant_id: recruiterA2._id, cv_id: jobAId, status_history: [] },
    ]);

    const deletion = await fetch(`${baseUrl}/api/v1/job-postings/${jobAId}`, {
      method: 'DELETE', headers: auth(recruiterLogin.tokens.accessToken),
    });

    expect(deletion.status).toBe(HTTP_STATUS.HTTP_409_CONFLICT);
    expect(await JobPosting.exists({ _id: jobAId })).not.toBeNull();
    expect(await Application.countDocuments({ job_id: jobAId })).toBe(2);
  });

  it('preserves admin management access across enterprise boundaries', async () => {
    const adminLogin = await login(admin.email);
    const list = await fetch(`${baseUrl}/api/v1/admin/job-postings`, { headers: auth(adminLogin.tokens.accessToken) });
    expect(list.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect((await list.json() as { items: JobResponse[] }).items).toHaveLength(2);
    expect((await fetch(`${baseUrl}/api/v1/job-postings/${jobBId}`, { headers: auth(adminLogin.tokens.accessToken) })).status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect((await fetch(`${baseUrl}/api/v1/job-postings/${jobBId}`, { method: 'PATCH', headers: auth(adminLogin.tokens.accessToken), body: JSON.stringify({ title: 'Admin Updated Job B' }) })).status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect((await fetch(`${baseUrl}/api/v1/job-postings/${jobBId}`, { method: 'DELETE', headers: auth(adminLogin.tokens.accessToken) })).status).toBe(HTTP_STATUS.HTTP_204_NO_CONTENT);
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
    const updateSchema = spec.components.schemas.UpdateJobPostingRequest;
    for (const field of ['location', 'employment_type', 'salary_min', 'salary_max', 'level', 'description', 'requirements', 'benefits', 'openings', 'expires_at']) {
      expect(updateSchema?.properties?.[field]?.nullable).toBe(true);
    }
    const jobPostingSchema = spec.components.schemas.JobPosting;
    expect(jobPostingSchema?.properties?.enterprise).toBeDefined();
    expect(spec.components.schemas).toHaveProperty('Document');
    expect(spec.components.schemas).toHaveProperty('PaginatedDocuments');
  });
});
