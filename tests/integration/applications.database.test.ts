import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectDatabase, disconnectDatabase } from '../../src/config/db.js';
import { Application, type ApplicationStatus } from '../../src/models/application.model.js';
import { Document } from '../../src/models/document.model.js';
import { Enterprise } from '../../src/models/enterprise.model.js';
import { JobPosting } from '../../src/models/job-posting.model.js';
import { User } from '../../src/models/user.model.js';
import { applicationsService } from '../../src/modules/applications/applications.service.js';

const DAY = 86_400_000;
const base = Date.now() - 30 * DAY;
const query = { page: 1, limit: 20, sortBy: 'submittedAt', sortOrder: 'desc' } as const;

// Behaviours that only a real database can prove: scoping, filters, sorting, keyword joins and atomic withdrawal.
describe('My applications against MongoDB (UC-MYAPP-01..05)', () => {
  const owner = new Types.ObjectId();
  const other = new Types.ObjectId();
  const company = new Types.ObjectId();
  let cv: Types.ObjectId;
  const enterprises = new Map<string, Types.ObjectId>();

  async function job(companyName: string, title: string, overrides: Record<string, unknown> = {}): Promise<Types.ObjectId> {
    let enterpriseId = enterprises.get(companyName);
    if (!enterpriseId) {
      enterpriseId = (await Enterprise.create({
        name: companyName, tax_code: `t${new Types.ObjectId()}`, email: `hr-${new Types.ObjectId()}@example.test`, phone: '+84900000000', industry: 'IT', company_size: '11-50',
        address: { street: '1 Test', city: 'Hà Nội', country: 'Vietnam' }, status: 'active', creator_account_id: company, is_deleted: false,
      }))._id;
      enterprises.set(companyName, enterpriseId);
    }
    return (await JobPosting.create({
      enterprise_id: enterpriseId, posted_by_user_id: company, title, slug: `db-${new Types.ObjectId()}`, status: 'published', location: 'Hà Nội',
      employment_type: 'Full-time', expires_at: new Date(Date.now() + 90 * DAY), ...overrides,
    }))._id;
  }

  async function application(jobId: Types.ObjectId, status: ApplicationStatus = 'submitted', overrides: Record<string, unknown> = {}, applicant = owner) {
    const createdAt = (overrides.createdAt as Date | undefined) ?? new Date(base);
    const history: { status: ApplicationStatus; changed_at: Date; changed_by: Types.ObjectId }[] = [{ status: 'submitted', changed_at: createdAt, changed_by: applicant }];
    if (status !== 'submitted') history.push({ status, changed_at: new Date(createdAt.getTime() + DAY), changed_by: status === 'withdrawn' ? applicant : company });
    // timestamps:false so the tests control createdAt (submitted) and updatedAt (last update).
    const [record] = await Application.create(
      [{ job_id: jobId, applicant_id: applicant, cv_id: cv, status, status_history: history, createdAt, updatedAt: createdAt, ...overrides }] as never,
      { timestamps: false },
    );
    return record!;
  }

  const ids = async (extra: Record<string, unknown> = {}) => (await applicationsService.list(String(owner), { ...query, ...extra })).items.map((item) => item.id);

  beforeAll(async () => {
    await connectDatabase();
    await Application.syncIndexes();
    await User.create({ _id: owner, email: `${owner}@example.test`, username: `o_${owner}`, role: 'user', status: 'active' });
    await User.create({ _id: other, email: `${other}@example.test`, username: `x_${other}`, role: 'user', status: 'active' });
    cv = (await Document.create({ owner_id: owner, type: 'cv', file_url: 'https://example.test/cv.pdf', storage_key: `k-${owner}`, file_name: 'cv.pdf', mime_type: 'application/pdf', size: 10 }))._id;
  });
  afterAll(async () => {
    await Application.deleteMany({ applicant_id: { $in: [owner, other] } });
    await JobPosting.deleteMany({ posted_by_user_id: company });
    await Enterprise.deleteMany({ creator_account_id: company });
    await Document.deleteMany({ owner_id: owner });
    await User.deleteMany({ _id: { $in: [owner, other] } });
    await disconnectDatabase();
    await mongoose.disconnect();
  });

  it('scopes list, detail, history and withdrawal to the owner (BR-APP-001)', async () => {
    const record = await application(await job('Scope Co', 'Scoped role'));
    expect((await applicationsService.list(String(other), query)).total).toBe(0);
    await expect(applicationsService.getDetail(String(other), String(record._id))).rejects.toMatchObject({ statusCode: 404 });
    await expect(applicationsService.getHistory(String(other), String(record._id), 1, 20)).rejects.toMatchObject({ statusCode: 404 });
    await expect(applicationsService.withdraw(String(other), String(record._id), 1, undefined)).rejects.toMatchObject({ statusCode: 404 });
    expect((await Application.findById(record._id))?.status).toBe('submitted');
    await Application.deleteMany({ applicant_id: owner });
  });

  it('shows the public job, company and attachment metadata without private fields', async () => {
    await Application.deleteMany({ applicant_id: owner });
    const record = await application(await job('Nova Fintech', 'Frontend Engineer'), 'under_review');
    const detail = await applicationsService.getDetail(String(owner), String(record._id));
    expect(detail).toMatchObject({ job: { title: 'Frontend Engineer', companyName: 'Nova Fintech', location: 'Hà Nội', jobType: 'Full-time', publicStatus: 'open' }, reviewStage: 'screening', version: 2, attachments: [{ type: 'cv', fileName: 'cv.pdf' }] });
    expect(JSON.stringify(detail)).not.toMatch(/file_url|storage_key|changed_by|applicant_id|example\.test/);
  });

  it('filters by one or several statuses, stage and counts every status', async () => {
    await Application.deleteMany({ applicant_id: owner });
    const submitted = await application(await job('A Co', 'One'), 'submitted');
    const review = await application(await job('B Co', 'Two'), 'under_review');
    await application(await job('C Co', 'Three'), 'hired');
    expect(await ids({ status: 'submitted' })).toEqual([String(submitted._id)]);
    expect((await ids({ status: 'submitted,under_review' })).sort()).toEqual([String(submitted._id), String(review._id)].sort());
    expect(await ids({ reviewStage: 'screening' })).toEqual([String(review._id)]);
    expect((await applicationsService.list(String(owner), query)).statusCounts).toMatchObject({ submitted: 1, under_review: 1, hired: 1, withdrawn: 0 });
  });

  it('matches the keyword against the job title or the company name, case-insensitively', async () => {
    await Application.deleteMany({ applicant_id: owner });
    await application(await job('Nova Fintech', 'Kỹ sư Frontend'));
    await application(await job('Pixel Labs', 'DevOps'));
    expect(await ids({ search: 'frontend' })).toHaveLength(1);
    expect(await ids({ search: 'PIXEL' })).toHaveLength(1);
    expect(await ids({ search: 'nothing-here' })).toHaveLength(0);
  });

  it('filters by job and by the submitted date range', async () => {
    await Application.deleteMany({ applicant_id: owner });
    const recentJob = await job('Date Co', 'Recent');
    await application(await job('Date Co', 'Old'), 'submitted', { createdAt: new Date(base) });
    await application(recentJob, 'submitted', { createdAt: new Date(base + 10 * DAY) });
    expect(await ids({ submittedFrom: new Date(base + 5 * DAY), submittedTo: new Date(base + 20 * DAY) })).toHaveLength(1);
    expect(await ids({ jobId: String(recentJob) })).toHaveLength(1);
    expect(await ids({ jobId: String(new Types.ObjectId()) })).toHaveLength(0);
  });

  it('sorts by submitted date, last update and id in both directions and pages without gaps', async () => {
    await Application.deleteMany({ applicant_id: owner });
    const first = await application(await job('S Co', 'a'), 'submitted', { createdAt: new Date(base), updatedAt: new Date(base + 9 * DAY) });
    const second = await application(await job('S Co', 'b'), 'submitted', { createdAt: new Date(base + 2 * DAY), updatedAt: new Date(base + 3 * DAY) });
    const third = await application(await job('S Co', 'c'), 'submitted', { createdAt: new Date(base + 4 * DAY), updatedAt: new Date(base + DAY) });
    const order = (a: { _id: unknown }[]) => a.map((item) => String(item._id));
    expect(await ids({ sortBy: 'submittedAt', sortOrder: 'desc' })).toEqual(order([third, second, first]));
    expect(await ids({ sortBy: 'submittedAt', sortOrder: 'asc' })).toEqual(order([first, second, third]));
    expect(await ids({ sortBy: 'latestStatusAt', sortOrder: 'desc' })).toEqual(order([first, second, third]));
    expect(await ids({ sortBy: 'id', sortOrder: 'asc' })).toEqual(order([first, second, third]).sort());
    const seen = new Set<string>();
    for (const page of [1, 2, 3]) (await applicationsService.list(String(owner), { ...query, page, limit: 1 })).items.forEach((item) => seen.add(item.id));
    expect(seen.size).toBe(3);
  });

  it('withdraws atomically, records the candidate in history and lets only one of two concurrent requests win', async () => {
    await Application.deleteMany({ applicant_id: owner });
    const record = await application(await job('W Co', 'Withdraw me'), 'under_review');
    const [a, b] = await Promise.allSettled([
      applicationsService.withdraw(String(owner), String(record._id), 2, 'changed my mind'),
      applicationsService.withdraw(String(owner), String(record._id), 2, 'changed my mind'),
    ]);
    expect([a.status, b.status].sort()).toEqual(['fulfilled', 'rejected']);
    const stored = await Application.findById(record._id).lean();
    expect(stored).toMatchObject({ status: 'withdrawn', withdrawal_reason: 'changed my mind' });
    expect(stored?.status_history.filter((item) => item.status === 'withdrawn')).toHaveLength(1);
    const history = await applicationsService.getHistory(String(owner), String(record._id), 1, 20);
    expect(history.items.at(-1)).toMatchObject({ status: 'withdrawn', actorRole: 'candidate' });
    expect(history.items.map((item) => item.actorRole)).toEqual(['candidate', 'company', 'candidate']);
  });

  it('rejects a stale version or a non-withdrawable status and leaves the record untouched (EX.3 / EX.4)', async () => {
    await Application.deleteMany({ applicant_id: owner });
    const stale = await application(await job('X Co', 'Stale'), 'submitted');
    await expect(applicationsService.withdraw(String(owner), String(stale._id), 7, undefined)).rejects.toMatchObject({ statusCode: 409 });
    expect(await Application.findById(stale._id).then((doc) => doc?.status)).toBe('submitted');
    for (const status of ['interviewing', 'offered', 'hired', 'rejected'] as const) {
      const closed = await application(await job('X Co', `Closed ${status}`), status);
      await expect(applicationsService.withdraw(String(owner), String(closed._id), 2, undefined)).rejects.toMatchObject({ statusCode: 400 });
      expect(await Application.findById(closed._id).then((doc) => doc?.status)).toBe(status);
    }
  });

  it('shows both records of an apply-again pair, linked, each with its own history (BR-APP-010)', async () => {
    await Application.deleteMany({ applicant_id: owner });
    const sharedJob = await job('Pair Co', 'Pair role');
    const first = await application(sharedJob, 'withdrawn');
    const second = await application(sharedJob, 'submitted', { reapplied_from: first._id, createdAt: new Date(base + 5 * DAY) });
    await Application.updateOne({ _id: first._id }, { $set: { reapplied_as: second._id } }, { timestamps: false });
    const list = (await applicationsService.list(String(owner), query)).items;
    expect(list).toHaveLength(2);
    expect(list.find((item) => item.id === String(first._id))).toMatchObject({ status: 'withdrawn', reappliedAs: String(second._id), canApplyAgain: false });
    expect(list.find((item) => item.id === String(second._id))).toMatchObject({ status: 'submitted', reappliedFrom: String(first._id), canWithdraw: true });
    expect((await applicationsService.getHistory(String(owner), String(second._id), 1, 20)).total).toBe(1);
  });
});
