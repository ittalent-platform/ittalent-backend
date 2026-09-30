import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { Account } from '../models/account.model.js';
import { Application, type ApplicationStatus } from '../models/application.model.js';
import { Document, type DocumentType } from '../models/document.model.js';
import { Enterprise } from '../models/enterprise.model.js';
import { JobPosting } from '../models/job-posting.model.js';
import { User } from '../models/user.model.js';

const DEMO_PASSWORD = 'Candidate123!';
export const DEMO_EMAIL = 'candidate-myapps@example.com';
// A candidate with no applications (empty state) and one whose application the demo candidate must never see.
export const EMPTY_DEMO_EMAIL = 'candidate-empty@example.com';
export const OTHER_DEMO_EMAIL = 'candidate-other@example.com';
const DEMO_USERNAME = 'candidate-myapps';
const SEED_RESET_ENV = 'SEED_RESET';
const BCRYPT_ROUNDS = 10;
const OBJECT_ID_RADIX = 16;
const OBJECT_ID_LENGTH = 24;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const PDF_MIME_TYPE = 'application/pdf';
const SAMPLE_FILE_SIZE = 120_000;
const ENTERPRISE_TAX_CODE_BASE = 8_100_000_000;
const FOREIGN_SEED_INDEX = 500;
const JOB_LIFETIME_DAYS = 90;
const PLACEHOLDER_USER_ID = new mongoose.Types.ObjectId('000000000000000000000abc');

interface SeedApplication {
  /** Index whose job this record shares; used for the BR-APP-010 apply-again pair. */
  jobIndex?: number;
  reappliedFromIndex?: number;
  company: string;
  title: string;
  location: string;
  jobType: string;
  status: ApplicationStatus;
  daysAgo: number;
  documents: readonly DocumentType[];
}

// One application per status so every column, badge and rule of the My Applications UI has data.
export const SEED_APPLICATIONS: readonly SeedApplication[] = [
  { company: 'Nova Fintech', title: 'Kỹ sư Phần mềm Frontend', location: 'Hà Nội', jobType: 'Full-time', status: 'submitted', daysAgo: 10, documents: ['cv'] },
  { company: 'DataWave', title: 'Chuyên viên Phân tích Dữ liệu', location: 'Hồ Chí Minh', jobType: 'Full-time', status: 'under_review', daysAgo: 12, documents: ['cv'] },
  { company: 'CloudBridge', title: 'Quản lý Dự án (PM)', location: 'Đà Nẵng', jobType: 'Full-time', status: 'interviewing', daysAgo: 20, documents: ['cv', 'cover_letter'] },
  { company: 'Pixel Labs', title: 'Chuyên viên DevOps', location: 'Hồ Chí Minh', jobType: 'Full-time', status: 'offered', daysAgo: 36, documents: ['cv'] },
  { company: 'Techno Vietnam', title: 'Kỹ sư Phần mềm Frontend', location: 'Hà Nội', jobType: 'Full-time', status: 'hired', daysAgo: 60, documents: ['cv'] },
  { company: 'Sunrise Apps', title: 'Thiết kế UI/UX', location: 'Remote', jobType: 'Contract', status: 'rejected', daysAgo: 15, documents: ['cv'] },
  { company: 'Nova Fintech', title: 'Chuyên viên Phân tích Dữ liệu', location: 'Hồ Chí Minh', jobType: 'Full-time', status: 'withdrawn', daysAgo: 8, documents: ['cv'] },
  // BR-APP-010: the single application that replaced the withdrawn record above (same job, own history).
  { jobIndex: 6, reappliedFromIndex: 6, company: 'Nova Fintech', title: 'Chuyên viên Phân tích Dữ liệu', location: 'Hồ Chí Minh', jobType: 'Full-time', status: 'submitted', daysAgo: 3, documents: ['cv', 'cover_letter'] },
  // A withdrawn first application on a job that is still open: the detail page offers "Apply again".
  { company: 'Lumen Tech', title: 'Kỹ sư QA Automation', location: 'Đà Nẵng', jobType: 'Full-time', status: 'withdrawn', daysAgo: 6, documents: ['cv'] },
  // Extra withdrawable records so row-menu, drag and bulk withdrawal each have their own target.
  { company: 'Helix Labs', title: 'Kỹ sư Dữ liệu', location: 'Hồ Chí Minh', jobType: 'Full-time', status: 'submitted', daysAgo: 2, documents: ['cv'] },
  { company: 'Kite Studio', title: 'Lập trình viên Mobile', location: 'Remote', jobType: 'Contract', status: 'submitted', daysAgo: 4, documents: ['cv'] },
  { company: 'Bolt Labs', title: 'Chuyên viên QA', location: 'Hà Nội', jobType: 'Part-time', status: 'submitted', daysAgo: 5, documents: ['cv'] },
  { company: 'Arc Security', title: 'Kỹ sư An ninh mạng', location: 'Hà Nội', jobType: 'Full-time', status: 'under_review', daysAgo: 7, documents: ['cv'] },
];

// Lifecycle path per status; the company moves an application one stage at a time.
const STATUS_PATHS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  submitted: ['submitted'],
  under_review: ['submitted', 'under_review'],
  interviewing: ['submitted', 'under_review', 'interviewing'],
  offered: ['submitted', 'under_review', 'interviewing', 'offered'],
  hired: ['submitted', 'under_review', 'interviewing', 'offered', 'hired'],
  rejected: ['submitted', 'under_review', 'rejected'],
  withdrawn: ['submitted', 'withdrawn'],
};

// Ids are derived from the seed index so the withdrawn <-> apply-again links and the display ids are stable.
const APPLICATION_ID_OFFSET = 1000;

function objectIdFromIndex(index: number): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId((index + 1).toString(OBJECT_ID_RADIX).padStart(OBJECT_ID_LENGTH, '0'));
}

// Deterministic id so tests can prove the demo candidate cannot read it (BR-APP-001).
export const FOREIGN_APPLICATION_ID = objectIdFromIndex(APPLICATION_ID_OFFSET + FOREIGN_SEED_INDEX).toHexString();

async function upsertCandidate(email: string, username: string): Promise<{ _id: mongoose.Types.ObjectId }> {
  const user = await User.findOneAndUpdate(
    { email },
    { $setOnInsert: { email, username, role: 'user', status: 'active', email_verified: true } },
    { upsert: true, returnDocument: 'after' },
  );
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
  await Account.updateOne(
    { user_id: user._id, provider: 'local' },
    { $setOnInsert: { user_id: user._id, provider: 'local', password_hash: passwordHash } },
    { upsert: true },
  );
  return user;
}

// The application module reads job title and company from the job and enterprise, so both must exist.
async function upsertJob(company: string, title: string, location: string, jobType: string, key: number): Promise<mongoose.Types.ObjectId> {
  const taxCode = String(ENTERPRISE_TAX_CODE_BASE + [...company].reduce((sum, char) => sum + char.charCodeAt(0), 0));
  const enterprise = await Enterprise.findOneAndUpdate(
    { tax_code: taxCode, is_deleted: false },
    { $setOnInsert: {
      name: company, tax_code: taxCode, email: `hr@${company.replace(/\s+/g, '').toLowerCase()}.example`, phone: '+84900000000', industry: 'Information Technology',
      company_size: '11-50', address: { street: '1 Demo Street', city: location, country: 'Vietnam' }, status: 'active', creator_account_id: PLACEHOLDER_USER_ID, is_deleted: false,
    } },
    { upsert: true, returnDocument: 'after' },
  );
  const job = await JobPosting.findOneAndUpdate(
    { slug: `seed-job-${key}` },
    { $setOnInsert: {
      enterprise_id: enterprise._id, posted_by_user_id: PLACEHOLDER_USER_ID, title, slug: `seed-job-${key}`, location, employment_type: jobType, currency: 'VND', status: 'published',
      openings: 5, description: `${title} at ${company}`, requirements: 'Demo requirements', benefits: 'Demo benefits',
      published_at: new Date(), expires_at: new Date(Date.now() + JOB_LIFETIME_DAYS * DAY_MS),
    } },
    { upsert: true, returnDocument: 'after' },
  );
  return job._id;
}

async function upsertDocument(ownerId: mongoose.Types.ObjectId, type: DocumentType, fileName: string): Promise<mongoose.Types.ObjectId> {
  const doc = await Document.findOneAndUpdate(
    { owner_id: ownerId, storage_key: `seed/${ownerId}/${fileName}` },
    { $setOnInsert: { owner_id: ownerId, type, file_url: `https://example.test/${fileName}`, storage_key: `seed/${ownerId}/${fileName}`, file_name: fileName, mime_type: PDF_MIME_TYPE, size: SAMPLE_FILE_SIZE } },
    { upsert: true, returnDocument: 'after' },
  );
  return doc._id;
}

export async function seedApplications(): Promise<string> {
  await connectDatabase();
  try {
    const user = await upsertCandidate(DEMO_EMAIL, DEMO_USERNAME);
    const emptyUser = await upsertCandidate(EMPTY_DEMO_EMAIL, 'candidate-empty');
    const otherUser = await upsertCandidate(OTHER_DEMO_EMAIL, 'candidate-other');
    // SEED_RESET=true rebuilds the demo data from scratch (used by the end-to-end suite).
    if (process.env[SEED_RESET_ENV] === 'true') {
      await Application.deleteMany({ applicant_id: { $in: [user._id, emptyUser._id, otherUser._id] } });
    }

    const cvId = await upsertDocument(user._id, 'cv', 'Nguyen_Van_An_CV.pdf');
    const coverLetterId = await upsertDocument(user._id, 'cover_letter', 'Cover_letter.pdf');
    const reappliedAs = new Map<number, mongoose.Types.ObjectId>();
    for (const [index, sample] of SEED_APPLICATIONS.entries()) {
      if (sample.reappliedFromIndex !== undefined) reappliedAs.set(sample.reappliedFromIndex, objectIdFromIndex(APPLICATION_ID_OFFSET + index));
    }

    for (const [index, sample] of SEED_APPLICATIONS.entries()) {
      const jobId = await upsertJob(sample.company, sample.title, sample.location, sample.jobType, sample.jobIndex ?? index);
      const submittedAt = new Date(Date.now() - sample.daysAgo * DAY_MS);
      const history = STATUS_PATHS[sample.status].map((status, step) => ({
        status,
        changed_at: new Date(submittedAt.getTime() + step * DAY_MS + step * HOUR_MS),
        // The candidate submits and withdraws; the company moves every stage in between.
        changed_by: step === 0 || status === 'withdrawn' ? user._id : PLACEHOLDER_USER_ID,
      }));
      const latest = history[history.length - 1]!.changed_at;
      const replaced = reappliedAs.get(index);
      await Application.updateOne(
        { _id: objectIdFromIndex(APPLICATION_ID_OFFSET + index) },
        { $setOnInsert: {
          job_id: jobId, applicant_id: user._id, cv_id: cvId, ...(sample.documents.includes('cover_letter') ? { cover_letter_id: coverLetterId } : {}),
          status: sample.status, status_history: history, createdAt: submittedAt, updatedAt: latest,
          ...(sample.reappliedFromIndex !== undefined ? { reapplied_from: objectIdFromIndex(APPLICATION_ID_OFFSET + sample.reappliedFromIndex) } : {}),
          ...(replaced ? { reapplied_as: replaced } : {}),
        } },
        { upsert: true, timestamps: false },
      );
    }

    // Another candidate's application, to prove the demo candidate cannot read it.
    const foreignJob = await upsertJob('Hidden Corp', 'Private role of another candidate', 'Hà Nội', 'Full-time', FOREIGN_SEED_INDEX);
    const foreignCv = await upsertDocument(otherUser._id, 'cv', 'Other_CV.pdf');
    const foreignAt = new Date(Date.now() - DAY_MS);
    await Application.updateOne(
      { _id: FOREIGN_APPLICATION_ID },
      { $setOnInsert: { job_id: foreignJob, applicant_id: otherUser._id, cv_id: foreignCv, status: 'submitted', status_history: [{ status: 'submitted', changed_at: foreignAt, changed_by: otherUser._id }], createdAt: foreignAt, updatedAt: foreignAt } },
      { upsert: true, timestamps: false },
    );
    return `Demo sign-in: ${DEMO_EMAIL} / ${DEMO_PASSWORD} (empty account: ${EMPTY_DEMO_EMAIL})`;
  } finally {
    await disconnectDatabase();
  }
}

const isDirectRun = process.argv[1]?.endsWith('seed-applications.ts') || process.argv[1]?.endsWith('seed-applications.js');

if (isDirectRun) {
  seedApplications()
    .then((message) => { console.info(message); })
    .catch((error: unknown) => { console.error(error); process.exitCode = 1; });
}
