import { createHash } from 'node:crypto';
import type { CertificateLinkDoc } from '../../models/certificate-link.model.js';
import type { UserDoc } from '../../models/user.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError, isHttpError } from '../../shared/errors/http-error.js';
import { usersService, type UsersService } from '../users/users.service.js';
import type { ApplicationsService } from '../applications/applications.service.js';
import { CERTIFICATE_LINKS, CERTIFICATE_LINK_MESSAGES } from './certificate-links.constants.js';
import { certificateLinksRepository, type CertificateLinksRepository } from './certificate-links.repository.js';
import { datesInOrder, type CertificateLinkListQuery, type CertificateLinkResponse, type CreateCertificateLinkInput, type UpdateCertificateLinkInput } from './certificate-links.schemas.js';

export interface PaginatedCertificateLinks {
  items: CertificateLinkResponse[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  suggestedTotal: number;
}

type CountCertificatesSent = ApplicationsService['countCertificatesSent'];

async function countSentByApplications(applicantId: string, ids: string[]): Promise<Map<string, number>> {
  const { applicationsService } = await import('../applications/applications.service.js');
  return applicationsService.countCertificatesSent(applicantId, ids);
}

export class CertificateLinksService {
  constructor(
    private readonly repository: CertificateLinksRepository = certificateLinksRepository,
    private readonly users: UsersService = usersService,
    private readonly countCertificatesSent: CountCertificatesSent = countSentByApplications,
  ) {}

  private map(item: CertificateLinkDoc, sentCount = 0): CertificateLinkResponse {
    return {
      id: String(item._id),
      name: item.name,
      url: item.url,
      issuer: item.issuer ?? null,
      issuedDate: item.issued_date ?? null,
      expiryDate: item.expiry_date ?? null,
      version: item.version,
      status: item.status,
      suggested: item.suggested ?? false,
      sentCount,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private async assertCandidate(userId: string): Promise<void> {
    let user: UserDoc | null;
    try {
      user = await this.users.findById(userId);
    } catch {
      throw createHttpError(HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE, CERTIFICATE_LINK_MESSAGES.STORE_UNAVAILABLE);
    }
    if (!user || user.role !== CERTIFICATE_LINKS.CANDIDATE_ROLE || user.status !== 'active' || user.email_verified !== true) {
      throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, CERTIFICATE_LINK_MESSAGES.CANDIDATE_REQUIRED);
    }
  }

  private async replayOrFail(ownerId: string, key: string, requestHash: string): Promise<CertificateLinkResponse | null> {
    const existing = await this.repository.findByIdempotencyKey(ownerId, key);
    if (!existing) return null;
    if (existing.request_hash !== requestHash) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, CERTIFICATE_LINK_MESSAGES.IDEMPOTENCY_KEY_REUSED, 'IDEMPOTENCY_KEY_REUSED');
    }
    return this.map(existing);
  }

  async create(ownerId: string, input: CreateCertificateLinkInput, idempotencyKey: string): Promise<{ item: CertificateLinkResponse; replayed: boolean }> {
    await this.assertCandidate(ownerId);
    const normalizedInput: CreateCertificateLinkInput = { ...input, url: new URL(input.url).toString() };
    const requestHash = createHash('sha256').update(JSON.stringify(normalizedInput)).digest('hex');

    try {
      const replay = await this.replayOrFail(ownerId, idempotencyKey, requestHash);
      if (replay) return { item: replay, replayed: true };
      const created = await this.repository.create({ ownerId, actorId: ownerId, idempotencyKey, requestHash, input: normalizedInput });
      return { item: this.map(created), replayed: false };
    } catch (error) {
      if (isHttpError(error)) throw error;
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === CERTIFICATE_LINKS.MONGO_DUPLICATE_KEY_ERROR_CODE) {
        try {
          const replayAfterConflict = await this.replayOrFail(ownerId, idempotencyKey, requestHash);
          if (replayAfterConflict) return { item: replayAfterConflict, replayed: true };
          if (await this.repository.findByUrl(ownerId, normalizedInput.url)) {
            throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, CERTIFICATE_LINK_MESSAGES.DUPLICATE_URL, 'DUPLICATE_CERTIFICATE_URL');
          }
        } catch (recoveryError) {
          if (isHttpError(recoveryError)) throw recoveryError;
          throw createHttpError(HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE, CERTIFICATE_LINK_MESSAGES.STORE_UNAVAILABLE);
        }
      }
      try {
        const replayAfterFailure = await this.replayOrFail(ownerId, idempotencyKey, requestHash);
        if (replayAfterFailure) return { item: replayAfterFailure, replayed: true };
      } catch (replayError) {
        if (isHttpError(replayError)) throw replayError;
        throw createHttpError(HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE, CERTIFICATE_LINK_MESSAGES.STORE_UNAVAILABLE);
      }
      if (isHttpError(error)) throw error;
      throw createHttpError(HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE, CERTIFICATE_LINK_MESSAGES.STORE_UNAVAILABLE);
    }
  }

  async list(ownerId: string, query: CertificateLinkListQuery): Promise<PaginatedCertificateLinks> {
    return this.guardStore(async () => {
      const [result, suggestedTotal] = await Promise.all([
        this.repository.findPage(ownerId, query.page, query.limit, { search: query.search, suggested: query.suggested, validity: query.validity }),
        this.repository.countSuggested(ownerId),
      ]);
      const sent = await this.countCertificatesSent(ownerId, result.items.map((item) => String(item._id)));
      return {
        items: result.items.map((item) => this.map(item, sent.get(String(item._id)) ?? 0)),
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
        suggestedTotal,
      };
    });
  }

  // UC-S4-CERT-02 / -05: metadata edits bump the version; turning "suggest on apply" on or off does not.
  async update(ownerId: string, id: string, input: UpdateCertificateLinkInput): Promise<CertificateLinkResponse> {
    await this.assertCandidate(ownerId);
    const current = await this.guardStore(() => this.repository.findOwned(ownerId, id));
    if (!current) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, CERTIFICATE_LINK_MESSAGES.NOT_FOUND);
    if (current.version !== input.expectedVersion) throw this.versionConflict();

    const url = input.url === undefined ? current.url : new URL(input.url).toString();
    const next = {
      name: input.name ?? current.name,
      url,
      issuer: input.issuer === undefined ? current.issuer ?? null : input.issuer,
      issued_date: input.issuedDate === undefined ? current.issued_date ?? null : input.issuedDate,
      expiry_date: input.expiryDate === undefined ? current.expiry_date ?? null : input.expiryDate,
    };
    if (!datesInOrder(next.issued_date, next.expiry_date)) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, CERTIFICATE_LINK_MESSAGES.DATES_OUT_OF_ORDER);
    }
    const contentChanged = next.name !== current.name || next.url !== current.url || next.issuer !== (current.issuer ?? null)
      || next.issued_date !== (current.issued_date ?? null) || next.expiry_date !== (current.expiry_date ?? null);
    const suggestedChanged = input.suggested !== undefined && input.suggested !== (current.suggested ?? false);
    if (!contentChanged && !suggestedChanged) return this.withSentCount(ownerId, current);

    const version = contentChanged ? current.version + 1 : current.version;
    const set: Record<string, unknown> = { name: next.name, url: next.url, version, ...(suggestedChanged ? { suggested: input.suggested } : {}) };
    const unset: Record<string, ''> = {};
    for (const key of ['issuer', 'issued_date', 'expiry_date'] as const) {
      if (next[key] === null) unset[key] = '';
      else set[key] = next[key];
    }
    const history = { actor_id: ownerId, action: contentChanged ? 'updated' : 'suggestion_changed', occurred_at: new Date(), result: 'success', version };
    let updated: CertificateLinkDoc | null;
    try {
      updated = await this.repository.updateGuarded(ownerId, id, input.expectedVersion, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}), $push: { history } });
    } catch (error) {
      if (this.isDuplicateKey(error)) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, CERTIFICATE_LINK_MESSAGES.DUPLICATE_URL, 'DUPLICATE_CERTIFICATE_URL');
      throw createHttpError(HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE, CERTIFICATE_LINK_MESSAGES.STORE_UNAVAILABLE);
    }
    if (!updated) throw this.versionConflict();
    return this.withSentCount(ownerId, updated);
  }

  // UC-S4-CERT-03: applications already sent keep their own copy, so the link itself can go.
  async delete(ownerId: string, id: string, expectedVersion: number): Promise<void> {
    await this.assertCandidate(ownerId);
    const current = await this.guardStore(() => this.repository.findOwned(ownerId, id));
    if (!current) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, CERTIFICATE_LINK_MESSAGES.NOT_FOUND);
    if (current.version !== expectedVersion) throw this.versionConflict();
    const deleted = await this.guardStore(() => this.repository.deleteGuarded(ownerId, id, expectedVersion));
    if (!deleted) throw this.versionConflict();
  }

  /** The owner's certificates for an application, all or nothing (BR-S4-LINK-003). */
  async resolveForApplication(ownerId: string, ids: string[]): Promise<CertificateLinkDoc[]> {
    if (!ids.length) return [];
    const found = await this.guardStore(() => this.repository.findOwnedMany(ownerId, ids));
    if (found.length !== ids.length) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, CERTIFICATE_LINK_MESSAGES.CERTIFICATE_UNAVAILABLE, 'CERTIFICATE_UNAVAILABLE');
    }
    const byId = new Map(found.map((item) => [String(item._id), item]));
    return ids.map((id) => byId.get(id)!);
  }

  private async withSentCount(ownerId: string, item: CertificateLinkDoc): Promise<CertificateLinkResponse> {
    const sent = await this.guardStore(() => this.countCertificatesSent(ownerId, [String(item._id)]));
    return this.map(item, sent.get(String(item._id)) ?? 0);
  }

  private versionConflict(): Error {
    return createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, CERTIFICATE_LINK_MESSAGES.VERSION_CONFLICT, 'VERSION_CONFLICT');
  }

  private isDuplicateKey(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === CERTIFICATE_LINKS.MONGO_DUPLICATE_KEY_ERROR_CODE;
  }

  private async guardStore<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isHttpError(error)) throw error;
      throw createHttpError(HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE, CERTIFICATE_LINK_MESSAGES.STORE_UNAVAILABLE);
    }
  }
}

export const certificateLinksService = new CertificateLinksService();
