import { Types } from 'mongoose';

import { Enterprise } from '../../models/enterprise.model.js';
import { JobPosting } from '../../models/job-posting.model.js';
import type { ReportDoc, ReportEvidenceFile, ReportStatusHistoryEntry, ReportTargetSnapshot } from '../../models/report.model.js';
import { User } from '../../models/user.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { storageService, type StorageService } from '../../shared/services/storage.service.js';
import {
  CLOSED_REPORT_STATUSES,
  OPEN_REPORT_STATUSES,
  REPORT_ERROR_CODES,
  REPORT_MESSAGES,
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  type ReportReason,
  type ReportStatus,
  type ReportTargetType,
} from './reports.constants.js';
import { reportsRepository, type ReportsRepository } from './reports.repository.js';
import type {
  CreateReportBody,
  CreateReportResponse,
  PaginatedReportsResponse,
  ReportDetailResponse,
  ReportHideResponse,
  ReportItemResponse,
  ReportsQuery,
  ReportWithdrawResponse,
} from './reports.schemas.js';

export class ReportsService {
  constructor(
    private readonly repo: ReportsRepository = reportsRepository,
    private readonly storage: StorageService = storageService,
  ) {}

  private async resolveTargetSnapshot(
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<ReportTargetSnapshot> {
    if (targetType === 'job') {
      const job = await JobPosting.findById(targetId).select('title enterprise_id status deleting').lean().exec();
      if (!job || job.deleting) {
        throw createHttpError(
          HTTP_STATUS.HTTP_400_BAD_REQUEST,
          REPORT_MESSAGES.TARGET_UNAVAILABLE,
          REPORT_ERROR_CODES.TARGET_UNAVAILABLE,
        );
      }

      let enterpriseName: string | null = null;
      if (job.enterprise_id) {
        const ent = await Enterprise.findById(job.enterprise_id).select('name status is_deleted').lean().exec();
        if (ent && !ent.is_deleted) {
          enterpriseName = ent.name;
        }
      }

      return {
        title: job.title,
        subtitle: enterpriseName ? `Job · ${enterpriseName}` : 'Job',
        enterprise_id: job.enterprise_id ?? null,
        enterprise_name: enterpriseName,
      };
    }

    if (targetType === 'company') {
      const enterprise = await Enterprise.findById(targetId).select('name is_deleted status').lean().exec();
      if (!enterprise || enterprise.is_deleted) {
        throw createHttpError(
          HTTP_STATUS.HTTP_400_BAD_REQUEST,
          REPORT_MESSAGES.TARGET_UNAVAILABLE,
          REPORT_ERROR_CODES.TARGET_UNAVAILABLE,
        );
      }

      return {
        title: enterprise.name,
        subtitle: 'Company',
        enterprise_id: new Types.ObjectId(targetId),
        enterprise_name: enterprise.name,
      };
    }

    if (targetType === 'user') {
      const user = await User.findById(targetId).select('full_name username role status enterprise_id').lean().exec();
      if (!user || user.status === 'blocked') {
        throw createHttpError(
          HTTP_STATUS.HTTP_400_BAD_REQUEST,
          REPORT_MESSAGES.TARGET_UNAVAILABLE,
          REPORT_ERROR_CODES.TARGET_UNAVAILABLE,
        );
      }

      const displayTitle = user.full_name?.trim() || user.username?.trim() || 'User';
      const roleSubtitle = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'User';

      return {
        title: displayTitle,
        subtitle: roleSubtitle,
        enterprise_id: user.enterprise_id ? new Types.ObjectId(user.enterprise_id) : null,
        enterprise_name: null,
      };
    }

    throw createHttpError(
      HTTP_STATUS.HTTP_400_BAD_REQUEST,
      REPORT_MESSAGES.TARGET_NOT_FOUND,
      REPORT_ERROR_CODES.TARGET_UNAVAILABLE,
    );
  }

  private async checkTargetAvailability(
    targetType: ReportTargetType,
    targetId: Types.ObjectId,
  ): Promise<boolean> {
    if (targetType === 'job') {
      const job = await JobPosting.findById(targetId).select('status deleting').lean().exec();
      return !!(job && !job.deleting && job.status === 'published');
    }
    if (targetType === 'company') {
      const ent = await Enterprise.findById(targetId).select('status is_deleted').lean().exec();
      return !!(ent && !ent.is_deleted && ent.status === 'active');
    }
    if (targetType === 'user') {
      const usr = await User.findById(targetId).select('status').lean().exec();
      return !!(usr && usr.status !== 'blocked');
    }
    return false;
  }

  private mapStatusDescription(status: ReportStatus): string {
    switch (status) {
      case 'pending':
        return 'Waiting for review. Review times vary; we don’t promise a date. You’ll get a notification when the status changes.';
      case 'reviewing':
        return 'Under review';
      case 'resolved':
        return 'Reviewed and closed. This report is closed.';
      case 'rejected':
        return 'Reviewed and closed. This report is closed.';
      case 'withdrawn':
        return 'You withdrew it. This report is closed.';
      default:
        return 'This report is closed.';
    }
  }

  private mapTimelineEvents(history: ReportStatusHistoryEntry[]): { event: string; label: string; timestamp: string }[] {
    return history.map((entry) => {
      let event = 'submitted';
      let label = 'Submitted';
      if (entry.status === 'reviewing') {
        event = 'review_started';
        label = 'Review started';
      } else if (entry.status === 'resolved') {
        event = 'resolved';
        label = 'Resolved';
      } else if (entry.status === 'rejected') {
        event = 'rejected';
        label = 'Rejected';
      } else if (entry.status === 'withdrawn') {
        event = 'withdrawn';
        label = 'Withdrawn by you';
      }

      return {
        event,
        label,
        timestamp: entry.changed_at.toISOString(),
      };
    });
  }

  async submitReport(
    reporterId: string,
    input: CreateReportBody,
    files?: Express.Multer.File[],
  ): Promise<CreateReportResponse> {
    // 1. Verify target existence and extract snapshot
    const snapshot = await this.resolveTargetSnapshot(input.targetType, input.targetId);

    // 2. Idempotency check: duplicate open report or matching key returns existing reference (A2/E5)
    const existing = await this.repo.findDuplicate(
      reporterId,
      input.targetType,
      input.targetId,
      input.idempotencyKey,
    );
    if (existing) {
      return {
        reference: existing.reference,
        message: REPORT_MESSAGES.CREATE_SUCCESS,
      };
    }

    // 3. Process and upload evidence files if provided
    const evidenceFiles: ReportEvidenceFile[] = [];

    if (files && files.length > 0) {
      for (const file of files) {
        const isImage = file.mimetype.startsWith('image/');
        const uploaded = await this.storage.uploadFile({
          buffer: file.buffer,
          fileName: file.originalname,
          folder: 'italent/reports/evidence',
          prefix: 'evidence',
          resourceType: isImage ? 'image' : 'raw',
          mimeType: file.mimetype,
          resourceLabel: 'Evidence',
        });

        evidenceFiles.push({
          file_url: uploaded.fileUrl,
          storage_key: uploaded.storageKey,
          file_name: uploaded.fileName,
          mime_type: uploaded.mimeType,
          size: uploaded.size,
          uploaded_at: new Date(),
        });
      }
    } else if (input.evidenceFiles && input.evidenceFiles.length > 0) {
      for (const f of input.evidenceFiles) {
        evidenceFiles.push({
          file_url: f.fileUrl,
          storage_key: f.storageKey,
          file_name: f.fileName,
          mime_type: f.mimeType,
          size: f.size,
          uploaded_at: new Date(),
        });
      }
    }

    // 4. Generate reference sequence
    const reference = await this.repo.generateNextReference();
    const now = new Date();

    // 5. Persist Report
    await this.repo.create({
      reference,
      reporter_id: new Types.ObjectId(reporterId),
      target_type: input.targetType,
      target_id: new Types.ObjectId(input.targetId),
      target_snapshot: snapshot,
      reason: input.reason,
      statement: input.statement.trim(),
      evidence_files: evidenceFiles,
      status: 'pending',
      status_history: [
        {
          status: 'pending',
          changed_at: now,
          changed_by: new Types.ObjectId(reporterId),
          note: 'Submitted',
        },
      ],
      idempotency_key: input.idempotencyKey ?? null,
      hidden_by_reporter: false,
    });

    return {
      reference,
      message: REPORT_MESSAGES.CREATE_SUCCESS,
    };
  }

  async listReports(
    reporterId: string,
    query: ReportsQuery,
  ): Promise<PaginatedReportsResponse> {
    const [{ items, total, page, limit, totalPages }, counts] = await Promise.all([
      this.repo.listByReporter(reporterId, query),
      this.repo.countStatusesByReporter(reporterId),
    ]);

    const mappedItems: ReportItemResponse[] = await Promise.all(
      items.map(async (doc: ReportDoc) => {
        const isAvailable = await this.checkTargetAvailability(doc.target_type, doc.target_id);
        return {
          id: doc._id.toHexString(),
          reference: doc.reference,
          target: {
            type: doc.target_type,
            id: doc.target_id.toHexString(),
            title: doc.target_snapshot.title,
            subtitle: doc.target_snapshot.subtitle,
            isAvailable,
          },
          reason: doc.reason,
          reasonLabel: REPORT_REASON_LABELS[doc.reason] ?? doc.reason,
          submittedAt: (doc.createdAt ?? new Date()).toISOString(),
          status: doc.status,
          statusLabel: REPORT_STATUS_LABELS[doc.status] ?? doc.status,
        };
      }),
    );

    return {
      items: mappedItems,
      counts,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async getReportDetail(
    reporterId: string,
    idOrRef: string,
  ): Promise<ReportDetailResponse> {
    const report = await this.repo.findByIdOrReference(idOrRef, reporterId);
    if (!report || report.hidden_by_reporter) {
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        REPORT_MESSAGES.REPORT_NOT_FOUND,
        REPORT_ERROR_CODES.REPORT_NOT_FOUND,
      );
    }

    const isAvailable = await this.checkTargetAvailability(report.target_type, report.target_id);

    return {
      id: report._id.toHexString(),
      reference: report.reference,
      status: report.status,
      statusLabel: REPORT_STATUS_LABELS[report.status] ?? report.status,
      statusDescription: this.mapStatusDescription(report.status),
      submittedAt: (report.createdAt ?? new Date()).toISOString(),
      target: {
        type: report.target_type,
        id: report.target_id.toHexString(),
        title: report.target_snapshot.title,
        subtitle: report.target_snapshot.subtitle,
        isAvailable,
      },
      reason: report.reason,
      reasonLabel: REPORT_REASON_LABELS[report.reason] ?? report.reason,
      statement: report.statement,
      files: report.evidence_files.map((file: ReportEvidenceFile) => ({
        id: (file as unknown as { _id?: Types.ObjectId })._id?.toHexString() || file.storage_key,
        fileName: file.file_name,
        size: file.size,
        mimeType: file.mime_type,
        downloadUrl: file.file_url,
      })),
      responseFromPlatform: report.resolution_response ?? null,
      history: this.mapTimelineEvents(report.status_history),
      canWithdraw: report.status === 'pending',
      canHide: CLOSED_REPORT_STATUSES.includes(report.status),
    };
  }

  async withdrawReport(
    reporterId: string,
    idOrRef: string,
    note?: string,
  ): Promise<ReportWithdrawResponse> {
    const report = await this.repo.findByIdOrReference(idOrRef, reporterId);
    if (!report || report.hidden_by_reporter) {
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        REPORT_MESSAGES.REPORT_NOT_FOUND,
        REPORT_ERROR_CODES.REPORT_NOT_FOUND,
      );
    }

    if (report.status !== 'pending') {
      throw createHttpError(
        HTTP_STATUS.HTTP_409_CONFLICT,
        REPORT_MESSAGES.REVIEW_ALREADY_STARTED,
        REPORT_ERROR_CODES.REVIEW_ALREADY_STARTED,
      );
    }

    const updated = await this.repo.withdrawIfPending(idOrRef, reporterId, note);
    if (!updated) {
      throw createHttpError(
        HTTP_STATUS.HTTP_409_CONFLICT,
        REPORT_MESSAGES.REVIEW_ALREADY_STARTED,
        REPORT_ERROR_CODES.REVIEW_ALREADY_STARTED,
      );
    }

    return {
      reference: updated.reference,
      status: 'withdrawn',
      message: REPORT_MESSAGES.WITHDRAW_SUCCESS,
    };
  }

  async hideReport(
    reporterId: string,
    idOrRef: string,
  ): Promise<ReportHideResponse> {
    const report = await this.repo.findByIdOrReference(idOrRef, reporterId);
    if (!report) {
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        REPORT_MESSAGES.REPORT_NOT_FOUND,
        REPORT_ERROR_CODES.REPORT_NOT_FOUND,
      );
    }

    if (OPEN_REPORT_STATUSES.includes(report.status)) {
      throw createHttpError(
        HTTP_STATUS.HTTP_400_BAD_REQUEST,
        REPORT_MESSAGES.REPORT_NOT_CLOSED,
        REPORT_ERROR_CODES.REPORT_NOT_CLOSED,
      );
    }

    const updated = await this.repo.hideIfClosed(idOrRef, reporterId);
    if (!updated) {
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        REPORT_MESSAGES.REPORT_NOT_FOUND,
        REPORT_ERROR_CODES.REPORT_NOT_FOUND,
      );
    }

    return {
      reference: updated.reference,
      hidden: true,
      message: REPORT_MESSAGES.HIDE_SUCCESS,
    };
  }
}

export const reportsService = new ReportsService();
