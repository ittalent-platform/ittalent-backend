import type { Types } from 'mongoose';

import type { ApplicationDoc, ApplicationStatus, ApplicationStatusHistoryEntry } from '../../models/application.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import {
  consumeEmailDeliveryStatus,
  sendApplicationConfirmationEmail,
} from '../../shared/services/email.service.js';
import { documentsService, type DocumentsService } from '../documents/documents.service.js';
import { jobPostingsService, type JobPostingsService, type JobSummary } from '../job-postings/job-postings.service.js';
import { usersService, type UsersService } from '../users/users.service.js';
import {
  APPLICATION_EMAIL_FAILED_LOG,
  APPLICANT_ROLE,
  APPLICATION_ERROR_CODES,
  APPLICATION_HIRED_STATUS,
  APPLICATION_MESSAGES,
  APPLICATION_SUBMITTED_LABEL,
  CLOSED_APPLICATION_STATUSES,
  createEmptyStatusCounts,
  isWithdrawable,
  JOB_PUBLIC_STATUS,
  MAX_APPLICATIONS_PER_JOB,
  STATUS_REVIEW_STAGE,
  type ApplicationActorRole,
} from './applications.constants.js';
import {
  applicationsRepository,
  type ApplicationsRepository,
  type SubmitApplicationData,
} from './applications.repository.js';
import {
  parseStatusFilter,
  type ApplicationDetailDTO,
  type ApplicationDTO,
  type ApplicationHistoryEntryDTO,
  type ApplicationHistoryResponse,
  type ApplicationListQuery,
  type ApplicationListResponse,
  type ApplicationSummaryDTO,
  type CreateApplicationBody,
} from './applications.schemas.js';

export class ApplicationsService {
  constructor(
    private readonly repository: ApplicationsRepository = applicationsRepository,
    private readonly users: UsersService = usersService,
    private readonly jobs: JobPostingsService = jobPostingsService,
    private readonly documents: DocumentsService = documentsService,
  ) {}

  private mapDto(application: ApplicationDoc): ApplicationDTO {
    return {
      id: String(application._id),
      jobPostingId: String(application.job_id),
      status: application.status,
      cvId: String(application.cv_id),
      coverLetterId: application.cover_letter_id ? String(application.cover_letter_id) : null,
      message: application.message ?? null,
      reappliedFrom: application.reapplied_from ? String(application.reapplied_from) : null,
      reappliedAs: application.reapplied_as ? String(application.reapplied_as) : null,
      createdAt: application.createdAt.toISOString(),
      updatedAt: application.updatedAt.toISOString(),
    };
  }

  // E7: a failed confirmation email never fails the application; it is only logged.
  private async sendConfirmation(email: string, jobTitle: string): Promise<void> {
    try {
      await sendApplicationConfirmationEmail(email, jobTitle, APPLICATION_SUBMITTED_LABEL);
      if (consumeEmailDeliveryStatus(email) === false) {
        console.error(APPLICATION_EMAIL_FAILED_LOG, { email });
      }
    } catch (error) {
      console.error(APPLICATION_EMAIL_FAILED_LOG, error);
    }
  }

  async applyToJob(userId: string, input: CreateApplicationBody): Promise<ApplicationDTO> {
    // E1/E2: signed-in user must exist and have a verified (active) account.
    const user = await this.users.findById(userId);
    if (!user) {
      throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, APPLICATION_MESSAGES.AUTH_REQUIRED);
    }
    if (user.status === 'inactive') {
      throw createHttpError(
        HTTP_STATUS.HTTP_403_FORBIDDEN,
        APPLICATION_MESSAGES.EMAIL_NOT_VERIFIED,
        APPLICATION_ERROR_CODES.EMAIL_NOT_VERIFIED,
      );
    }
    if (user.status !== 'active') {
      throw createHttpError(
        HTTP_STATUS.HTTP_403_FORBIDDEN,
        APPLICATION_MESSAGES.ACCOUNT_NOT_ACTIVE,
        APPLICATION_ERROR_CODES.ACCOUNT_NOT_ACTIVE,
      );
    }

    // E4: job must be Published + Open.
    const job = await this.jobs.findPublicJobById(input.jobPostingId);
    if (!job) {
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        APPLICATION_MESSAGES.JOB_UNAVAILABLE,
        APPLICATION_ERROR_CODES.JOB_UNAVAILABLE,
      );
    }

    // E5a: stop when hired applicants already reached the number of openings.
    const hiredCount = await this.repository.countHiredByJobId(job._id);
    if (hiredCount >= job.openings) {
      throw createHttpError(
        HTTP_STATUS.HTTP_409_CONFLICT,
        APPLICATION_MESSAGES.POSITION_FILLED,
        APPLICATION_ERROR_CODES.POSITION_FILLED,
      );
    }

    // E3: CV (required) and cover letter (optional) must be owned by the signed-in user (Document.owner_id).
    const cv = await this.documents.findOwnedByType(input.cvId, userId, 'cv');
    if (!cv) {
      throw createHttpError(
        HTTP_STATUS.HTTP_400_BAD_REQUEST,
        APPLICATION_MESSAGES.INVALID_CV,
        APPLICATION_ERROR_CODES.INVALID_CV,
      );
    }
    if (input.coverLetterId) {
      const coverLetter = await this.documents.findOwnedByType(input.coverLetterId, userId, 'cover_letter');
      if (!coverLetter) {
        throw createHttpError(
          HTTP_STATUS.HTTP_400_BAD_REQUEST,
          APPLICATION_MESSAGES.INVALID_COVER_LETTER,
          APPLICATION_ERROR_CODES.INVALID_COVER_LETTER,
        );
      }
    }

    const data: SubmitApplicationData = {
      jobId: job._id,
      applicantId: userId,
      cvId: input.cvId,
      coverLetterId: input.coverLetterId,
      message: input.message,
      changedBy: userId,
    };

    // E5 / BR-APP-002: one active application per applicant/job. E6 / BR-APP-010: after a Withdrawn or
    // Rejected one the applicant may apply again as a NEW record (the closed one is never reopened), at most
    // twice per job, and never after Hired.
    const latest = await this.repository.findLatestByJobAndApplicant(job._id, userId);
    let reappliedFrom: Types.ObjectId | undefined;
    if (latest) {
      if (latest.status === APPLICATION_HIRED_STATUS) {
        throw this.applyAgainNotAllowed();
      }
      if (!CLOSED_APPLICATION_STATUSES.includes(latest.status)) {
        throw this.alreadyApplied();
      }
      if ((await this.repository.countByJobAndApplicant(job._id, userId)) >= MAX_APPLICATIONS_PER_JOB) {
        throw this.applyAgainNotAllowed();
      }
      reappliedFrom = latest._id as Types.ObjectId;
    }
    const application = await this.repository.create({ ...data, reappliedFrom });

    // null = a concurrent request won the race (unique index / status condition).
    if (!application) {
      throw this.alreadyApplied();
    }

    // UC-JOB-03.EX.3: if the job was deleted while this application was being saved, drop it again so no
    // application is left pointing at a job that no longer exists.
    if (!(await this.jobs.stillExists(String(job._id)))) {
      await this.repository.deleteById(application._id);
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        APPLICATION_MESSAGES.JOB_UNAVAILABLE,
        APPLICATION_ERROR_CODES.JOB_UNAVAILABLE,
      );
    }

    await this.sendConfirmation(user.email, job.title);

    return this.mapDto(application);
  }

  // ---- UC-MYAPP-01..05: the candidate's own applications ----

  // UC-MYAPP-01.EX.2: an account that is not an active candidate is rejected without touching any data.
  private async assertCandidate(applicantId: string): Promise<void> {
    const user = await this.users.findById(applicantId);
    if (!user || user.role !== APPLICANT_ROLE || user.status !== 'active') {
      throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, APPLICATION_MESSAGES.CANDIDATE_UNAVAILABLE);
    }
  }

  private reviewStage(status: ApplicationStatus): ApplicationSummaryDTO['reviewStage'] {
    return STATUS_REVIEW_STAGE[status] ?? null;
  }

  private lastEntry(application: ApplicationDoc, status?: ApplicationStatus): ApplicationStatusHistoryEntry | undefined {
    const history = application.status_history;
    return status ? [...history].reverse().find((entry) => entry.status === status) : history[history.length - 1];
  }

  private async attachmentsOf(applications: ApplicationDoc[]): Promise<Map<string, ApplicationDetailDTO['attachments']>> {
    const ids = [...new Set(applications.flatMap((item) => [String(item.cv_id), ...(item.cover_letter_id ? [String(item.cover_letter_id)] : [])]))];
    const documents = new Map((await this.documents.findByIds(ids)).map((document) => [String(document._id), document]));
    return new Map(applications.map((item) => [String(item._id), [item.cv_id, item.cover_letter_id].flatMap((id) => {
      const document = id ? documents.get(String(id)) : undefined;
      return document ? [{ documentId: String(document._id), type: document.type, fileName: document.file_name, mimeType: document.mime_type, size: document.size, submittedAt: item.createdAt.toISOString() }] : [];
    })]));
  }

  private mapSummary(application: ApplicationDoc, job: JobSummary | undefined, attachments: ApplicationDetailDTO['attachments']): ApplicationSummaryDTO {
    const publicStatus = job?.isOpen ? JOB_PUBLIC_STATUS.OPEN : JOB_PUBLIC_STATUS.CLOSED;
    return {
      id: String(application._id),
      jobId: String(application.job_id),
      job: { title: job?.title ?? '', companyName: job?.companyName ?? '', location: job?.location ?? null, jobType: job?.employmentType ?? null, deadline: job?.expiresAt?.toISOString() ?? null, publicStatus },
      status: application.status,
      reviewStage: this.reviewStage(application.status),
      submittedDocuments: attachments.map((attachment) => attachment.type),
      canWithdraw: isWithdrawable(application.status),
      // BR-APP-010: a first Withdrawn/Rejected application on a job that is still open, not yet replaced.
      canApplyAgain: CLOSED_APPLICATION_STATUSES.includes(application.status) && !application.reapplied_as && !application.reapplied_from && publicStatus === JOB_PUBLIC_STATUS.OPEN,
      reappliedFrom: application.reapplied_from ? String(application.reapplied_from) : null,
      reappliedAs: application.reapplied_as ? String(application.reapplied_as) : null,
      submittedAt: application.createdAt.toISOString(),
      latestStatusAt: (this.lastEntry(application)?.changed_at ?? application.updatedAt).toISOString(),
      withdrawnAt: this.lastEntry(application, 'withdrawn')?.changed_at.toISOString() ?? null,
    };
  }

  private async mapDetail(application: ApplicationDoc): Promise<ApplicationDetailDTO> {
    const [jobs, attachments] = await Promise.all([this.jobs.findSummariesByIds([String(application.job_id)]), this.attachmentsOf([application])]);
    const documents = attachments.get(String(application._id)) ?? [];
    return {
      ...this.mapSummary(application, jobs.get(String(application.job_id)), documents),
      message: application.message ?? null,
      withdrawalReason: application.withdrawal_reason ?? null,
      attachments: documents,
      // The number of history entries: any status change (candidate or company) makes an older version stale.
      version: application.status_history.length,
      createdAt: application.createdAt.toISOString(),
      updatedAt: application.updatedAt.toISOString(),
    };
  }

  private mapHistoryEntry(entry: ApplicationStatusHistoryEntry, applicantId: string): ApplicationHistoryEntryDTO {
    // Only a public role is exposed, never the account behind the change (BR-APP-005 / BR-APP-007).
    const actorRole: ApplicationActorRole = String(entry.changed_by) === applicantId ? 'candidate' : 'company';
    return { status: entry.status, reviewStage: this.reviewStage(entry.status), actorRole, occurredAt: entry.changed_at.toISOString() };
  }

  // Combines the job filter and the keyword into the job ids to match; undefined means "no job restriction".
  private async resolveJobIds(query: ApplicationListQuery): Promise<string[] | undefined> {
    const byKeyword = query.search ? await this.jobs.findIdsByKeyword(query.search) : undefined;
    if (query.jobId) return byKeyword ? byKeyword.filter((id) => id === query.jobId) : [query.jobId];
    return byKeyword;
  }

  // The review-stage filter narrows the status filter: each stage maps to the statuses that show it.
  private resolveStatuses(query: ApplicationListQuery): ApplicationStatus[] | undefined {
    const selected = query.status ? parseStatusFilter(query.status) : undefined;
    if (!query.reviewStage) return selected;
    const inStage = (Object.keys(STATUS_REVIEW_STAGE) as ApplicationStatus[]).filter((status) => STATUS_REVIEW_STAGE[status] === query.reviewStage);
    return selected ? selected.filter((status) => inStage.includes(status)) : inStage;
  }

  // UC-MYAPP-01 / 05: bounded list scoped to the candidate, with board status counts over the same filters.
  async list(applicantId: string, query: ApplicationListQuery): Promise<ApplicationListResponse> {
    await this.assertCandidate(applicantId);
    const filters = { statuses: this.resolveStatuses(query), jobIds: await this.resolveJobIds(query), submittedFrom: query.submittedFrom, submittedTo: query.submittedTo };
    const noMatch = filters.statuses?.length === 0 || filters.jobIds?.length === 0;
    const [page, statusCounts] = noMatch
      ? [{ items: [] as ApplicationDoc[], total: 0 }, createEmptyStatusCounts()]
      : await Promise.all([
        this.repository.findPageByApplicant(applicantId, { page: query.page, limit: query.limit, sortBy: query.sortBy, sortOrder: query.sortOrder, filters }),
        this.repository.countByStatus(applicantId, filters),
      ]);
    const [jobs, attachments] = await Promise.all([this.jobs.findSummariesByIds([...new Set(page.items.map((item) => String(item.job_id)))]), this.attachmentsOf(page.items)]);
    return {
      items: page.items.map((item) => this.mapSummary(item, jobs.get(String(item.job_id)), attachments.get(String(item._id)) ?? [])),
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
    if (!application) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, APPLICATION_MESSAGES.NOT_FOUND);
    return this.mapDetail(application);
  }

  // UC-MYAPP-03: chronological, append-only history with public status, stage and actor role only.
  async getHistory(applicantId: string, id: string, page: number, limit: number): Promise<ApplicationHistoryResponse> {
    await this.assertCandidate(applicantId);
    const history = await this.repository.findHistoryPage(id, applicantId, page, limit);
    if (!history.found) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, APPLICATION_MESSAGES.NOT_FOUND);
    return { items: history.items.map((entry) => this.mapHistoryEntry(entry, applicantId)), page, limit, total: history.total, totalPages: Math.ceil(history.total / limit) };
  }

  // UC-MYAPP-04: validates eligibility, then applies the guarded atomic update.
  async withdraw(applicantId: string, id: string, expectedVersion: number, reason: string | undefined): Promise<ApplicationDetailDTO> {
    await this.assertCandidate(applicantId);
    const application = await this.repository.findOwnedById(id, applicantId);
    if (!application) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, APPLICATION_MESSAGES.NOT_FOUND);
    if (application.status_history.length !== expectedVersion) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, APPLICATION_MESSAGES.WITHDRAWAL_CONFLICT);
    }
    if (!isWithdrawable(application.status)) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, APPLICATION_MESSAGES.WITHDRAWAL_NOT_ALLOWED);
    }
    const updated = await this.repository.withdrawAtomically(id, applicantId, expectedVersion, reason);
    // The guarded update matched nothing: a concurrent transition won the race.
    if (!updated) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, APPLICATION_MESSAGES.WITHDRAWAL_CONFLICT);
    return this.mapDetail(updated);
  }

  private applyAgainNotAllowed(): Error {
    return createHttpError(
      HTTP_STATUS.HTTP_409_CONFLICT,
      APPLICATION_MESSAGES.APPLY_AGAIN_NOT_ALLOWED,
      APPLICATION_ERROR_CODES.APPLY_AGAIN_NOT_ALLOWED,
    );
  }

  private alreadyApplied(): Error {
    return createHttpError(
      HTTP_STATUS.HTTP_409_CONFLICT,
      APPLICATION_MESSAGES.ALREADY_APPLIED,
      APPLICATION_ERROR_CODES.ALREADY_APPLIED,
    );
  }
}

export const applicationsService = new ApplicationsService();