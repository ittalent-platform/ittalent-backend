import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentDoc } from '../../../src/models/document.model.js';
import type { DocumentsRepository } from '../../../src/modules/documents/documents.repository.js';
import { DocumentsService } from '../../../src/modules/documents/documents.service.js';

const documentId = '507f1f77bcf86cd799439011';
const ownerId = '507f1f77bcf86cd799439012';

function document(overrides: Record<string, unknown> = {}): DocumentDoc {
  const value = {
    _id: documentId,
    owner_id: ownerId,
    type: 'cv',
    file_url: 'https://example.test/resume.pdf',
    storage_key: 'documents/resume.pdf',
    file_name: 'resume.pdf',
    mime_type: 'application/pdf',
    size: 100,
    is_default: false,
    deleted_at: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
  return { ...value, toObject: () => value } as unknown as DocumentDoc;
}

type MockDocumentsRepository = {
  create: ReturnType<typeof vi.fn>;
  findByIdOwnerAndType: ReturnType<typeof vi.fn>;
  findByIds: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  findOwnedActiveById: ReturnType<typeof vi.fn>;
  isReferenced: ReturnType<typeof vi.fn>;
  softDeleteAndPromote: ReturnType<typeof vi.fn>;
  setDefault: ReturnType<typeof vi.fn>;
};

function setup(): {
  service: DocumentsService;
  repository: MockDocumentsRepository;
} {
  const repository = {
    create: vi.fn(),
    findByIdOwnerAndType: vi.fn(),
    findByIds: vi.fn(),
    list: vi.fn(),
    findOwnedActiveById: vi.fn(),
    isReferenced: vi.fn(),
    softDeleteAndPromote: vi.fn(),
    setDefault: vi.fn(),
  };
  return {
    service: new DocumentsService(repository as unknown as DocumentsRepository),
    repository,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('DocumentsService', () => {
  it('downloads only an owned active document', async () => {
    const { service, repository } = setup();
    repository.findOwnedActiveById.mockResolvedValue(document());
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('pdf', { status: 200 })),
    );
    const result = await service.download(ownerId, documentId);
    expect(result.fileName).toBe('resume.pdf');
    expect(repository.findOwnedActiveById).toHaveBeenCalledWith(
      documentId,
      ownerId,
    );
  });

  it('does not expose another owner document', async () => {
    const { service, repository } = setup();
    repository.findOwnedActiveById.mockResolvedValue(null);
    await expect(service.download(ownerId, documentId)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('blocks deletion while an application references the document', async () => {
    const { service, repository } = setup();
    repository.findOwnedActiveById.mockResolvedValue(document());
    repository.isReferenced.mockResolvedValue(true);
    await expect(service.remove(ownerId, documentId)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(repository.softDeleteAndPromote).not.toHaveBeenCalled();
  });

  it('sets a default independently through the repository transaction', async () => {
    const { service, repository } = setup();
    repository.setDefault.mockResolvedValue(document({ is_default: true }));
    const result = await service.setDefault(ownerId, documentId);
    expect(result.isDefault).toBe(true);
    expect(repository.setDefault).toHaveBeenCalledWith(documentId, ownerId);
  });
});
