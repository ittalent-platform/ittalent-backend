import { Types } from 'mongoose';

import { Enterprise } from '../../models/enterprise.model.js';
import { JobPosting } from '../../models/job-posting.model.js';
import { User } from '../../models/user.model.js';
import type {
  ReportDoc,
  ReportEvidenceFile,
  ReportStatusHistoryEntry,
  ReportTargetSnapshot,
  ReportTimelineEvent,
} from '../../models/report.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { storageService, type StorageService } from '../../shared/services/storage.service.js';
import { notificationsService } from '../notifications/notifications.service.js';
import {
  CLOSED_REPORT_STATUSES,
  OPEN_REPORT_STATUSES,
  REPORT_ERROR_CODES,
  REPORT_MESSAGES,
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_TIME_LIMITS,
  type ReportReason,
  type ReportStatus,
  type ReportTargetType,
} from './reports.constants.js';
import { reportsRepository, type ReportsRepository } from './reports.repository.js';
import type {
  AdminReportItemDto,
  AdminReportsQuery,
  AdminResolveReportInput,
  CreateReportBody,
  CreateReportInput,
  CreateReportResponse,
  PaginatedAdminReportsResponse,
  PaginatedReportsResponse,
  ReportDetailResponse,
  ReporterReportItemDto,
  ReporterReportsQuery,
  ReportFileResponse,
  ReportHideResponse,
  ReportHistoryEntry,
  ReportItemResponse,
  ReportKpisDto,
  ReportsCounts,
  ReportsQuery,
  ReportWithdrawResponse,
  WithdrawReportInput,
} from './reports.schemas.js';

interface ResolvedTarget {
  isAvailable: boolean;
  snapshot: ReportTargetSnapshot;
  title: string;
  link?: string | null;
}

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

    if (targetType === 'company' || (targetType as string) === 'enterprise') {
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
    targetId: Types.ObjectId | string,
  ): Promise<boolean> {
    if (targetType === 'job') {
      const job = await JobPosting.findById(targetId).select('status deleting').lean().exec();
      return !!(job && !job.deleting && job.status === 'published');
    }
    if (targetType === 'company' || (targetType as string) === 'enterprise') {
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
    return (history || []).map((entry) => {
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
        timestamp: (entry.changed_at instanceof Date ? entry.changed_at : new Date(entry.changed_at)).toISOString(),
      };
    });
  }

  async submitReport(
    reporterId: string,
    body: CreateReportBody,
    files?: Express.Multer.File[],
  ): Promise<CreateReportResponse> {
    const snapshot = await this.resolveTargetSnapshot(body.targetType, body.targetId);

    const duplicate = await this.repo.findDuplicate(
      reporterId,
      body.targetType,
      body.targetId,
      body.idempotencyKey,
    );

    if (duplicate) {
      return {
        reference: duplicate.reference,
        message: REPORT_MESSAGES.CREATE_SUCCESS,
      };
    }

    const uploadedEvidenceFiles: ReportEvidenceFile[] = [];

    if (files && files.length > 0) {
      for (const file of files) {
        const isImage = file.mimetype.startsWith('image/');
        const uploadResult = await this.storage.uploadFile({
          buffer: file.buffer,
          fileName: file.originalname,
          folder: 'italent/reports/evidence',
          prefix: 'evidence',
          resourceType: isImage ? 'image' : 'raw',
          mimeType: file.mimetype,
          resourceLabel: 'Evidence',
        });

        uploadedEvidenceFiles.push({
          file_url: uploadResult.fileUrl,
          storage_key: uploadResult.storageKey,
          file_name: uploadResult.fileName,
          mime_type: uploadResult.mimeType,
          size: uploadResult.size,
          uploaded_at: new Date(),
        });
      }
    }

    if (body.evidenceFiles && body.evidenceFiles.length > 0) {
      for (const ef of body.evidenceFiles) {
        uploadedEvidenceFiles.push({
          file_url: ef.fileUrl,
          storage_key: ef.storageKey,
          file_name: ef.fileName,
          mime_type: ef.mimeType,
          size: ef.size,
          uploaded_at: new Date(),
        });
      }
    }

    const reference = await this.repo.generateNextReference();
    const now = new Date();

    await this.repo.create({
      reference,
      ticket_id: reference,
      reporter_id: new Types.ObjectId(reporterId),
      target_type: body.targetType,
      target_id: new Types.ObjectId(body.targetId),
      target_snapshot: snapshot,
      target_title: snapshot.title,
      target_link: snapshot.subtitle,
      title: snapshot.title,
      reason: body.reason,
      reason_category: body.reason,
      statement: body.statement.trim(),
      description: body.statement.trim(),
      evidence_files: uploadedEvidenceFiles,
      status: 'pending',
      hidden_by_reporter: false,
      is_deleted_by_reporter: false,
      status_history: [
        {
          status: 'pending',
          changed_at: now,
          changed_by: new Types.ObjectId(reporterId),
          note: 'Submitted',
        },
      ],
      timeline: [
        {
          status: 'pending',
          timestamp: now,
          actor_id: new Types.ObjectId(reporterId),
          note: 'Submitted',
        },
      ],
      idempotency_key: body.idempotencyKey ?? null,
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
    const [paginated, counts] = await Promise.all([
      this.repo.listByReporter(reporterId, query),
      this.repo.countStatusesByReporter(reporterId),
    ]);

    const items: ReportItemResponse[] = await Promise.all(
      paginated.items.map(async (doc) => {
        const isAvailable = await this.checkTargetAvailability(
          doc.target_type,
          doc.target_id.toString(),
        );

        return {
          id: doc._id.toString(),
          reference: doc.reference,
          target: {
            type: doc.target_type,
            id: doc.target_id.toString(),
            title: doc.target_snapshot?.title || doc.target_title || 'Untitled',
            subtitle: isAvailable
              ? (doc.target_snapshot?.subtitle || '')
              : 'This item is no longer available on ITTalent.',
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
      items,
      counts,
      pagination: {
        page: paginated.page,
        limit: paginated.limit,
        total: paginated.total,
        totalPages: paginated.totalPages,
      },
    };
  }

  async getCounts(reporterId: string): Promise<ReportsCounts> {
    return this.repo.countStatusesByReporter(reporterId);
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

    const isAvailable = await this.checkTargetAvailability(
      report.target_type,
      report.target_id.toString(),
    );

    const files: ReportFileResponse[] = (report.evidence_files || []).map(
      (file: ReportEvidenceFile & { _id?: Types.ObjectId }) => ({
        id: file._id ? file._id.toString() : file.storage_key || '',
        fileName: file.file_name || 'evidence-file',
        size: file.size || 0,
        mimeType: file.mime_type || 'application/octet-stream',
        downloadUrl: file.file_url,
      }),
    );

    const history: ReportHistoryEntry[] = this.mapTimelineEvents(
      report.status_history || (report as unknown as { timeline?: ReportStatusHistoryEntry[] }).timeline || [],
    );

    return {
      id: report._id.toString(),
      reference: report.reference,
      status: report.status,
      statusLabel: REPORT_STATUS_LABELS[report.status] ?? report.status,
      statusDescription: this.mapStatusDescription(report.status),
      submittedAt: (report.createdAt ?? new Date()).toISOString(),
      target: {
        type: report.target_type,
        id: report.target_id.toString(),
        title: report.target_snapshot?.title || report.target_title || 'Untitled',
        subtitle: isAvailable
          ? (report.target_snapshot?.subtitle || '')
          : 'This item is no longer available on ITTalent.',
        isAvailable,
      },
      reason: report.reason,
      reasonLabel: REPORT_REASON_LABELS[report.reason] ?? report.reason,
      statement: report.statement || report.description || '',
      files,
      responseFromPlatform: report.resolution_response || report.message_to_reporter || null,
      history,
      canWithdraw: report.status === 'pending',
      canHide: CLOSED_REPORT_STATUSES.includes(report.status),
    };
  }

  async withdrawReport(
    reporterId: string,
    idOrRef: string,
    noteOrInput?: string | WithdrawReportInput,
  ): Promise<ReportWithdrawResponse> {
    const isKhanhCall = typeof noteOrInput === 'object';
    const note = typeof noteOrInput === 'string'
      ? noteOrInput
      : noteOrInput?.withdrawal_reason;

    let report: ReportDoc | null = null;
    if (typeof this.repo.findByIdOrReference === 'function') {
      report = await this.repo.findByIdOrReference(idOrRef, reporterId);
    }
    if (!report && typeof this.repo.findReporterReportById === 'function') {
      report = await this.repo.findReporterReportById(reporterId, idOrRef);
    }

    if (!report || report.hidden_by_reporter || report.is_deleted_by_reporter) {
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        REPORT_MESSAGES.REPORT_NOT_FOUND,
        REPORT_ERROR_CODES.REPORT_NOT_FOUND,
      );
    }

    if (report.status !== 'pending') {
      if (isKhanhCall) {
        throw createHttpError(
          HTTP_STATUS.HTTP_400_BAD_REQUEST,
          REPORT_MESSAGES.NOT_PENDING_CANNOT_WITHDRAW,
        );
      }
      throw createHttpError(
        HTTP_STATUS.HTTP_409_CONFLICT,
        REPORT_MESSAGES.REVIEW_ALREADY_STARTED,
        REPORT_ERROR_CODES.REVIEW_ALREADY_STARTED,
      );
    }

    let updated: ReportDoc | null = null;
    if (typeof this.repo.withdrawIfPending === 'function') {
      updated = await this.repo.withdrawIfPending(idOrRef, reporterId, note);
    }
    if (!updated && typeof this.repo.withdrawReport === 'function') {
      updated = await this.repo.withdrawReport(idOrRef, reporterId, note);
    }

    if (!updated) {
      if (isKhanhCall) {
        throw createHttpError(
          HTTP_STATUS.HTTP_400_BAD_REQUEST,
          REPORT_MESSAGES.NOT_PENDING_CANNOT_WITHDRAW,
        );
      }
      throw createHttpError(
        HTTP_STATUS.HTTP_409_CONFLICT,
        REPORT_MESSAGES.REVIEW_ALREADY_STARTED,
        REPORT_ERROR_CODES.REVIEW_ALREADY_STARTED,
      );
    }

    const ref = updated.reference || updated.ticket_id || report.reference || report.ticket_id;
    const mapped = this.mapToReporterDto(updated);

    return {
      reference: ref,
      status: 'withdrawn',
      message: isKhanhCall ? REPORT_MESSAGES.WITHDRAWN : REPORT_MESSAGES.WITHDRAW_SUCCESS,
      report: mapped,
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

  // --- Admin Investigation & PR #91 Methods ---

  async createReport(reporterId: string, input: CreateReportInput): Promise<ReporterReportItemDto> {
    const reporterUser = await User.findById(reporterId).exec();
    if (!reporterUser) {
      throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Reporter account not found');
    }

    let targetTitle = '';
    let targetLink: string | null = null;

    if (input.target_type === 'user') {
      if (input.target_id === reporterId) {
        throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, REPORT_MESSAGES.SELF_REPORT_FORBIDDEN);
      }
      const targetUser = await User.findById(input.target_id).exec();
      if (!targetUser) {
        throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, REPORT_MESSAGES.TARGET_NOT_FOUND);
      }
      targetTitle = targetUser.full_name || targetUser.username || targetUser.email;
      targetLink = `/admin/users/${targetUser._id.toString()}`;
    } else if (input.target_type === 'job') {
      const targetJob = await JobPosting.findById(input.target_id).exec();
      if (!targetJob) {
        throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, REPORT_MESSAGES.TARGET_NOT_FOUND);
      }
      if (
        targetJob.posted_by_user_id?.toString() === reporterId ||
        (reporterUser.enterprise_id &&
          targetJob.enterprise_id &&
          reporterUser.enterprise_id.toString() === targetJob.enterprise_id.toString())
      ) {
        throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, REPORT_MESSAGES.SELF_REPORT_FORBIDDEN);
      }
      targetTitle = targetJob.title;
      targetLink = targetJob.slug ? `/career/${targetJob.slug}` : `/jobs/${targetJob._id.toString()}`;
    } else if ((input.target_type as string) === 'enterprise' || input.target_type === 'company') {
      const targetEnterprise = await Enterprise.findById(input.target_id).exec();
      if (!targetEnterprise) {
        throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, REPORT_MESSAGES.TARGET_NOT_FOUND);
      }
      if (
        (reporterUser.enterprise_id &&
          reporterUser.enterprise_id.toString() === input.target_id) ||
        targetEnterprise.creator_account_id?.toString() === reporterId
      ) {
        throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, REPORT_MESSAGES.SELF_REPORT_FORBIDDEN);
      }
      targetTitle = targetEnterprise.name;
      targetLink = `/enterprises/${targetEnterprise._id.toString()}`;
    }

    const twentyFourHoursAgo = new Date(Date.now() - REPORT_TIME_LIMITS.TWENTY_FOUR_HOURS_MS);
    const existingPending = await this.repo.findActivePendingByTarget(
      reporterId,
      input.target_type,
      input.target_id,
      twentyFourHoursAgo,
    );

    if (existingPending) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, REPORT_MESSAGES.DUPLICATE_PENDING);
    }

    const ticketId = this.repo.generateTicketId();
    const reference = ticketId;

    const evidenceFiles = (input.evidence_files || []).map((url) => ({
      file_url: url,
      storage_key: '',
      file_name: 'evidence-url',
      mime_type: 'image/jpeg',
      size: 0,
      uploaded_at: new Date(),
    }));

    const created = await this.repo.create({
      ticket_id: ticketId,
      reference,
      reporter_id: new Types.ObjectId(reporterId),
      target_type: input.target_type,
      target_id: new Types.ObjectId(input.target_id),
      target_title: targetTitle,
      target_link: targetLink,
      target_snapshot: {
        title: targetTitle,
        subtitle: targetLink || '',
      },
      reason_category: input.reason_category,
      reason: input.reason_category as unknown as ReportReason,
      title: input.title,
      description: input.description,
      statement: input.description,
      evidence_files: evidenceFiles,
      is_anonymous: input.is_anonymous,
      status: 'pending',
      hidden_by_reporter: false,
      is_deleted_by_reporter: false,
      status_history: [
        {
          status: 'pending',
          changed_at: new Date(),
          changed_by: new Types.ObjectId(reporterId),
          note: 'Report submitted by reporter',
        },
      ],
      timeline: [
        {
          status: 'pending',
          timestamp: new Date(),
          actor_id: new Types.ObjectId(reporterId),
          note: 'Report submitted by reporter',
        },
      ],
    });

    await notificationsService
      .dispatch({
        recipientId: reporterId,
        title: 'Báo cáo vi phạm đã được gửi',
        message: `Báo cáo #${ticketId} đối với "${targetTitle}" đã được tiếp nhận và đưa vào hàng chờ xem xét.`,
        type: 'account_alert',
        category: 'info',
        actionUrl: `/me/reports/${created._id.toString()}`,
      })
      .catch(() => {});

    return this.mapToReporterDto(created);
  }

  async listReporterReports(
    reporterId: string,
    query: ReporterReportsQuery,
  ): Promise<{ items: ReporterReportItemDto[]; kpis: ReportKpisDto; page: number; limit: number; total: number; totalPages: number }> {
    const result = await this.repo.findReporterReports(reporterId, query);
    return {
      items: result.items.map((doc) => this.mapToReporterDto(doc)),
      kpis: result.kpis,
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / query.limit) || 1,
    };
  }

  async getReporterReportById(reporterId: string, id: string): Promise<ReporterReportItemDto> {
    const report = await this.repo.findReporterReportById(reporterId, id);
    if (!report) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, REPORT_MESSAGES.NOT_FOUND);
    }
    return this.mapToReporterDto(report);
  }

  async getReporterReportDetail(reporterId: string, id: string): Promise<ReporterReportItemDto> {
    return this.getReporterReportById(reporterId, id);
  }

  async deleteReporterReport(reporterId: string, id: string): Promise<{ success: boolean; message: string }> {
    const report = await this.repo.findReporterReportById(reporterId, id);
    if (!report) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, REPORT_MESSAGES.NOT_FOUND);
    }
    if (OPEN_REPORT_STATUSES.includes(report.status)) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, REPORT_MESSAGES.NOT_TERMINAL_CANNOT_DELETE);
    }
    await this.repo.softDeleteByReporter(id, reporterId);
    return { success: true, message: REPORT_MESSAGES.DELETED };
  }

  async listAdminReports(
    query: AdminReportsQuery,
  ): Promise<PaginatedAdminReportsResponse<AdminReportItemDto>> {
    const result = await this.repo.findAdminReports(query);
    return {
      items: result.items.map((doc) => this.mapToAdminDto(doc as never)),
      kpis: result.kpis,
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / query.limit) || 1,
    };
  }

  async getAdminReportById(id: string): Promise<AdminReportItemDto> {
    const report = await this.repo.findById(id);
    if (!report) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, REPORT_MESSAGES.NOT_FOUND);
    }
    return this.mapToAdminDto(report as never);
  }

  async claimTicket(id: string, adminId: string): Promise<AdminReportItemDto> {
    const report = await this.repo.findById(id);
    if (!report) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, REPORT_MESSAGES.NOT_FOUND);
    }
    if (report.status !== 'pending') {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, 'Ticket is not pending and cannot be claimed');
    }
    const updated = await this.repo.claimTicket(id, adminId);
    if (!updated) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, REPORT_MESSAGES.NOT_FOUND);
    }
    return this.mapToAdminDto(updated as never);
  }

  async resolveTicket(
    id: string,
    adminId: string,
    input: AdminResolveReportInput,
  ): Promise<{ message: string; report: AdminReportItemDto }> {
    const report = await this.repo.findById(id);
    if (!report) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, REPORT_MESSAGES.NOT_FOUND);
    }
    if (report.status === 'resolved' || report.status === 'rejected') {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, REPORT_MESSAGES.ALREADY_RESOLVED);
    }

    const updated = await this.repo.resolveTicket(id, adminId, input);
    if (!updated) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, REPORT_MESSAGES.NOT_FOUND);
    }

    if (input.decision === 'resolved' && input.action_taken) {
      await this.applyAtomicEnforcement(report.target_type, report.target_id.toString(), input.action_taken);
    }

    const reporterRawId = report.reporter_id as unknown as { _id?: Types.ObjectId };
    const recipientId = reporterRawId?._id ? reporterRawId._id.toString() : report.reporter_id.toString();

    await notificationsService
      .dispatch({
        recipientId,
        title: `Báo cáo #${report.ticket_id || report.reference} đã được xử lý`,
        message: input.message_to_reporter,
        type: 'account_alert',
        category: input.decision === 'resolved' ? 'success' : 'info',
        actionUrl: `/me/reports/${report._id.toString()}`,
      })
      .catch(() => {});

    return {
      message: REPORT_MESSAGES.RESOLVED,
      report: this.mapToAdminDto(updated as never),
    };
  }

  private async applyAtomicEnforcement(
    targetType: string,
    targetId: string,
    actionTaken: string,
  ): Promise<void> {
    try {
      if (actionTaken === 'content_takedown') {
        if (targetType === 'job') {
          await JobPosting.findByIdAndUpdate(targetId, {
            status: 'closed',
            closed_at: new Date(),
          }).exec();
        } else if (targetType === 'enterprise' || targetType === 'company') {
          await Enterprise.findByIdAndUpdate(targetId, {
            status: 'suspended',
            status_reason: 'Content takedown enforcement from violation report',
            status_updated_at: new Date(),
          }).exec();
        }
      } else if (actionTaken === 'account_suspended') {
        if (targetType === 'user') {
          await User.findByIdAndUpdate(targetId, {
            status: 'suspended',
            status_reason: 'Account suspended following verified policy violation report',
            status_updated_at: new Date(),
          }).exec();
        }
      }
    } catch {
      // Best-effort enforcement
    }
  }

  private mapToReporterDto(doc: ReportDoc): ReporterReportItemDto {
    const rawFiles = doc.evidence_files || [];
    const evidenceUrls = rawFiles.map((f: ReportEvidenceFile | string) =>
      typeof f === 'string' ? f : f.file_url,
    );

    return {
      id: doc._id ? doc._id.toString() : '',
      ticket_id: doc.ticket_id || doc.reference || '',
      target_type: doc.target_type,
      target_id: doc.target_id ? doc.target_id.toString() : '',
      target_title: doc.target_title || doc.target_snapshot?.title || '',
      target_link: doc.target_link ?? null,
      reason_category: doc.reason_category || doc.reason,
      title: doc.title || doc.reason,
      description: doc.description || doc.statement || '',
      evidence_files: evidenceUrls,
      is_anonymous: doc.is_anonymous ?? false,
      status: doc.status,
      withdrawal_reason: doc.withdrawal_reason ?? null,
      withdrawn_at: doc.withdrawn_at ? doc.withdrawn_at.toISOString() : null,
      resolution_decision: doc.resolution_decision ?? null,
      action_taken: doc.action_taken ?? null,
      message_to_reporter: doc.message_to_reporter ?? doc.resolution_response ?? null,
      resolved_at: doc.resolved_at ? doc.resolved_at.toISOString() : null,
      timeline: (doc.timeline || []).map((t: ReportTimelineEvent) => ({
        status: t.status,
        timestamp: t.timestamp ? new Date(t.timestamp).toISOString() : new Date().toISOString(),
        note: t.note ?? null,
      })),
      createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : new Date().toISOString(),
    };
  }

  private mapToAdminDto(
    doc: ReportDoc & {
      reporter_id?: {
        _id?: Types.ObjectId | string;
        email?: string;
        full_name?: string | null;
        username?: string | null;
        createdAt?: Date;
        toString?: () => string;
      };
      assigned_admin_id?: {
        _id?: Types.ObjectId | string;
        email?: string;
        full_name?: string | null;
        toString?: () => string;
      };
    },
  ): AdminReportItemDto {
    const base = this.mapToReporterDto(doc);
    const reporterUser = doc.reporter_id;
    const assignedAdmin = doc.assigned_admin_id;

    return {
      ...base,
      reporter: {
        id: reporterUser?._id ? reporterUser._id.toString() : (reporterUser?.toString?.() ?? ''),
        email: reporterUser?.email ?? 'Unknown',
        full_name: reporterUser?.full_name ?? null,
        username: reporterUser?.username ?? null,
        created_at: reporterUser?.createdAt ? new Date(reporterUser.createdAt).toISOString() : null,
      },
      assigned_admin: assignedAdmin
        ? {
            id: assignedAdmin._id ? assignedAdmin._id.toString() : assignedAdmin.toString(),
            email: assignedAdmin.email ?? '',
            full_name: assignedAdmin.full_name ?? null,
          }
        : null,
      reviewed_at: doc.reviewed_at ? new Date(doc.reviewed_at).toISOString() : null,
      internal_notes: doc.internal_notes ?? null,
    };
  }

  private async resolveAndValidateTarget(
    reporterId: string,
    targetType: ReportTargetType,
    targetId: string,
    reporterUser: { enterprise_id?: Types.ObjectId | null | undefined },
  ): Promise<ResolvedTarget> {
    if (targetType === 'job') {
      const job = await JobPosting.findById(targetId).populate('enterprise_id').exec();
      if (!job) {
        throw createHttpError(
          HTTP_STATUS.HTTP_404_NOT_FOUND,
          REPORT_MESSAGES.TARGET_NOT_FOUND,
          REPORT_ERROR_CODES.TARGET_UNAVAILABLE,
        );
      }

      if (
        job.posted_by_user_id?.toString() === reporterId ||
        (reporterUser.enterprise_id &&
          job.enterprise_id &&
          reporterUser.enterprise_id.toString() ===
            ((job.enterprise_id as unknown as { _id?: Types.ObjectId })._id?.toString() ??
              job.enterprise_id.toString()))
      ) {
        throw createHttpError(
          HTTP_STATUS.HTTP_400_BAD_REQUEST,
          REPORT_MESSAGES.SELF_REPORT_FORBIDDEN,
        );
      }

      const isAvailable = (job.status as string) === 'published';
      const enterprise = job.enterprise_id as unknown as {
        _id?: Types.ObjectId;
        name?: string;
      } | null;

      return {
        isAvailable,
        snapshot: {
          title: job.title,
          subtitle: enterprise?.name ?? 'Enterprise',
          enterprise_id: enterprise?._id ? new Types.ObjectId(enterprise._id) : null,
          enterprise_name: enterprise?.name ?? null,
        },
        title: job.title,
        link: job.slug ? `/career/${job.slug}` : `/jobs/${job._id.toString()}`,
      };
    }

    if (targetType === 'company' || targetType === 'enterprise') {
      const enterprise = await Enterprise.findById(targetId).exec();
      if (!enterprise) {
        throw createHttpError(
          HTTP_STATUS.HTTP_404_NOT_FOUND,
          REPORT_MESSAGES.TARGET_NOT_FOUND,
          REPORT_ERROR_CODES.TARGET_UNAVAILABLE,
        );
      }

      if (
        (reporterUser.enterprise_id &&
          reporterUser.enterprise_id.toString() === targetId) ||
        enterprise.creator_account_id?.toString() === reporterId
      ) {
        throw createHttpError(
          HTTP_STATUS.HTTP_400_BAD_REQUEST,
          REPORT_MESSAGES.SELF_REPORT_FORBIDDEN,
        );
      }

      const isAvailable = (enterprise.status as string) === 'active';

      return {
        isAvailable,
        snapshot: {
          title: enterprise.name,
          subtitle: enterprise.industry ?? 'Company',
          enterprise_id: enterprise._id,
          enterprise_name: enterprise.name,
        },
        title: enterprise.name,
        link: `/enterprises/${enterprise._id.toString()}`,
      };
    }

    if (targetType === 'user') {
      if (targetId === reporterId) {
        throw createHttpError(
          HTTP_STATUS.HTTP_400_BAD_REQUEST,
          REPORT_MESSAGES.SELF_REPORT_FORBIDDEN,
        );
      }

      const user = await User.findById(targetId).exec();
      if (!user) {
        throw createHttpError(
          HTTP_STATUS.HTTP_404_NOT_FOUND,
          REPORT_MESSAGES.TARGET_NOT_FOUND,
          REPORT_ERROR_CODES.TARGET_UNAVAILABLE,
        );
      }

      const isAvailable = (user.status as string) === 'active';
      const displayName = user.full_name || user.username || user.email;

      return {
        isAvailable,
        snapshot: {
          title: displayName,
          subtitle: user.role ?? 'User',
          enterprise_id: user.enterprise_id ?? null,
          enterprise_name: null,
        },
        title: displayName,
        link: `/users/${user._id.toString()}`,
      };
    }

    throw createHttpError(
      HTTP_STATUS.HTTP_400_BAD_REQUEST,
      'Invalid target type',
    );
  }

  private buildStatusDescription(status: ReportStatus): string {
    switch (status) {
      case 'pending':
        return 'We’ve received your report. Our team reviews issues to protect the community.';
      case 'reviewing':
        return 'Our safety team is currently investigating your report.';
      case 'resolved':
        return 'We’ve concluded our review and taken appropriate enforcement action.';
      case 'rejected':
        return 'After careful review, we didn’t find a violation of our community standards.';
      case 'withdrawn':
        return 'You withdrew this report. The review was stopped and a record was kept.';
      default:
        return '';
    }
  }
}

export const reportsService = new ReportsService();
