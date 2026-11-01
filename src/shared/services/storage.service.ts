import { randomUUID } from 'node:crypto';

import { getCloudinary, isCloudinaryConfigured } from '../../config/cloudinary.js';
import { HTTP_STATUS } from '../constants/http-status.js';
import { createHttpError } from '../errors/http-error.js';

export const PDF_SIGNATURE_LENGTH = 5;
export const DOC_SIGNATURE_LENGTH = 8;
export const OFFICE_SIGNATURE_LENGTH = 4;
export const PDF_SIGNATURE = '%PDF-';
export const DOC_SIGNATURE = Buffer.from('d0cf11e0a1b11ae1', 'hex');
export const OFFICE_SIGNATURE = Buffer.from('504b0304', 'hex');

export type SupportedDocumentExtension = 'pdf' | 'doc' | 'docx';

export function isValidPdf(buffer: Buffer): boolean {
  return buffer.length >= PDF_SIGNATURE_LENGTH && buffer.subarray(0, PDF_SIGNATURE_LENGTH).toString('ascii') === PDF_SIGNATURE;
}

export function isValidDoc(buffer: Buffer): boolean {
  return buffer.length >= DOC_SIGNATURE_LENGTH && buffer.subarray(0, DOC_SIGNATURE_LENGTH).equals(DOC_SIGNATURE);
}

export function isValidDocx(buffer: Buffer): boolean {
  return buffer.length >= OFFICE_SIGNATURE_LENGTH && buffer.subarray(0, OFFICE_SIGNATURE_LENGTH).equals(OFFICE_SIGNATURE);
}

export function isValidDocumentBuffer(extension: SupportedDocumentExtension, buffer: Buffer): boolean {
  switch (extension) {
    case 'pdf':
      return isValidPdf(buffer);
    case 'doc':
      return isValidDoc(buffer);
    case 'docx':
      return isValidDocx(buffer);
    default:
      return false;
  }
}

export interface StorageUploadInput {
  buffer: Buffer;
  fileName: string;
  folder?: string;
  prefix?: string;
  resourceType?: 'raw' | 'image' | 'auto';
  mimeType?: string;
  resourceLabel?: string;
  /** Provider-neutral object key chosen by the owning domain. */
  storageKey?: string;
}

export interface StorageUploadResult {
  fileUrl: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
}

function normalizeOwnedPathComponent(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

function ownedKeyPrefix(namespace: string, ownerId: string, prefix: string): string {
  const safeNamespace = namespace
    .split('/')
    .map(normalizeOwnedPathComponent)
    .filter((component) => component.length > 0)
    .join('/');
  const safeOwner = normalizeOwnedPathComponent(ownerId);
  const safePrefix = normalizeOwnedPathComponent(prefix);
  return `${safeNamespace}/${safeOwner}/${safePrefix}-`;
}

const OWNED_KEY_SUFFIX_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:\.[a-z0-9]+)?$/i;

export class StorageService {
  isConfigured(): boolean {
    return isCloudinaryConfigured();
  }

  createOwnedKey(
    namespace: string,
    ownerId: string,
    prefix: string,
    extension: string,
    resourceType: 'raw' | 'image' = 'raw',
  ): string {
    const safeExtension = extension.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const extensionSuffix = resourceType === 'raw' && safeExtension ? `.${safeExtension}` : '';
    return `${ownedKeyPrefix(namespace, ownerId, prefix)}${randomUUID()}${extensionSuffix}`;
  }

  ownsKey(storageKey: string, namespace: string, ownerId: string, prefix: string): boolean {
    const expectedPrefix = ownedKeyPrefix(namespace, ownerId, prefix);
    const keySuffix = storageKey.slice(expectedPrefix.length);
    return storageKey.startsWith(expectedPrefix)
      && !storageKey.includes('..')
      && OWNED_KEY_SUFFIX_PATTERN.test(keySuffix);
  }

  async uploadFile(input: StorageUploadInput): Promise<StorageUploadResult> {
    const ext = input.fileName.split('.').pop()?.toLowerCase() ?? 'bin';
    const folder = input.folder ?? 'italent/documents';
    const prefix = input.prefix ?? 'document';
    const generatedId =
      (input.resourceType ?? 'raw') === 'image'
        ? `${prefix}-${randomUUID()}`
        : `${prefix}-${randomUUID()}.${ext}`;
    const resourceType = input.resourceType ?? 'raw';
    const mimeType = input.mimeType ?? 'application/octet-stream';
    const resourceLabel = input.resourceLabel ?? 'Document';

    if (!this.isConfigured()) {
      throw createHttpError(HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE, `${resourceLabel} storage is not configured`);
    }

    const cloudinary = getCloudinary();
    const result = await new Promise<{ secure_url?: string; public_id?: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        input.storageKey
          ? { public_id: input.storageKey, resource_type: resourceType }
          : { folder, public_id: generatedId, resource_type: resourceType },
        (error, output) => {
          if (error || !output) {
            reject(error ?? new Error(`${resourceLabel} upload failed`));
            return;
          }
          resolve(output);
        },
      );
      stream.end(input.buffer);
    }).catch(() => {
      throw createHttpError(HTTP_STATUS.HTTP_502_BAD_GATEWAY, `${resourceLabel} upload failed`);
    });

    if (!result.secure_url || !result.public_id) {
      throw createHttpError(HTTP_STATUS.HTTP_502_BAD_GATEWAY, `${resourceLabel} upload failed`);
    }

    return {
      fileUrl: result.secure_url,
      storageKey: result.public_id,
      fileName: input.fileName,
      mimeType,
      size: input.buffer.length,
    };
  }

  async deleteFile(storageKey: string, resourceType: 'raw' | 'image' | 'auto' = 'raw'): Promise<boolean> {
    if (!this.isConfigured()) {
      throw createHttpError(HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE, 'Document storage is not configured');
    }

    try {
      const cloudinary = getCloudinary();
      const res = await cloudinary.uploader.destroy(storageKey, { resource_type: resourceType });
      return res?.result === 'ok' || res?.result === 'not found';
    } catch (error) {
      console.error('[storage:delete:error]', {
        message: error instanceof Error ? error.message : 'Unknown storage deletion failure',
      });
      return false;
    }
  }
}

export const storageService = new StorageService();
