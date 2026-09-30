import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

import { JOB_AUDIT_ACTIONS, type JobAuditAction } from '../modules/job-postings/job-postings.constants.js';

export interface JobPostingAuditEventData {
  job_posting_id: Types.ObjectId;
  enterprise_id: Types.ObjectId;
  actor_user_id: Types.ObjectId;
  action: JobAuditAction;
  result: 'success';
  /** Title at the time of the action — the job may no longer exist after a delete. */
  job_title: string;
  /** Names of the fields an update changed. */
  changed_fields?: string[];
}

const jobPostingAuditSchema = new Schema<JobPostingAuditEventData>(
  {
    job_posting_id: { type: Schema.Types.ObjectId, required: true, index: true },
    enterprise_id: { type: Schema.Types.ObjectId, required: true, index: true },
    actor_user_id: { type: Schema.Types.ObjectId, required: true },
    action: { type: String, enum: JOB_AUDIT_ACTIONS, required: true },
    result: { type: String, enum: ['success'], default: 'success' },
    job_title: { type: String, required: true },
    changed_fields: { type: [String], default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'job_posting_audit_events' },
);

export const JobPostingAuditEvent = model<JobPostingAuditEventData>('JobPostingAuditEvent', jobPostingAuditSchema);
