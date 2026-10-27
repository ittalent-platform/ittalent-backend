import { randomBytes } from 'node:crypto';
import { isValidObjectId, Types } from 'mongoose';

import { Report, type ReportData, type ReportDoc, type ReportTargetType } from '../../models/report.model.js';
import type {
  AdminReportsQuery,
  AdminResolveReportInput,
  ReportKpisDto,
  ReporterReportsQuery,
} from './reports.schemas.js';
import { REPORT_CRYPTO } from './reports.constants.js';

export class ReportsRepository {
  generateTicketId(date = new Date()): string {
    const yyyy = date.getFullYear();
    const randomSuffix = randomBytes(REPORT_CRYPTO.RANDOM_TICKET_BYTES).toString('hex').toUpperCase();
    return `REP-${yyyy}-${randomSuffix}`;
  }

  async create(data: Partial<ReportData>): Promise<ReportDoc> {
    const report = new Report(data);
    return report.save();
  }

  async findById(id: string): Promise<ReportDoc | null> {
    const query = isValidObjectId(id) ? { _id: id } : { ticket_id: id };
    return Report.findOne(query)
      .populate('reporter_id', 'email full_name username createdAt')
      .populate('assigned_admin_id', 'email full_name')
      .exec();
  }

  async findReporterReportById(reporterId: string, id: string): Promise<ReportDoc | null> {
    const query: Record<string, unknown> = {
      reporter_id: new Types.ObjectId(reporterId),
      is_deleted_by_reporter: false,
    };
    if (isValidObjectId(id)) {
      query._id = new Types.ObjectId(id);
    } else {
      query.ticket_id = id;
    }
    return Report.findOne(query).exec();
  }

  async findActivePendingByTarget(
    reporterId: string,
    targetType: ReportTargetType,
    targetId: string,
    sinceDate: Date,
  ): Promise<ReportDoc | null> {
    return Report.findOne({
      reporter_id: new Types.ObjectId(reporterId),
      target_type: targetType,
      target_id: new Types.ObjectId(targetId),
      status: 'pending',
      createdAt: { $gte: sinceDate },
    }).exec();
  }

  async findReporterReports(
    reporterId: string,
    query: ReporterReportsQuery,
  ): Promise<{ items: ReportDoc[]; total: number; kpis: ReportKpisDto }> {
    const baseFilter: Record<string, unknown> = {
      reporter_id: new Types.ObjectId(reporterId),
      is_deleted_by_reporter: false,
    };

    const filter: Record<string, unknown> = { ...baseFilter };
    if (query.status && query.status !== 'all') {
      filter.status = query.status;
    }

    const [items, total, pending, reviewing, resolved, rejected, withdrawn] = await Promise.all([
      Report.find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .exec(),
      Report.countDocuments(filter),
      Report.countDocuments({ ...baseFilter, status: 'pending' }),
      Report.countDocuments({ ...baseFilter, status: 'reviewing' }),
      Report.countDocuments({ ...baseFilter, status: 'resolved' }),
      Report.countDocuments({ ...baseFilter, status: 'rejected' }),
      Report.countDocuments({ ...baseFilter, status: 'withdrawn' }),
    ]);

    const totalSubmitted = pending + reviewing + resolved + rejected + withdrawn;

    return {
      items,
      total,
      kpis: {
        total: totalSubmitted,
        pending,
        reviewing,
        resolved,
        rejected,
        withdrawn,
      },
    };
  }

  async findAdminReports(
    query: AdminReportsQuery,
  ): Promise<{ items: ReportDoc[]; total: number; kpis: ReportKpisDto }> {
    const filter: Record<string, unknown> = {};

    if (query.status && query.status !== 'all') {
      filter.status = query.status;
    }

    if (query.target_type && query.target_type !== 'all') {
      filter.target_type = query.target_type;
    }

    if (query.category && query.category !== 'all') {
      filter.reason_category = query.category;
    }

    if (query.search) {
      const searchRegex = new RegExp(query.search.trim(), 'i');
      filter.$or = [
        { ticket_id: searchRegex },
        { target_title: searchRegex },
        { title: searchRegex },
      ];
    }

    const [items, total, pending, reviewing, resolved, rejected, withdrawn] = await Promise.all([
      Report.find(filter)
        .populate('reporter_id', 'email full_name username createdAt')
        .populate('assigned_admin_id', 'email full_name')
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .exec(),
      Report.countDocuments(filter),
      Report.countDocuments({ status: 'pending' }),
      Report.countDocuments({ status: 'reviewing' }),
      Report.countDocuments({ status: 'resolved' }),
      Report.countDocuments({ status: 'rejected' }),
      Report.countDocuments({ status: 'withdrawn' }),
    ]);

    return {
      items,
      total,
      kpis: {
        total: pending + reviewing + resolved + rejected + withdrawn,
        pending,
        reviewing,
        resolved,
        rejected,
        withdrawn,
      },
    };
  }

  async withdrawReport(id: string, reporterId: string, reason?: string): Promise<ReportDoc | null> {
    const query = isValidObjectId(id) ? { _id: id } : { ticket_id: id };
    const report = await Report.findOne({
      ...query,
      reporter_id: new Types.ObjectId(reporterId),
    });

    if (!report) {
      return null;
    }

    report.status = 'withdrawn';
    report.withdrawn_at = new Date();
    report.withdrawal_reason = reason ?? 'Withdrawn by reporter';
    report.timeline.push({
      status: 'withdrawn',
      timestamp: new Date(),
      actor_id: new Types.ObjectId(reporterId),
      note: reason ?? 'Report retracted by reporter',
    });

    return report.save();
  }

  async softDeleteByReporter(id: string, reporterId: string): Promise<ReportDoc | null> {
    const query = isValidObjectId(id) ? { _id: id } : { ticket_id: id };
    const report = await Report.findOne({
      ...query,
      reporter_id: new Types.ObjectId(reporterId),
    });

    if (!report) {
      return null;
    }

    report.is_deleted_by_reporter = true;
    report.deleted_by_reporter_at = new Date();
    return report.save();
  }

  async claimTicket(id: string, adminId: string): Promise<ReportDoc | null> {
    const query = isValidObjectId(id) ? { _id: id } : { ticket_id: id };
    const report = await Report.findOne(query);

    if (!report) {
      return null;
    }

    report.status = 'reviewing';
    report.assigned_admin_id = new Types.ObjectId(adminId);
    report.reviewed_at = new Date();
    report.timeline.push({
      status: 'reviewing',
      timestamp: new Date(),
      actor_id: new Types.ObjectId(adminId),
      note: 'Ticket claimed for investigation by administrator',
    });

    return report.save();
  }

  async resolveTicket(
    id: string,
    adminId: string,
    resolution: AdminResolveReportInput,
  ): Promise<ReportDoc | null> {
    const query = isValidObjectId(id) ? { _id: id } : { ticket_id: id };
    const report = await Report.findOne(query);

    if (!report) {
      return null;
    }

    report.status = resolution.decision;
    report.resolution_decision = resolution.decision;
    report.action_taken = resolution.action_taken ?? 'none';
    report.internal_notes = resolution.internal_notes;
    report.message_to_reporter = resolution.message_to_reporter;
    report.resolved_at = new Date();
    report.assigned_admin_id = new Types.ObjectId(adminId);
    report.timeline.push({
      status: resolution.decision,
      timestamp: new Date(),
      actor_id: new Types.ObjectId(adminId),
      note: `Report ${resolution.decision}: ${resolution.action_taken ?? 'none'}`,
    });

    return report.save();
  }
}

export const reportsRepository = new ReportsRepository();
