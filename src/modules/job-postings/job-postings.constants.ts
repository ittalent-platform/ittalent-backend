import type { JobPublicationStatus, JobRecruitmentStatus } from '../../models/job-posting.model.js';

export const JOB_POSTING_MESSAGES = {
  NOT_FOUND: 'Job not found',
} as const;

// BR-12: only Published + Open job postings are visible to Guest and Applicant.
export const PUBLIC_JOB_VISIBILITY: {
  publication_status: JobPublicationStatus;
  recruitment_status: JobRecruitmentStatus;
} = {
  publication_status: 'published',
  recruitment_status: 'open',
};