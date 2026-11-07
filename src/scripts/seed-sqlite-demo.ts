import 'dotenv/config';
import bcrypt from 'bcryptjs';
import type { Types } from 'mongoose';

import { generateId, initSqliteDatabase } from '../config/sqlite.js';
import {
  accounts,
  applications,
  enterprises,
  jobPostings,
  notifications,
  users,
  wishlists,
} from '../db/schema/index.js';

const BCRYPT_SALT_ROUNDS = 10;

export async function seedSqliteDemo(): Promise<void> {
  console.info('Initializing SQLite database & schema...');
  const db = initSqliteDatabase();

  const defaultPassword = 'Password123456!';
  const passwordHash = await bcrypt.hash(defaultPassword, BCRYPT_SALT_ROUNDS);

  console.info('Seeding demo users & accounts...');
  const adminId = generateId();
  const entAdminId = generateId();
  const recruiterId = generateId();
  const applicantId = generateId();
  const enterpriseId = generateId();

  // 1. Users
  db.insert(users)
    .values([
      {
        id: adminId,
        email: 'admin@example.com',
        username: 'admin',
        role: 'admin',
        status: 'active',
        full_name: 'System Administrator',
        email_verified: true,
      },
      {
        id: entAdminId,
        email: 'enterprise_admin@example.com',
        username: 'entadmin',
        role: 'enterprise_admin',
        status: 'active',
        full_name: 'FPT Tech Lead',
        enterprise_id: enterpriseId,
        email_verified: true,
      },
      {
        id: recruiterId,
        email: 'recruiter@example.com',
        username: 'recruiter',
        role: 'recruiter',
        status: 'active',
        full_name: 'FPT Recruiter',
        enterprise_id: enterpriseId,
        email_verified: true,
      },
      {
        id: applicantId,
        email: 'candidate@example.com',
        username: 'candidate',
        role: 'applicant',
        status: 'active',
        full_name: 'Nguyen Van Candidate',
        email_verified: true,
      },
    ])
    .onConflictDoNothing()
    .run();

  // 2. Accounts (Local login)
  db.insert(accounts)
    .values([
      {
        id: generateId(),
        user_id: adminId,
        provider: 'local',
        password_hash: passwordHash,
      },
      {
        id: generateId(),
        user_id: entAdminId,
        provider: 'local',
        password_hash: passwordHash,
      },
      {
        id: generateId(),
        user_id: recruiterId,
        provider: 'local',
        password_hash: passwordHash,
      },
      {
        id: generateId(),
        user_id: applicantId,
        provider: 'local',
        password_hash: passwordHash,
      },
    ])
    .onConflictDoNothing()
    .run();

  // 3. Enterprise
  console.info('Seeding demo enterprise & job postings...');
  db.insert(enterprises)
    .values([
      {
        id: enterpriseId,
        name: 'FPT Software',
        legal_name: 'FPT Software Company Limited',
        tax_code: '0101248141',
        email: 'contact@fpt-software.com',
        phone: '+842473007300',
        website: 'https://fptsoftware.com',
        industry: 'Information Technology',
        company_size: '1000+',
        company_type: 'Outsourcing',
        status: 'active',
        creator_account_id: entAdminId,
        is_deleted: false,
        address: {
          street: 'FPT Tower, 10 Pham Van Bach',
          city: 'Ha Noi',
          country: 'Vietnam',
        },
        tech_stack: ['TypeScript', 'Node.js', 'React', 'MongoDB', 'SQLite', 'Docker'],
        benefits: ['13th month salary', 'Premium healthcare', 'Hybrid work', 'Overseas onsite opportunities'],
      },
    ])
    .onConflictDoNothing()
    .run();

  // 4. Job Postings
  const job1Id = generateId();
  const job2Id = generateId();
  db.insert(jobPostings)
    .values([
      {
        id: job1Id,
        enterprise_id: enterpriseId,
        posted_by_user_id: recruiterId,
        title: 'Senior Fullstack Engineer (Node.js & React)',
        slug: 'senior-fullstack-engineer-fpt-001',
        location: 'Ha Noi (Hybrid)',
        employment_type: 'Full-time',
        level: 'Senior',
        salary_min: 30000000,
        salary_max: 55000000,
        currency: 'VND',
        openings: 3,
        status: 'published',
        published_at: new Date(),
        description: 'Lead backend and frontend feature development with high scalability.',
        requirements: '3+ years experience with Node.js, TypeScript, RESTful APIs, and relational databases.',
      },
      {
        id: job2Id,
        enterprise_id: enterpriseId,
        posted_by_user_id: recruiterId,
        title: 'DevOps / Cloud Engineer',
        slug: 'devops-cloud-engineer-fpt-002',
        location: 'Ho Chi Minh City',
        employment_type: 'Full-time',
        level: 'Middle',
        salary_min: 25000000,
        salary_max: 45000000,
        currency: 'VND',
        openings: 2,
        status: 'published',
        published_at: new Date(),
        description: 'Maintain CI/CD pipelines, Docker containerization, and cloud infrastructure.',
        requirements: 'Experience with Linux, Docker, CI/CD, Kubernetes, and AWS/GCP.',
      },
    ])
    .onConflictDoNothing()
    .run();

  // 5. Wishlist
  console.info('Seeding sample wishlist & applications...');
  db.insert(wishlists)
    .values([
      {
        id: generateId(),
        user_id: applicantId,
        job_id: job1Id,
      },
    ])
    .onConflictDoNothing()
    .run();

  // 6. Application
  const dummyCvId = generateId();
  db.insert(applications)
    .values([
      {
        id: generateId(),
        job_id: job1Id,
        applicant_id: applicantId,
        cv_id: dummyCvId,
        status: 'submitted',
        message: 'I am excited to apply for the Senior Fullstack Engineer position at FPT Software.',
        status_history: [
          {
            status: 'submitted',
            changed_at: new Date(),
            changed_by: applicantId as unknown as Types.ObjectId,
            note: 'Initial submission',
          },
        ],
        certificates: [],
        notes: [],
      },
    ])
    .onConflictDoNothing()
    .run();

  // 7. Notification
  db.insert(notifications)
    .values([
      {
        id: generateId(),
        user_id: applicantId,
        type: 'application_submitted',
        title: 'Application Submitted Successfully',
        body: 'Your application for Senior Fullstack Engineer has been received by FPT Software.',
      },
    ])
    .onConflictDoNothing()
    .run();

  console.info('✅ SQLite demo database seeded successfully!');
  console.info('----------------------------------------------');
  console.info('Accounts seeded (password for all: Password123456!):');
  console.info('1. Admin:            admin@example.com');
  console.info('2. Enterprise Admin: enterprise_admin@example.com');
  console.info('3. Recruiter:        recruiter@example.com');
  console.info('4. Candidate:        candidate@example.com');
  console.info('----------------------------------------------');
}

seedSqliteDemo()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed to seed demo database:', err);
    process.exit(1);
  });
