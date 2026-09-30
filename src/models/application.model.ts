import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export interface ApplicationData {
  job_posting_id: Types.ObjectId;
}

const applicationSchema = new Schema<ApplicationData>(
  {
    job_posting_id: {
      type: Schema.Types.ObjectId,
      ref: 'JobPosting',
      required: true,
      index: true,
    },
  },
  {
    collection: 'applications',
    strict: false,
  },
);

export const Application = model<ApplicationData>('Application', applicationSchema);
