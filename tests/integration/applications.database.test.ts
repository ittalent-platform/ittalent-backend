import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Application } from '../../src/models/application.model.js';
import { User } from '../../src/models/user.model.js';
import { applicationsRepository } from '../../src/modules/applications/applications.repository.js';
import { applicationsService } from '../../src/modules/applications/applications.service.js';

const uri = process.env.MONGODB_URI;
const suite = uri?.includes('ittalent_myapps_test') ? describe : describe.skip;

suite('My Applications database invariants', () => {
  const owner = new Types.ObjectId();
  const other = new Types.ObjectId();
  const job = new Types.ObjectId();
  let id: string;

  beforeAll(async () => {
    await mongoose.connect(uri!);
    await Application.syncIndexes();
    await User.create({ _id: owner, email: `${owner}@example.test`, username: String(owner), role: 'user', status: 'active' });
    await User.create({ _id: other, email: `${other}@example.test`, username: String(other), role: 'user', status: 'active' });
    const doc = await Application.create({ applicant_id: owner, job_id: job, status: 'submitted', version: 0, submitted_at: new Date(), latest_status_at: new Date(), job_snapshot: { title: 'Engineer', company_name: 'Example', public_status: 'closed' }, history: [{ status: 'submitted', actor_role: 'candidate', occurred_at: new Date() }] });
    id = String(doc._id);
  });
  afterAll(async () => { await Application.deleteMany({ applicant_id: { $in: [owner, other] } }); await User.deleteMany({ _id: { $in: [owner, other] } }); await mongoose.disconnect(); });

  it('scopes list, detail, history and withdraw to the owner', async () => {
    expect((await applicationsService.list(String(other), { page: 1, limit: 10, sortBy: 'submittedAt', sortOrder: 'desc' })).total).toBe(0);
    await expect(applicationsService.getDetail(String(other), id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(applicationsService.getHistory(String(other), id, 1, 10)).rejects.toMatchObject({ statusCode: 404 });
    await expect(applicationsService.withdraw(String(other), id, 0, undefined)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('counts statuses across the same ownership scope', async () => {
    expect((await applicationsService.list(String(owner), { page: 1, limit: 10, sortBy: 'submittedAt', sortOrder: 'desc' })).statusCounts.submitted).toBe(1);
    const matched = await applicationsService.list(String(owner), { page: 1, limit: 10, sortBy: 'submittedAt', sortOrder: 'desc', jobId: String(job), search: 'Engineer' });
    expect(matched.total).toBe(1);
    expect(matched.statusCounts.submitted).toBe(1);
    const missing = await applicationsService.list(String(owner), { page: 1, limit: 10, sortBy: 'submittedAt', sortOrder: 'desc', jobId: String(new Types.ObjectId()) });
    expect(missing.total).toBe(0);
    expect(missing.statusCounts.submitted).toBe(0);
  });

  it('guards unique applicant/job pair and atomic concurrent withdrawal', async () => {
    await expect(Application.create({ applicant_id: owner, job_id: job, status: 'submitted', submitted_at: new Date(), latest_status_at: new Date(), job_snapshot: { title: 'Duplicate', company_name: 'Example', public_status: 'closed' } })).rejects.toMatchObject({ code: 11000 });
    const [first, second] = await Promise.all([
      applicationsRepository.withdrawAtomically(id, String(owner), 0, undefined),
      applicationsRepository.withdrawAtomically(id, String(owner), 0, undefined),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    const updated = await Application.findById(id);
    expect(updated?.status).toBe('withdrawn');
    expect(updated?.history.filter((event) => event.status === 'withdrawn')).toHaveLength(1);
    const history = await applicationsService.getHistory(String(owner), id, 1, 10);
    expect(history.items[1]).toEqual(expect.objectContaining({ status: 'withdrawn', actorRole: 'candidate' }));
    expect(JSON.stringify(history)).not.toMatch(/account_id|note|reviewer/);
  });
});

// UC-MYAPP-01 / 05 / BR-APP-008 behaviours that only a real database can prove.
suite('My Applications list, filters and reapplication invariants', () => {
  const candidate = new Types.ObjectId();
  const day = 86_400_000;
  const base = Date.now() - 30 * day;
  const query = { page: 1, limit: 20, sortBy: 'submittedAt', sortOrder: 'desc' } as const;

  const make = (jobId: Types.ObjectId, overrides: Record<string, unknown> = {}) => Application.create({
    applicant_id: candidate,
    job_id: jobId,
    status: 'submitted',
    version: 0,
    submitted_at: new Date(base),
    latest_status_at: new Date(base),
    job_snapshot: { title: 'Engineer', company_name: 'Example', public_status: 'open' },
    history: [{ status: 'submitted', actor_role: 'candidate', occurred_at: new Date(base) }],
    ...overrides,
  });

  beforeAll(async () => {
    await mongoose.connect(uri!);
    await Application.syncIndexes();
    await User.create({ _id: candidate, email: `${candidate}@example.test`, username: String(candidate), role: 'user', status: 'active' });
  });
  afterAll(async () => { await Application.deleteMany({ applicant_id: candidate }); await User.deleteMany({ _id: candidate }); await mongoose.disconnect(); });

  it('filters by one or several statuses and counts every status including position_filled', async () => {
    await Application.deleteMany({ applicant_id: candidate });
    await make(new Types.ObjectId(), { status: 'submitted' });
    await make(new Types.ObjectId(), { status: 'under_review' });
    await make(new Types.ObjectId(), { status: 'position_filled' });
    await make(new Types.ObjectId(), { status: 'hired' });

    expect((await applicationsService.list(String(candidate), { ...query, status: 'submitted' })).total).toBe(1);
    const several = await applicationsService.list(String(candidate), { ...query, status: 'submitted,position_filled' });
    expect(several.items.map((item) => item.status).sort()).toEqual(['position_filled', 'submitted']);
    const all = await applicationsService.list(String(candidate), query);
    expect(all.statusCounts).toMatchObject({ submitted: 1, under_review: 1, position_filled: 1, hired: 1, withdrawn: 0 });
  });

  it('sorts by submitted date, last update and id in both directions with a stable tie-break', async () => {
    await Application.deleteMany({ applicant_id: candidate });
    const oldest = await make(new Types.ObjectId(), { submitted_at: new Date(base), latest_status_at: new Date(base + 9 * day) });
    const middle = await make(new Types.ObjectId(), { submitted_at: new Date(base + 2 * day), latest_status_at: new Date(base + 3 * day) });
    const newest = await make(new Types.ObjectId(), { submitted_at: new Date(base + 4 * day), latest_status_at: new Date(base + day) });
    const ids = async (sortBy: 'id' | 'latestStatusAt' | 'submittedAt', sortOrder: 'asc' | 'desc') => (await applicationsService.list(String(candidate), { ...query, sortBy, sortOrder })).items.map((item) => item.id);

    expect(await ids('submittedAt', 'desc')).toEqual([String(newest._id), String(middle._id), String(oldest._id)]);
    expect(await ids('submittedAt', 'asc')).toEqual([String(oldest._id), String(middle._id), String(newest._id)]);
    expect(await ids('latestStatusAt', 'desc')).toEqual([String(oldest._id), String(middle._id), String(newest._id)]);
    expect(await ids('id', 'asc')).toEqual([String(oldest._id), String(middle._id), String(newest._id)].sort());
  });

  it('paginates the sorted result without repeating or skipping rows', async () => {
    await Application.deleteMany({ applicant_id: candidate });
    for (let index = 0; index < 5; index += 1) await make(new Types.ObjectId(), { submitted_at: new Date(base) });
    const seen = new Set<string>();
    for (const page of [1, 2, 3]) {
      (await applicationsService.list(String(candidate), { ...query, page, limit: 2 })).items.forEach((item) => seen.add(item.id));
    }
    expect(seen.size).toBe(5);
  });

  it('matches the keyword against job title or company name, case-insensitively', async () => {
    await Application.deleteMany({ applicant_id: candidate });
    await make(new Types.ObjectId(), { job_snapshot: { title: 'Kỹ sư Frontend', company_name: 'Nova Fintech', public_status: 'open' } });
    await make(new Types.ObjectId(), { job_snapshot: { title: 'DevOps', company_name: 'Pixel Labs', public_status: 'open' } });
    expect((await applicationsService.list(String(candidate), { ...query, search: 'frontend' })).total).toBe(1);
    expect((await applicationsService.list(String(candidate), { ...query, search: 'PIXEL' })).total).toBe(1);
    expect((await applicationsService.list(String(candidate), { ...query, search: 'nothing' })).total).toBe(0);
  });

  it('filters by the submitted date range and review stage', async () => {
    await Application.deleteMany({ applicant_id: candidate });
    await make(new Types.ObjectId(), { submitted_at: new Date(base), review_stage: 'screening' });
    await make(new Types.ObjectId(), { submitted_at: new Date(base + 10 * day), review_stage: 'interview' });
    const window = await applicationsService.list(String(candidate), { ...query, submittedFrom: new Date(base + 5 * day), submittedTo: new Date(base + 20 * day) });
    expect(window.total).toBe(1);
    expect((await applicationsService.list(String(candidate), { ...query, reviewStage: 'screening' })).total).toBe(1);
  });

  // BR-APP-008: a Withdrawn record frees the pair for exactly one active reapplication.
  it('allows one active application per pair, and a reapplication only after a withdrawal', async () => {
    await Application.deleteMany({ applicant_id: candidate });
    const job = new Types.ObjectId();
    const first = await make(job);
    await expect(make(job)).rejects.toMatchObject({ code: 11000 });

    await applicationsRepository.withdrawAtomically(String(first._id), String(candidate), 0, 'changed my mind');
    const again = await make(job, { reapplied_from: first._id });
    await Application.updateOne({ _id: first._id }, { reapplied_as: again._id });
    await expect(make(job)).rejects.toMatchObject({ code: 11000 });

    const detail = await applicationsService.getDetail(String(candidate), String(first._id));
    expect(detail).toMatchObject({ status: 'withdrawn', reappliedAs: String(again._id), canApplyAgain: false });
    const replacement = await applicationsService.getDetail(String(candidate), String(again._id));
    expect(replacement).toMatchObject({ status: 'submitted', reappliedFrom: String(first._id), canWithdraw: true });
    // Histories stay per record: the reapplication starts its own, never a copy of the withdrawn one.
    expect((await applicationsService.getHistory(String(candidate), String(again._id), 1, 10)).items).toHaveLength(1);
    expect((await applicationsService.list(String(candidate), query)).total).toBe(2);
  });

  it('never lets a candidate withdraw a position_filled or rejected record', async () => {
    await Application.deleteMany({ applicant_id: candidate });
    const filled = await make(new Types.ObjectId(), { status: 'position_filled' });
    await expect(applicationsService.withdraw(String(candidate), String(filled._id), 0, undefined)).rejects.toMatchObject({ statusCode: 400 });
    expect((await Application.findById(filled._id))?.status).toBe('position_filled');
  });

  it('rejects a stale version and leaves the record untouched (UC-MYAPP-04.EX.4)', async () => {
    await Application.deleteMany({ applicant_id: candidate });
    const record = await make(new Types.ObjectId(), { status: 'under_review', version: 3 });
    await expect(applicationsService.withdraw(String(candidate), String(record._id), 2, undefined)).rejects.toMatchObject({ statusCode: 409 });
    const stored = await Application.findById(record._id);
    expect(stored).toMatchObject({ status: 'under_review', version: 3 });
    expect(stored?.history).toHaveLength(1);
  });
});
