import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export const documentTypes = ['cv', 'cover_letter'] as const;
export type DocumentType = (typeof documentTypes)[number];

// Minimal placeholder matching the CV/Cover Letter spec fields (UC-46).
// "Apply a job" only reads it; the upload feature owns creating/deleting records.
export interface DocumentData {
  applicant_id: Types.ObjectId;
  type: DocumentType;
  file_url: string;
  file_name: string;
  size: number;
  uploaded_at: Date;
  deleted_at?: Date | null;
}

const documentSchema = new Schema<DocumentData>(
  {
    applicant_id: { type: Schema.Types.ObjectId, ref: 'ApplicantProfile', required: true, index: true },
    type: { type: String, enum: documentTypes, required: true },
    file_url: { type: String, required: true },
    file_name: { type: String, required: true, trim: true },
    size: { type: Number, required: true, min: 0 },
    uploaded_at: { type: Date, default: Date.now },
    deleted_at: { type: Date, default: null },
  },
  {
    collection: 'documents',
  },
);

documentSchema.index({ applicant_id: 1, type: 1, uploaded_at: -1 });

export const Document = model('Document', documentSchema);
export type DocumentDoc = DocumentData & {
  _id: Types.ObjectId;
};