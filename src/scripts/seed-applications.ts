import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import { connectDatabase, disconnectDatabase } from '../config/db.js';
import {
  Application,
  type ApplicationActorRole,
  type ApplicationAttachmentType,
  type ApplicationHistoryEntryData,
  type ApplicationReviewStage,
  type ApplicationStatus,
} from '../models/application.model.js';
import { Account } from '../models/account.model.js';
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

interface SeedApplication {
  /** Index whose job id this record shares; defaults to its own index. Used for BR-APP-008 reapplications. */
  jobIndex?: number;
  reappliedFromIndex?: number;
  company: string;
  title: string;
  location: string;
  jobType: string;
  status: ApplicationStatus;
  daysAgo: number;
  documents: readonly ApplicationAttachmentType[];
}

// One application per pipeline status so every column, badge and rule of the My Applications UI has data.
export const SEED_APPLICATIONS: readonly SeedApplication[] = [
  { company: 'Nova Fintech', title: 'Kỹ sư Phần mềm Frontend', location: 'Hà Nội', jobType: 'Full-time', status: 'submitted', daysAgo: 10, documents: ['cv'] },
  { company: 'DataWave', title: 'Chuyên viên Phân tích Dữ liệu', location: 'Hồ Chí Minh', jobType: 'Full-time', status: 'under_review', daysAgo: 12, documents: ['cv'] },
  { company: 'CloudBridge', title: 'Quản lý Dự án (PM)', location: 'Đà Nẵng', jobType: 'Full-time', status: 'interviewing', daysAgo: 20, documents: ['cv', 'cover_letter'] },
  { company: 'Pixel Labs', title: 'Chuyên viên DevOps', location: 'Hồ Chí Minh', jobType: 'Full-time', status: 'offered', daysAgo: 36, documents: ['cv'] },
  { company: 'Techno Vietnam', title: 'Kỹ sư Phần mềm Frontend', location: 'Hà Nội', jobType: 'Full-time', status: 'hired', daysAgo: 60, documents: ['cv'] },
  { company: 'Sunrise Apps', title: 'Thiết kế UI/UX', location: 'Remote', jobType: 'Contract', status: 'rejected', daysAgo: 15, documents: ['cv'] },
  { company: 'Nova Fintech', title: 'Chuyên viên Phân tích Dữ liệu', location: 'Hồ Chí Minh', jobType: 'Full-time', status: 'withdrawn', daysAgo: 8, documents: ['cv'] },
  { company: 'Orbit Systems', title: 'Kỹ sư Backend', location: 'Hà Nội', jobType: 'Full-time', status: 'position_filled', daysAgo: 25, documents: ['cv'] },
  // BR-APP-008: the single reapplication that replaced the withdrawn record above (same job, own history).
  { jobIndex: 6, reappliedFromIndex: 6, company: 'Nova Fintech', title: 'Chuyên viên Phân tích Dữ liệu', location: 'Hồ Chí Minh', jobType: 'Full-time', status: 'submitted', daysAgo: 3, documents: ['cv', 'cover_letter'] },
  // A withdrawn first application on a job that is still open: the detail page offers "Apply again".
  { company: 'Lumen Tech', title: 'Kỹ sư QA Automation', location: 'Đà Nẵng', jobType: 'Full-time', status: 'withdrawn', daysAgo: 6, documents: ['cv'] },
  // Extra withdrawable records so row-menu, drag and bulk withdrawal each have their own target.
  { company: 'Helix Labs', title: 'Kỹ sư Dữ liệu', location: 'Hồ Chí Minh', jobType: 'Full-time', status: 'submitted', daysAgo: 2, documents: ['cv'] },
  { company: 'Kite Studio', title: 'Lập trình viên Mobile', location: 'Remote', jobType: 'Contract', status: 'submitted', daysAgo: 4, documents: ['cv'] },
  { company: 'Bolt Labs', title: 'Chuyên viên QA', location: 'Hà Nội', jobType: 'Part-time', status: 'submitted', daysAgo: 5, documents: ['cv'] },
  { company: 'Arc Security', title: 'Kỹ sư An ninh mạng', location: 'Hà Nội', jobType: 'Full-time', status: 'under_review', daysAgo: 7, documents: ['cv'] },
];

// Lifecycle path per terminal status; the company moves an application one stage at a time.
const STATUS_PATHS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  submitted: ['submitted'],
  under_review: ['submitted', 'under_review'],
  interviewing: ['submitted', 'under_review', 'interviewing'],
  offered: ['submitted', 'under_review', 'interviewing', 'offered'],
  hired: ['submitted', 'under_review', 'interviewing', 'offered', 'hired'],
  rejected: ['submitted', 'under_review', 'rejected'],
  withdrawn: ['submitted', 'withdrawn'],
  position_filled: ['submitted', 'under_review', 'position_filled'],
};

// Application ids are derived from the seed index so the withdrawn <-> reapplication links are stable.
const APPLICATION_ID_OFFSET = 1000;
const FOREIGN_SEED_INDEX = 500;

// Public-facing stage label shown with each status (UC-MYAPP-01 postcondition 3).
const REVIEW_STAGES: Partial<Record<ApplicationStatus, ApplicationReviewStage>> = {
  under_review: 'screening',
  interviewing: 'interview',
  offered: 'offer',
  hired: 'hired',
  rejected: 'rejected',
};

function objectIdFromIndex(index: number): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId((index + 1).toString(OBJECT_ID_RADIX).padStart(OBJECT_ID_LENGTH, '0'));
}

function actorFor(status: ApplicationStatus, isFirst: boolean): ApplicationActorRole {
  if (isFirst || status === 'withdrawn') return 'candidate';
  return status === 'position_filled' ? 'system' : 'company';
}

function buildHistory(status: ApplicationStatus, submittedAt: Date): ApplicationHistoryEntryData[] {
  return STATUS_PATHS[status].map((step, index) => ({
    status: step,
    actor_role: actorFor(step, index === 0),
    occurred_at: new Date(submittedAt.getTime() + index * DAY_MS + index * HOUR_MS),
  }));
}

async function upsertCandidate(email: string, username: string): Promise<{ _id: mongoose.Types.ObjectId }> {
  const user = await User.findOneAndUpdate(
    { email },
    { $setOnInsert: { email, username, role: 'user', status: 'active' } },
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

// Deterministic id so tests can prove the demo candidate cannot read it (BR-APP-001).
export const FOREIGN_APPLICATION_ID = objectIdFromIndex(APPLICATION_ID_OFFSET + FOREIGN_SEED_INDEX).toHexString();

async function seedForeignApplication(applicantId: mongoose.Types.ObjectId): Promise<void> {
  const submittedAt = new Date(Date.now() - DAY_MS);
  await Application.updateOne(
    { _id: FOREIGN_APPLICATION_ID },
    { $setOnInsert: {
      applicant_id: applicantId,
      job_id: objectIdFromIndex(FOREIGN_SEED_INDEX),
      status: 'submitted',
      version: 0,
      job_snapshot: { title: 'Private role of another candidate', company_name: 'Hidden Corp', public_status: 'open' },
      attachments: [],
      submitted_at: submittedAt,
      latest_status_at: submittedAt,
      history: [{ status: 'submitted', actor_role: 'candidate', occurred_at: submittedAt }],
    } },
    { upsert: true },
  );
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
    await seedForeignApplication(otherUser._id);

    const reappliedAs = new Map<number, mongoose.Types.ObjectId>();
    for (const [index, sample] of SEED_APPLICATIONS.entries()) {
      if (sample.reappliedFromIndex !== undefined) reappliedAs.set(sample.reappliedFromIndex, objectIdFromIndex(APPLICATION_ID_OFFSET + index));
    }

    for (const [index, sample] of SEED_APPLICATIONS.entries()) {
      const jobId = objectIdFromIndex(sample.jobIndex ?? index);
      const submittedAt = new Date(Date.now() - sample.daysAgo * DAY_MS);
      const history = buildHistory(sample.status, submittedAt);
      const latest = history[history.length - 1]!.occurred_at;
      const reapplication = reappliedAs.get(index);
      await Application.updateOne(
        { _id: objectIdFromIndex(APPLICATION_ID_OFFSET + index) },
        { $setOnInsert: {
          applicant_id: user._id,
          job_id: jobId,
          status: sample.status,
          version: history.length - 1,
          job_snapshot: { title: sample.title, company_name: sample.company, location: sample.location, job_type: sample.jobType, public_status: 'open' },
          attachments: sample.documents.map((type) => ({
            document_id: new mongoose.Types.ObjectId(),
            type,
            file_name: type === 'cv' ? 'Nguyen_Van_An_CV.pdf' : `Cover_letter_${sample.company.replace(/\s+/g, '')}.pdf`,
            mime_type: PDF_MIME_TYPE,
            size: SAMPLE_FILE_SIZE,
            submitted_at: submittedAt,
          })),
          submitted_at: submittedAt,
          latest_status_at: latest,
          history,
          ...(REVIEW_STAGES[sample.status] ? { review_stage: REVIEW_STAGES[sample.status] } : {}),
          ...(sample.status === 'withdrawn' ? { withdrawn_at: latest } : {}),
          ...(sample.reappliedFromIndex !== undefined ? { reapplied_from: objectIdFromIndex(APPLICATION_ID_OFFSET + sample.reappliedFromIndex) } : {}),
          ...(reapplication ? { reapplied_as: reapplication } : {}),
        } },
        { upsert: true },
      );
    }
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
