import { createHash } from 'node:crypto';
import type { PortfolioLinkDoc } from '../../models/portfolio-link.model.js';
import type { UserDoc } from '../../models/user.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError, isHttpError } from '../../shared/errors/http-error.js';
import { usersService, type UsersService } from '../users/users.service.js';
import { PORTFOLIO_LINKS, PORTFOLIO_LINK_MESSAGES } from './portfolio-links.constants.js';
import { portfolioLinksRepository, type PortfolioLinkChanges, type PortfolioLinksRepository } from './portfolio-links.repository.js';
import type { CreatePortfolioLinkInput, PortfolioLinkListQuery, PortfolioLinkResponse, UpdatePortfolioLinkInput } from './portfolio-links.schemas.js';

export interface PaginatedPortfolioLinks {
  items: PortfolioLinkResponse[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export class PortfolioLinksService {
  constructor(
    private readonly repository: PortfolioLinksRepository = portfolioLinksRepository,
    private readonly users: UsersService = usersService,
  ) {}

  private map(item: PortfolioLinkDoc): PortfolioLinkResponse {
    return {
      id: String(item._id),
      title: item.title,
      url: item.url,
      description: item.description ?? null,
      version: item.version,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private async assertCandidate(userId: string): Promise<void> {
    let user: UserDoc | null;
    try {
      user = await this.users.findById(userId);
    } catch {
      throw createHttpError(HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE, PORTFOLIO_LINK_MESSAGES.STORE_UNAVAILABLE);
    }
    if (!user || user.role !== PORTFOLIO_LINKS.CANDIDATE_ROLE || user.status !== 'active' || user.email_verified !== true) {
      throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, PORTFOLIO_LINK_MESSAGES.CANDIDATE_REQUIRED);
    }
  }

  private async replayOrFail(ownerId: string, key: string, requestHash: string): Promise<PortfolioLinkResponse | null> {
    const existing = await this.repository.findByIdempotencyKey(ownerId, key);
    if (!existing) return null;
    if (existing.request_hash !== requestHash) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, PORTFOLIO_LINK_MESSAGES.IDEMPOTENCY_KEY_REUSED, 'IDEMPOTENCY_KEY_REUSED');
    }
    return this.map(existing);
  }

  // UC-S4-PORT-01: an exact retry returns the committed link; the same URL under another key is a duplicate.
  async create(ownerId: string, input: CreatePortfolioLinkInput, idempotencyKey: string): Promise<{ item: PortfolioLinkResponse; replayed: boolean }> {
    await this.assertCandidate(ownerId);
    const normalizedInput: CreatePortfolioLinkInput = { ...input, url: new URL(input.url).toString() };
    const requestHash = createHash('sha256').update(JSON.stringify(normalizedInput)).digest('hex');
    try {
      const replay = await this.replayOrFail(ownerId, idempotencyKey, requestHash);
      if (replay) return { item: replay, replayed: true };
      const created = await this.repository.create({ ownerId, idempotencyKey, requestHash, input: normalizedInput });
      return { item: this.map(created), replayed: false };
    } catch (error) {
      if (isHttpError(error)) throw error;
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === PORTFOLIO_LINKS.MONGO_DUPLICATE_KEY_ERROR_CODE) {
        // A concurrent retry with the same key commits first; otherwise the URL is already in the library.
        const replay = await this.guardStore(() => this.replayOrFail(ownerId, idempotencyKey, requestHash));
        if (replay) return { item: replay, replayed: true };
        if (await this.guardStore(() => this.repository.findByUrl(ownerId, normalizedInput.url))) {
          throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, PORTFOLIO_LINK_MESSAGES.DUPLICATE_URL, 'DUPLICATE_PORTFOLIO_URL');
        }
      }
      throw createHttpError(HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE, PORTFOLIO_LINK_MESSAGES.STORE_UNAVAILABLE);
    }
  }

  async list(ownerId: string, query: PortfolioLinkListQuery): Promise<PaginatedPortfolioLinks> {
    const result = await this.guardStore(() => this.repository.findPage(ownerId, query.page, query.limit, query.keyword));
    return {
      items: result.items.map((item) => this.map(item)),
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / query.limit),
    };
  }

  // UC-S4-PORT-02: moves the link to its next version. The change is made against the version the Candidate was
  // editing, so a stale edit never overwrites a newer one.
  async update(ownerId: string, id: string, input: UpdatePortfolioLinkInput): Promise<PortfolioLinkResponse> {
    await this.assertCandidate(ownerId);
    const { expectedVersion, ...rest } = input;
    const changes: PortfolioLinkChanges = { ...rest, ...(rest.url ? { url: new URL(rest.url).toString() } : {}) };
    const current = await this.guardStore(() => this.repository.findOwned(ownerId, id));
    if (!current) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, PORTFOLIO_LINK_MESSAGES.NOT_FOUND);
    // Nothing differs from what is stored: an edit that changes nothing, or the exact retry of an update that already
    // committed (A2). Neither creates another version.
    const alreadyApplied = (changes.title === undefined || changes.title === current.title)
      && (changes.url === undefined || changes.url === current.url)
      && (changes.description === undefined || (changes.description ?? undefined) === current.description);
    if (alreadyApplied && (current.version === expectedVersion || current.version === expectedVersion + 1)) return this.map(current);
    const updated = current.version === expectedVersion
      ? await this.guardStore(() => this.repository.updateGuarded(ownerId, id, expectedVersion, changes), true)
      : null;
    if (!updated) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, PORTFOLIO_LINK_MESSAGES.VERSION_CONFLICT, 'VERSION_CONFLICT');
    return this.map(updated);
  }

  // UC-S4-PORT-03: only the platform's reference is removed, never the external content.
  async delete(ownerId: string, id: string, expectedVersion: number): Promise<void> {
    await this.assertCandidate(ownerId);
    const current = await this.guardStore(() => this.repository.findOwned(ownerId, id));
    if (!current) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, PORTFOLIO_LINK_MESSAGES.NOT_FOUND);
    const deleted = current.version === expectedVersion
      && await this.guardStore(() => this.repository.deleteGuarded(ownerId, id, expectedVersion));
    if (!deleted) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, PORTFOLIO_LINK_MESSAGES.VERSION_CONFLICT, 'VERSION_CONFLICT');
  }

  private async guardStore<T>(operation: () => Promise<T>, mapDuplicateUrl = false): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isHttpError(error)) throw error;
      if (mapDuplicateUrl && typeof error === 'object' && error !== null && 'code' in error && error.code === PORTFOLIO_LINKS.MONGO_DUPLICATE_KEY_ERROR_CODE) {
        throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, PORTFOLIO_LINK_MESSAGES.DUPLICATE_URL, 'DUPLICATE_PORTFOLIO_URL');
      }
      throw createHttpError(HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE, PORTFOLIO_LINK_MESSAGES.STORE_UNAVAILABLE);
    }
  }
}

export const portfolioLinksService = new PortfolioLinksService();
