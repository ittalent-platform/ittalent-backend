import { Types } from 'mongoose';

import { Enterprise } from '../../models/enterprise.model.js';
import { JobPosting } from '../../models/job-posting.model.js';
import { User } from '../../models/user.model.js';
import type { ReportDoc, ReportTimelineEvent } from '../../models/report.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { REPORT_MESSAGES, REPORT_TIME_LIMITS } from './reports.constants.js';
import { reportsRepository, type ReportsRepository } from './reports.repository.js';
import type {
  AdminReportItemDto,
  AdminReportsQuery,
  AdminResolveReportInput,
  CreateReportInput,
  PaginatedReportsResponse,
  ReporterReportItemDto,
  ReporterReportsQuery,
  WithdrawReportInput,
} from './reports.schemas.js';

export class ReportsService {
  constructor(private readonly repository: ReportsRepository = reportsRepository) {}

  async createReport(reporterId: string, input: CreateReportInput): Promise<ReporterReportItemDto> {
    const reporterUser = await User.findById(reporterId).exec();
    if (!reporterUser) {
      throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Reporter account not found');
    }

    let targetTitle = '';
    let targetLink: string | null = null;

    // BR-REP-01: Self-Report Prevention and Target Validation
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

      // Check if user is the poster or from same enterprise
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
    } else if (input.target_type === 'enterprise') {
      const targetEnterprise = await Enterprise.findById(input.target_id).exec();
      if (!targetEnterprise) {
        throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, REPORT_MESSAGES.TARGET_NOT_FOUND);
      }

      // Check if user belongs to this enterprise
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

    // BR-REP-02: Duplicate Pending Restriction (within 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - REPORT_TIME_LIMITS.TWENTY_FOUR_HOURS_MS);
    const existingPending = await this.repository.findActivePendingByTarget(
      reporterId,
      input.target_type,
      input.target_id,
      twentyFourHoursAgo,
    );

    if (existingPending) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, REPORT_MESSAGES.DUPLICATE_PENDING);
    }

    const ticketId = this.repository.generateTicketId();

    const created = await this.repository.create({
      ticket_id: ticketId,
      reporter_id: new Types.ObjectId(reporterId),
      target_type: input.target_type,
      target_id: new Types.ObjectId(input.target_id),
      target_title: targetTitle,
      target_link: targetLink,
      reason_category: input.reason_category,
      title: input.title,
      description: input.description,
      evidence_files: input.evidence_files ?? [],
      is_anonymous: input.is_anonymous ?? true,
      status: 'pending',
      timeline: [
        {
          status: 'pending',
          timestamp: new Date(),
          actor_id: new Types.ObjectId(reporterId),
          note: 'Report submitted by reporter',
        },
      ],
    });

    // Send in-app notification to reporter
    await notificationsService
      .dispatch({
        recipientId: reporterId,
        title: 'Báo cáo vi phạm đã được gửi',
        message: `Báo cáo #${ticketId} đối với "${targetTitle}" đã được tiếp nhận và đưa vào hàng chờ xem xét.`,
        type: 'account_alert',
        category: 'info',
        actionUrl: `/my-reports/${created._id.toString()}`,
      })
      .catch(() => {});

    return this.mapToReporterDto(created);
  }

  async listReporterReports(
    reporterId: string,
    query: ReporterReportsQuery,
  ): Promise<PaginatedReportsResponse<ReporterReportItemDto>> {
    const { items, total, kpis } = await this.repository.findReporterReports(reporterId, query);

    const totalPages = total > 0 ? Math.ceil(total / query.limit) : 0;

    return {
      items: items.map((doc) => this.mapToReporterDto(doc)),
      kpis,
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
    };
  }

  async getReporterReportDetail(reporterId: string, id: string): Promise<ReporterReportItemDto> {
    const report = await this.repository.findReporterReportById(reporterId, id);

    if (!report) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, REPORT_MESSAGES.NOT_FOUND);
    }

    return this.mapToReporterDto(report);
  }

  async withdrawReport(
    reporterId: string,
    id: string,
    input: WithdrawReportInput,
  ): Promise<{ message: string; report: ReporterReportItemDto }> {
    const report = await this.repository.findReporterReportById(reporterId, id);

    if (!report) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, REPORT_MESSAGES.NOT_FOUND);
    }

    // BR-REP-08: Pending-Only Withdrawal Guard
    if (report.status !== 'pending') {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, REPORT_MESSAGES.NOT_PENDING_CANNOT_WITHDRAW);
    }

    const updated = await this.repository.withdrawReport(
      report._id.toString(),
      reporterId,
      input.withdrawal_reason,
    );

    if (!updated) {
      throw createHttpError(HTTP_STATUS.HTTP_500_INTERNAL_SERVER_ERROR, 'Failed to withdraw report');
    }

    return {
      message: REPORT_MESSAGES.WITHDRAWN,
      report: this.mapToReporterDto(updated),
    };
  }

  async deleteReporterReport(
    reporterId: string,
    id: string,
  ): Promise<{ message: string; success: boolean }> {
    const report = await this.repository.findReporterReportById(reporterId, id);

    if (!report) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, REPORT_MESSAGES.NOT_FOUND);
    }

    // BR-REP-10: Active Ticket Deletion Guard
    if (report.status === 'pending' || report.status === 'reviewing') {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, REPORT_MESSAGES.NOT_TERMINAL_CANNOT_DELETE);
    }

    await this.repository.softDeleteByReporter(report._id.toString(), reporterId);

    return {
      message: REPORT_MESSAGES.DELETED,
      success: true,
    };
  }

  async listAdminReports(
    query: AdminReportsQuery,
  ): Promise<PaginatedReportsResponse<AdminReportItemDto>> {
    const { items, total, kpis } = await this.repository.findAdminReports(query);

    const totalPages = total > 0 ? Math.ceil(total / query.limit) : 0;

    return {
      items: items.map((doc) => this.mapToAdminDto(doc)),
      kpis,
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
    };
  }

  async getAdminReportDetail(id: string): Promise<AdminReportItemDto> {
    const report = await this.repository.findById(id);

    if (!report) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, REPORT_MESSAGES.NOT_FOUND);
    }

    return this.mapToAdminDto(report);
  }

  async claimTicket(adminId: string, id: string): Promise<AdminReportItemDto> {
    const report = await this.repository.findById(id);

    if (!report) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, REPORT_MESSAGES.NOT_FOUND);
    }

    if (report.status !== 'pending') {
      if (report.status === 'reviewing') {
        return this.mapToAdminDto(report);
      }
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, REPORT_MESSAGES.ALREADY_RESOLVED);
    }

    const updated = await this.repository.claimTicket(report._id.toString(), adminId);
    if (!updated) {
      throw createHttpError(HTTP_STATUS.HTTP_500_INTERNAL_SERVER_ERROR, 'Failed to claim ticket');
    }

    return this.mapToAdminDto(updated);
  }

  async resolveTicket(
    adminId: string,
    id: string,
    input: AdminResolveReportInput,
  ): Promise<{ message: string; report: AdminReportItemDto }> {
    const report = await this.repository.findById(id);

    if (!report) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, REPORT_MESSAGES.NOT_FOUND);
    }

    // BR-ADM-REP-06: Resolution Immutability
    if (report.status === 'resolved' || report.status === 'rejected' || report.status === 'withdrawn') {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, REPORT_MESSAGES.ALREADY_RESOLVED);
    }

    const updated = await this.repository.resolveTicket(report._id.toString(), adminId, input);
    if (!updated) {
      throw createHttpError(HTTP_STATUS.HTTP_500_INTERNAL_SERVER_ERROR, 'Failed to resolve ticket');
    }

    // BR-ADM-REP-04: Atomic Enforcement Execution
    if (input.decision === 'resolved' && input.action_taken) {
      await this.applyAtomicEnforcement(report.target_type, report.target_id.toString(), input.action_taken);
    }

    // BR-ADM-REP-05: Automated Reporter Outcome Notice
    await notificationsService
      .dispatch({
        recipientId: report.reporter_id._id
          ? report.reporter_id._id.toString()
          : report.reporter_id.toString(),
        title: `Báo cáo #${report.ticket_id} đã được xử lý`,
        message: input.message_to_reporter,
        type: 'account_alert',
        category: input.decision === 'resolved' ? 'success' : 'info',
        actionUrl: `/my-reports/${report._id.toString()}`,
      })
      .catch(() => {});

    return {
      message: REPORT_MESSAGES.RESOLVED,
      report: this.mapToAdminDto(updated),
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
        } else if (targetType === 'enterprise') {
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
        } else if (targetType === 'enterprise') {
          await Enterprise.findByIdAndUpdate(targetId, {
            status: 'suspended',
            status_reason: 'Enterprise suspended following verified violation report',
            status_updated_at: new Date(),
          }).exec();
        } else if (targetType === 'job') {
          const job = await JobPosting.findById(targetId).exec();
          if (job) {
            job.status = 'closed';
            job.closed_at = new Date();
            await job.save();

            if (job.enterprise_id) {
              await Enterprise.findByIdAndUpdate(job.enterprise_id, {
                status: 'suspended',
                status_reason: `Enterprise suspended after fraudulent job #${job._id.toString()}`,
                status_updated_at: new Date(),
              }).exec();
            }
          }
        }
      }
    } catch (err) {
      console.error('Error applying atomic enforcement:', err);
    }
  }

  private mapToReporterDto(doc: ReportDoc): ReporterReportItemDto {
    return {
      id: doc._id.toString(),
      ticket_id: doc.ticket_id,
      target_type: doc.target_type,
      target_id: doc.target_id.toString(),
      target_title: doc.target_title,
      target_link: doc.target_link ?? null,
      reason_category: doc.reason_category,
      title: doc.title,
      description: doc.description,
      evidence_files: doc.evidence_files || [],
      is_anonymous: doc.is_anonymous,
      status: doc.status,
      withdrawal_reason: doc.withdrawal_reason ?? null,
      withdrawn_at: doc.withdrawn_at ? doc.withdrawn_at.toISOString() : null,
      resolution_decision: doc.resolution_decision ?? null,
      action_taken: doc.action_taken ?? null,
      message_to_reporter: doc.message_to_reporter ?? null,
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
}

export const reportsService = new ReportsService();
