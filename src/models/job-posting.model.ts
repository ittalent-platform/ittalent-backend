import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export const jobPublicationStatuses = ['draft', 'published'] as const;
export type JobPublicationStatus = (typeof jobPublicationStatuses)[number];

export const jobRecruitmentStatuses = ['open', 'closed'] as const;
export type JobRecruitmentStatus = (typeof jobRecruitmentStatuses)[number];

export const jobEmploymentTypes = ['full_time', 'part_time', 'internship', 'contract', 'remote'] as const;
export type JobEmploymentType = (typeof jobEmploymentTypes)[number];

export interface JobPostingData {
  enterprise_id: Types.ObjectId;
  title: string;
  location?: string;
  employment_type?: JobEmploymentType;
  level?: string;
  salary_min?: number;
  salary_max?: number;
  currency?: string;
  description?: string;
  requirements?: string;
  benefits?: string;
  openings: number;
  deadline?: Date;
  publication_status: JobPublicationStatus;
  recruitment_status: JobRecruitmentStatus;
}

const jobPostingSchema = new Schema<JobPostingData>(
  {
    enterprise_id: { type: Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },
    title: { type: String, required: true, trim: true },
    location: { type: String, trim: true },
    employment_type: { type: String, enum: jobEmploymentTypes },
    level: { type: String, trim: true },
    salary_min: { type: Number, min: 0 },
    salary_max: { type: Number, min: 0 },
    currency: { type: String, trim: true },
    description: { type: String, trim: true },
    requirements: { type: String, trim: true },
    benefits: { type: String, trim: true },
    openings: { type: Number, min: 1, default: 1, required: true },
    deadline: { type: Date },
    publication_status: { type: String, enum: jobPublicationStatuses, default: 'draft', required: true },
    recruitment_status: { type: String, enum: jobRecruitmentStatuses, default: 'open', required: true },
  },
  {
    timestamps: true,
    collection: 'job_postings',
  },
);

// Public list only shows Published + Open, newest first (_id keeps pagination deterministic).
jobPostingSchema.index({ publication_status: 1, recruitment_status: 1, createdAt: -1, _id: -1 });

export const JobPosting = model('JobPosting', jobPostingSchema);
export type JobPostingDoc = JobPostingData & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};