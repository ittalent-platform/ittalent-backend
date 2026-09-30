import type {
  ApplicationDoc,
  ApplicationHistoryEntryData,
  AttachmentSnapshotData,
  JobSnapshotData,
} from '../../models/application.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { usersService, type UsersService } from '../users/users.service.js';
import { APPLICATION_MESSAGES, isWithdrawable, REAPPLY_PUBLIC_STATUS } from './applications.constants.js';
import {
  applicationsRepository,
  type ApplicationListFilters,
  type ApplicationsRepository,
} from './applications.repository.js';
import { parseStatusFilter, type ApplicationListQuery } from './applications.schemas.js';
import type { ApplicationDetailDTO, ApplicationHistoryEntryDTO, ApplicationListResponse, ApplicationSummaryDTO, AttachmentSnapshotResponse, JobSnapshotResponse } from './applications.openapi.js';

function toIso(value: Date | undefined): string | null {
  return value ? value.toISOString() : null;
}

export class ApplicationsService {
  constructor(private readonly repository: ApplicationsRepository = applicationsRepository, private readonly userService: UsersService = usersService) {}

  private async assertCandidate(applicantId: string): Promise<void> {
    const user = await this.userService.findById(applicantId);
    if (!user || user.role !== 'user' || user.status !== 'active') {
      throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, APPLICATION_MESSAGES.CANDIDATE_UNAVAILABLE);
    }
  }

  private mapJobSnapshot(snapshot: JobSnapshotData): JobSnapshotResponse {
    return {
      title: snapshot.title,
      companyName: snapshot.company_name,
      location: snapshot.location ?? null,
      jobType: snapshot.job_type ?? null,
      deadline: toIso(snapshot.deadline),
      publicStatus: snapshot.public_status,
    };
  }

  private mapAttachment(attachment: AttachmentSnapshotData): AttachmentSnapshotResponse {
    return {
      documentId: String(attachment.document_id),
      type: attachment.type,
      fileName: attachment.file_name,
      mimeType: attachment.mime_type,
      size: attachment.size,
      submittedAt: attachment.submitted_at.toISOString(),
    };
  }

  // BR-APP-008: only a first application that was withdrawn, not yet repeated, on a job that is still public.
  private canApplyAgain(doc: ApplicationDoc): boolean {
    return doc.status === 'withdrawn' && !doc.reapplied_as && !doc.reapplied_from && doc.job_snapshot.public_status === REAPPLY_PUBLIC_STATUS;
  }

  private mapSummary(doc: ApplicationDoc): ApplicationSummaryDTO {
    return {
      id: String(doc._id),
      jobId: String(doc.job_id),
      job: this.mapJobSnapshot(doc.job_snapshot),
      status: doc.status,
      reviewStage: doc.review_stage ?? null,
      submittedDocuments: doc.attachments.map((attachment) => attachment.type),
      canWithdraw: isWithdrawable(doc.status),
      canApplyAgain: this.canApplyAgain(doc),
      reappliedFrom: doc.reapplied_from ? String(doc.reapplied_from) : null,
      reappliedAs: doc.reapplied_as ? String(doc.reapplied_as) : null,
      submittedAt: doc.submitted_at.toISOString(),
      latestStatusAt: doc.latest_status_at.toISOString(),
      withdrawnAt: toIso(doc.withdrawn_at),
    };
  }

  private mapDetail(doc: ApplicationDoc): ApplicationDetailDTO {
    return {
      ...this.mapSummary(doc),
      message: doc.message ?? null,
      withdrawalReason: doc.withdrawal_reason ?? null,
      attachments: doc.attachments.map((attachment) => this.mapAttachment(attachment)),
      version: doc.version,
      createdAt: (doc.createdAt ?? doc.submitted_at).toISOString(),
      updatedAt: (doc.updatedAt ?? doc.latest_status_at).toISOString(),
    };
  }

  private mapHistoryEntry(entry: ApplicationHistoryEntryData): ApplicationHistoryEntryDTO {
    return {
      status: entry.status,
      reviewStage: entry.review_stage ?? null,
      actorRole: entry.actor_role,
      occurredAt: entry.occurred_at.toISOString(),
    };
  }

  // UC-MYAPP-01 / UC-MYAPP-05: bounded, newest-first list scoped to the candidate, with
  // board status counts computed over the same filter scope (UC-MYAPP-01.AC.3).
  async list(applicantId: string, query: ApplicationListQuery): Promise<ApplicationListResponse> {
    await this.assertCandidate(applicantId);
    const filters: ApplicationListFilters = {
      statuses: query.status ? parseStatusFilter(query.status) : undefined,
      jobId: query.jobId,
      reviewStage: query.reviewStage,
      keyword: query.search,
      submittedFrom: query.submittedFrom,
      submittedTo: query.submittedTo,
    };

    const [page, statusCounts] = await Promise.all([
      this.repository.findPageByApplicant(applicantId, {
        page: query.page,
        limit: query.limit,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        filters,
      }),
      this.repository.countByStatus(applicantId, filters),
    ]);

    return {
      items: page.items.map((item) => this.mapSummary(item)),
      page: query.page,
      limit: query.limit,
      total: page.total,
      totalPages: Math.ceil(page.total / query.limit),
      statusCounts,
    };
  }

  // UC-MYAPP-02: ownership-scoped detail; 404 masks records owned by another candidate.
  async getDetail(applicantId: string, id: string): Promise<ApplicationDetailDTO> {
    await this.assertCandidate(applicantId);
    const application = await this.repository.findOwnedById(id, applicantId);
    if (!application) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, APPLICATION_MESSAGES.NOT_FOUND);
    }
    return this.mapDetail(application);
  }

  // UC-MYAPP-03: chronological, append-only history with public status/stage/actor only.
  async getHistory(
    applicantId: string,
    id: string,
    page: number,
    limit: number,
  ): Promise<{
    items: ApplicationHistoryEntryDTO[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }> {
    await this.assertCandidate(applicantId);
    const history = await this.repository.findHistoryPage(id, applicantId, page, limit);
    if (!history.found) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, APPLICATION_MESSAGES.NOT_FOUND);
    }

    const total = history.total;
    const items = history.items.map((entry) => this.mapHistoryEntry(entry));

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  // UC-MYAPP-04: validates eligibility, then applies the atomic optimistic update.
  async withdraw(
    applicantId: string,
    id: string,
    expectedVersion: number,
    reason: string | undefined,
  ): Promise<ApplicationDetailDTO> {
    await this.assertCandidate(applicantId);
    const application = await this.repository.findOwnedById(id, applicantId);
    if (!application) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, APPLICATION_MESSAGES.NOT_FOUND);
    }

    if (application.version !== expectedVersion) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, APPLICATION_MESSAGES.WITHDRAWAL_CONFLICT);
    }

    if (!isWithdrawable(application.status)) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, APPLICATION_MESSAGES.WITHDRAWAL_NOT_ALLOWED);
    }

    const updated = await this.repository.withdrawAtomically(id, applicantId, expectedVersion, reason);
    if (!updated) {
      // The guarded atomic update matched nothing: a concurrent transition won the race.
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, APPLICATION_MESSAGES.WITHDRAWAL_CONFLICT);
    }

    return this.mapDetail(updated);
  }
}

export const applicationsService = new ApplicationsService();
