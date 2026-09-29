import { describe, expect, it } from 'vitest';

import { documentListQuerySchema, documentUploadSchema } from '../../../src/modules/documents/documents.schemas.js';

describe('Documents schemas', () => {
  it('accepts CV and cover letter upload types', () => {
    expect(documentUploadSchema.safeParse({ type: 'cv' }).success).toBe(true);
    expect(documentUploadSchema.safeParse({ type: 'cover_letter' }).success).toBe(true);
  });

  it('rejects unsupported upload types', () => {
    expect(documentUploadSchema.safeParse({ type: 'portfolio' }).success).toBe(false);
  });

  it('applies pagination defaults and validates sort order', () => {
    expect(documentListQuerySchema.parse({})).toEqual({ page: 1, limit: 20, sort_order: 'desc' });
    expect(documentListQuerySchema.safeParse({ sort_order: 'newest' }).success).toBe(false);
  });
});
