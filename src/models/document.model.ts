import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export const documentTypes = ['cv', 'cover_letter'] as const;
export type DocumentType = (typeof documentTypes)[number];

export interface DocumentData {
  owner_id: Types.ObjectId;
  type: DocumentType;
  file_url: string;
  storage_key: string;
  file_name: string;
  mime_type: string;
  size: number;
  is_default: boolean;
  deleted_at?: Date | null;
}

const documentSchema = new Schema<DocumentData>(
  {
    owner_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: { type: String, enum: documentTypes, required: true, index: true },
    file_url: { type: String, required: true },
    storage_key: { type: String, required: true },
    file_name: { type: String, required: true, trim: true },
    mime_type: { type: String, required: true },
    size: { type: Number, required: true, min: 1 },
    is_default: { type: Boolean, default: false, index: true },
    deleted_at: { type: Date, default: null, index: true },
  },
  { timestamps: true, collection: 'documents' },
);

documentSchema.index({ owner_id: 1, type: 1, createdAt: -1 });
documentSchema.index(
  { owner_id: 1, type: 1, is_default: 1 },
  {
    unique: true,
    partialFilterExpression: { is_default: true, deleted_at: null },
  },
);

export const Document = model<DocumentData>('Document', documentSchema);
export type DocumentDoc = ReturnType<typeof Document.prototype.toObject> & {
  _id: Types.ObjectId;
};
