import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { Account } from '../models/account.model.js';
import { Document, type DocumentType } from '../models/document.model.js';
import { User } from '../models/user.model.js';

const TEST_PASSWORD = 'DocumentE2E123!';
const BCRYPT_ROUNDS = 10;
const STORAGE_BASE_URL =
  process.env.E2E_DOCUMENT_STORAGE_URL ?? 'http://127.0.0.1:3201';
const E2E_STORAGE_PREFIX = 'e2e-documents/';

type CandidateFixture = {
  id: string;
  email: string;
  username: string;
  fullName: string;
};

type DocumentFixture = {
  id: string;
  ownerId: string;
  type: DocumentType;
  fileName: string;
  storagePath: string;
  isDefault?: boolean;
  createdAt: string;
};

export const DOCUMENT_E2E_CANDIDATES = {
  applicantA: {
    id: '00000000000000000000d001',
    email: 'document-applicant-a@example.test',
    username: 'document-applicant-a',
    fullName: 'Document Applicant A',
  },
  applicantB: {
    id: '00000000000000000000d002',
    email: 'document-applicant-b@example.test',
    username: 'document-applicant-b',
    fullName: 'Document Applicant B',
  },
} as const satisfies Record<string, CandidateFixture>;

const ownerA = DOCUMENT_E2E_CANDIDATES.applicantA.id;
const ownerB = DOCUMENT_E2E_CANDIDATES.applicantB.id;

export const DOCUMENT_E2E_DOCUMENTS: readonly DocumentFixture[] = [
  { id: '00000000000000000000e101', ownerId: ownerA, type: 'cv', fileName: 'Alice_Default_CV.pdf', storagePath: 'alice-default-cv.pdf', isDefault: true, createdAt: '2026-09-01T01:00:00.000Z' },
  { id: '00000000000000000000e102', ownerId: ownerA, type: 'cv', fileName: 'Alice_React_(Senior)_CV.pdf', storagePath: 'alice-secondary-cv.pdf', createdAt: '2026-09-02T01:00:00.000Z' },
  { id: '00000000000000000000e103', ownerId: ownerA, type: 'cv', fileName: 'Alice_Delete_Me_CV.pdf', storagePath: 'alice-delete-cv.pdf', createdAt: '2026-09-03T01:00:00.000Z' },
  { id: '00000000000000000000e104', ownerId: ownerA, type: 'cv', fileName: 'Alice_Storage_Failure_CV.pdf', storagePath: 'unavailable.pdf', createdAt: '2026-09-04T01:00:00.000Z' },
  { id: '00000000000000000000e105', ownerId: ownerA, type: 'cv', fileName: 'Alice_Slow_Preview_CV.pdf', storagePath: 'slow/alice-slow-cv.pdf', createdAt: '2026-09-05T01:00:00.000Z' },
  { id: '00000000000000000000e106', ownerId: ownerA, type: 'cv', fileName: 'Alice_Backend_CV.pdf', storagePath: 'alice-backend-cv.pdf', createdAt: '2026-09-06T01:00:00.000Z' },
  { id: '00000000000000000000e107', ownerId: ownerA, type: 'cv', fileName: 'Alice_Cloud_CV.pdf', storagePath: 'alice-cloud-cv.pdf', createdAt: '2026-09-07T01:00:00.000Z' },
  { id: '00000000000000000000e108', ownerId: ownerA, type: 'cv', fileName: 'Alice_Data_CV.pdf', storagePath: 'alice-data-cv.pdf', createdAt: '2026-09-08T01:00:00.000Z' },
  { id: '00000000000000000000e109', ownerId: ownerA, type: 'cv', fileName: 'Alice_DevOps_CV.pdf', storagePath: 'alice-devops-cv.pdf', createdAt: '2026-09-09T01:00:00.000Z' },
  { id: '00000000000000000000e10a', ownerId: ownerA, type: 'cv', fileName: 'Alice_Frontend_CV.pdf', storagePath: 'alice-frontend-cv.pdf', createdAt: '2026-09-10T01:00:00.000Z' },
  { id: '00000000000000000000e201', ownerId: ownerA, type: 'cover_letter', fileName: 'Alice_Default_Cover_Letter.pdf', storagePath: 'alice-default-cover.pdf', isDefault: true, createdAt: '2026-09-11T01:00:00.000Z' },
  { id: '00000000000000000000e202', ownerId: ownerA, type: 'cover_letter', fileName: 'Alice_Product_Cover_Letter.pdf', storagePath: 'alice-secondary-cover.pdf', createdAt: '2026-09-12T01:00:00.000Z' },
  { id: '00000000000000000000e203', ownerId: ownerA, type: 'cover_letter', fileName: 'Alice_Delete_Me_Cover_Letter.pdf', storagePath: 'alice-delete-cover.pdf', createdAt: '2026-09-13T01:00:00.000Z' },
  { id: '00000000000000000000e204', ownerId: ownerA, type: 'cover_letter', fileName: 'Alice_Storage_Failure_Cover.pdf', storagePath: 'unavailable.pdf', createdAt: '2026-09-14T01:00:00.000Z' },
  { id: '00000000000000000000e301', ownerId: ownerB, type: 'cv', fileName: 'Bob_Private_CV.pdf', storagePath: 'bob-private-cv.pdf', isDefault: true, createdAt: '2026-09-15T01:00:00.000Z' },
  { id: '00000000000000000000e302', ownerId: ownerB, type: 'cover_letter', fileName: 'Bob_Private_Cover_Letter.pdf', storagePath: 'bob-private-cover.pdf', isDefault: true, createdAt: '2026-09-16T01:00:00.000Z' },
];

const candidateIds = Object.values(DOCUMENT_E2E_CANDIDATES).map(
  ({ id }) => new mongoose.Types.ObjectId(id),
);

async function upsertCandidate(
  candidate: CandidateFixture,
  passwordHash: string,
): Promise<void> {
  const userId = new mongoose.Types.ObjectId(candidate.id);
  await User.findOneAndUpdate(
    { _id: userId },
    {
      $set: {
        email: candidate.email,
        username: candidate.username,
        full_name: candidate.fullName,
        role: 'user',
        status: 'active',
        email_verified: true,
        enterprise_id: null,
      },
    },
    { upsert: true },
  ).exec();
  await Account.findOneAndUpdate(
    { user_id: userId, provider: 'local' },
    { $set: { password_hash: passwordHash } },
    { upsert: true },
  ).exec();
}

export async function seedDocumentE2E(): Promise<void> {
  await connectDatabase();
  try {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    for (const candidate of Object.values(DOCUMENT_E2E_CANDIDATES)) {
      await upsertCandidate(candidate, passwordHash);
    }

    await Document.deleteMany({ owner_id: { $in: candidateIds } }).exec();
    await Document.insertMany(
      DOCUMENT_E2E_DOCUMENTS.map((fixture) => ({
        _id: new mongoose.Types.ObjectId(fixture.id),
        owner_id: new mongoose.Types.ObjectId(fixture.ownerId),
        type: fixture.type,
        file_url: `${STORAGE_BASE_URL}/${fixture.storagePath}`,
        storage_key: `${E2E_STORAGE_PREFIX}${fixture.id}`,
        file_name: fixture.fileName,
        mime_type: 'application/pdf',
        size: 512,
        is_default: fixture.isDefault ?? false,
        deleted_at: null,
        createdAt: new Date(fixture.createdAt),
        updatedAt: new Date(fixture.createdAt),
      })),
    );
  } finally {
    await disconnectDatabase();
  }
}

export async function cleanupDocumentE2E(): Promise<void> {
  await connectDatabase();
  try {
    await Document.deleteMany({ owner_id: { $in: candidateIds } }).exec();
    await Account.deleteMany({ user_id: { $in: candidateIds } }).exec();
    await User.deleteMany({ _id: { $in: candidateIds } }).exec();
  } finally {
    await disconnectDatabase();
  }
}

const isDirectRun = process.argv[1]?.endsWith('seed-documents-e2e.ts') ||
  process.argv[1]?.endsWith('seed-documents-e2e.js');

if (isDirectRun) {
  const cleanup = process.argv.includes('--cleanup');
  (cleanup ? cleanupDocumentE2E() : seedDocumentE2E())
    .then(() => {
      console.info(
        cleanup
          ? 'Document E2E fixtures removed'
          : `Document E2E fixtures ready: ${DOCUMENT_E2E_CANDIDATES.applicantA.email} / ${TEST_PASSWORD}`,
      );
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
