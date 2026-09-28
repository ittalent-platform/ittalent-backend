import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export const jobPostingStatuses = ['draft', 'published', 'archived'] as const;
export type JobPostingStatus = (typeof jobPostingStatuses)[number];

export interface JobPostingData {
  posted_by_user_id: Types.ObjectId;
  title: string;
  slug: string;
  location?: string;
  employment_type?: string;
  salary_min?: number;
  salary_max?: number;
  currency: string;
  level?: string;
  description?: string;
  requirements?: string;
  benefits?: string;
  openings?: number;
  status: JobPostingStatus;
  published_at?: Date;
  archived_at?: Date;
  expires_at?: Date;
}

const jobPostingSchema = new Schema<JobPostingData>(
  {
    posted_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    location: { type: String, trim: true },
    employment_type: { type: String, trim: true },
    salary_min: { type: Number, min: 0 },
    salary_max: { type: Number, min: 0 },
    currency: { type: String, default: 'VND', trim: true },
    level: { type: String, trim: true },
    description: { type: String, trim: true },
    requirements: { type: String, trim: true },
    benefits: { type: String, trim: true },
    openings: { type: Number, min: 1, validate: Number.isInteger },
    status: { type: String, enum: jobPostingStatuses, default: 'draft', index: true },
    published_at: { type: Date },
    archived_at: { type: Date },
    expires_at: { type: Date },
  },
  { timestamps: true, collection: 'job_postings' },
);

jobPostingSchema.index({ status: 1, createdAt: -1 });
jobPostingSchema.index({ title: 'text', location: 'text' });

export const JobPosting = model<JobPostingData>('JobPosting', jobPostingSchema);
export type JobPostingDoc = ReturnType<typeof JobPosting.prototype.toObject> & { _id: Types.ObjectId };
