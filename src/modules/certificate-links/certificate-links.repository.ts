import type { UpdateQuery } from 'mongoose';

import { CertificateLink, type CertificateLinkData, type CertificateLinkDoc } from '../../models/certificate-link.model.js';
import { CERTIFICATE_LINKS } from './certificate-links.constants.js';
import type { CreateCertificateLinkInput } from './certificate-links.schemas.js';

export interface CertificateLinkCreateData {
  ownerId: string;
  actorId: string;
  idempotencyKey: string;
  requestHash: string;
  input: CreateCertificateLinkInput;
}

export class CertificateLinksRepository {
  async create(data: CertificateLinkCreateData): Promise<CertificateLinkDoc> {
    const now = new Date();
    return new CertificateLink({
      owner_id: data.ownerId,
      name: data.input.name,
      url: new URL(data.input.url).toString(),
      ...(data.input.issuer ? { issuer: data.input.issuer } : {}),
      ...(data.input.issuedDate ? { issued_date: data.input.issuedDate } : {}),
      ...(data.input.expiryDate ? { expiry_date: data.input.expiryDate } : {}),
      version: CERTIFICATE_LINKS.INITIAL_VERSION,
      status: CERTIFICATE_LINKS.STATUS,
      idempotency_key: data.idempotencyKey,
      request_hash: data.requestHash,
      history: [{ actor_id: data.actorId, action: 'created', occurred_at: now, result: 'success', version: 1 }],
    }).save();
  }

  async findByIdempotencyKey(ownerId: string, idempotencyKey: string): Promise<CertificateLinkDoc | null> {
    return CertificateLink.findOne({ owner_id: ownerId, idempotency_key: idempotencyKey }).select('+idempotency_key +request_hash').exec();
  }

  async findByUrl(ownerId: string, url: string): Promise<CertificateLinkDoc | null> {
    return CertificateLink.findOne({ owner_id: ownerId, url: new URL(url).toString() }).exec();
  }

  async findPage(ownerId: string, page: number, limit: number, search?: string): Promise<{ items: CertificateLinkDoc[]; total: number }> {
    const pattern = search ? new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
    const filter = { owner_id: ownerId, status: 'available' as const, ...(pattern ? { $or: [{ name: pattern }, { issuer: pattern }, { url: pattern }] } : {}) };
    const [items, total] = await Promise.all([
      CertificateLink.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).exec(),
      CertificateLink.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  async countSuggested(ownerId: string): Promise<number> {
    return CertificateLink.countDocuments({ owner_id: ownerId, status: 'available', suggested: true }).exec();
  }

  async findOwned(ownerId: string, id: string): Promise<CertificateLinkDoc | null> {
    return CertificateLink.findOne({ _id: id, owner_id: ownerId, status: 'available' }).exec();
  }

  async findOwnedMany(ownerId: string, ids: string[]): Promise<CertificateLinkDoc[]> {
    return CertificateLink.find({ _id: { $in: ids }, owner_id: ownerId, status: 'available' }).exec();
  }

  /** Applies the change only while the stored version still matches; null when it moved on or is gone. */
  async updateGuarded(ownerId: string, id: string, expectedVersion: number, update: UpdateQuery<CertificateLinkData>): Promise<CertificateLinkDoc | null> {
    return CertificateLink.findOneAndUpdate({ _id: id, owner_id: ownerId, status: 'available', version: expectedVersion }, update, { new: true, runValidators: true }).exec();
  }

  async deleteGuarded(ownerId: string, id: string, expectedVersion: number): Promise<boolean> {
    const result = await CertificateLink.deleteOne({ _id: id, owner_id: ownerId, version: expectedVersion }).exec();
    return result.deletedCount === 1;
  }
}

export const certificateLinksRepository = new CertificateLinksRepository();
