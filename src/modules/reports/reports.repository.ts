import { randomBytes } from 'node:crypto';
import { isValidObjectId, Types, type ClientSession, type QueryFilter } from 'mongoose';

import { Report, type ReportData, type ReportDoc } from '../../models/report.model.js';
import {
  CLOSED_REPORT_STATUSES,
  OPEN_REPORT_STATUSES,
  REPORT_CRYPTO,
  type ReportStatus,
  type ReportTargetType,
} from './reports.constants.js';
import type {
  AdminReportsQuery,
  AdminResolveReportInput,
  ReportKpisDto,
  ReporterReportsQuery,
  ReportsQuery,
} from './reports.schemas.js';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class ReportsRepository {
  generateTicketId(date = new Date()): string {
    const yyyy = date.getFullYear();
    const randomSuffix = randomBytes(REPORT_CRYPTO.RANDOM_TICKET_BYTES).toString('hex').toUpperCase();
    return `REP-${yyyy}-${randomSuffix}`;
  }

  async generateNextReference(date = new Date()): Promise<string> {
    const year = date.getFullYear();
    const prefix = `RPT-${year}-`;
    const pattern = new RegExp(`^${prefix}\\d+$`);

    const latest = await Report.findOne({ reference: pattern })
      .sort({ reference: -1 })
      .select('reference')
      .lean()
      .exec();

    let nextSeq = 1;
    if (latest?.reference) {
      const parts = latest.reference.split('-');
      const currentNum = parseInt(parts[2] ?? '0', 10);
      if (!Number.isNaN(currentNum)) {
        nextSeq = currentNum + 1;
      }
    }

    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
  }

  async create(data: Partial<ReportData>, session?: ClientSession): Promise<ReportDoc> {
    const report = new Report(data);
    return report.save(session ? { session } : undefined);
  }

  async findById(id: string): Promise<ReportDoc | null> {
    const query = isValidObjectId(id)
      ? { _id: new Types.ObjectId(id) }
      : { $or: [{ reference: id }, { ticket_id: id }] };
    return Report.findOne(query)
      .populate('reporter_id', 'email full_name username createdAt')
      .populate('assigned_admin_id', 'email full_name')
      .exec();
  }

  async findByReference(reference: string): Promise<ReportDoc | null> {
    return Report.findOne({
      $or: [{ reference }, { ticket_id: reference }],
    }).exec();
  }

  async findByIdOrReference(idOrRef: string, reporterId?: string): Promise<ReportDoc | null> {
    const conditions: QueryFilter<ReportData>[] = [{ reference: idOrRef }];
    if (isValidObjectId(idOrRef)) {
      conditions.push({ _id: new Types.ObjectId(idOrRef) });
    }

    const query: QueryFilter<ReportData> = { $or: conditions };
    if (reporterId && isValidObjectId(reporterId)) {
      query.reporter_id = new Types.ObjectId(reporterId);
    }

    return Report.findOne(query).exec();
  }

  async findReporterReportById(reporterId: string, id: string): Promise<ReportDoc | null> {
    const query: Record<string, unknown> = {
      reporter_id: new Types.ObjectId(reporterId),
      $or: [{ hidden_by_reporter: false }, { is_deleted_by_reporter: false }],
    };
    if (isValidObjectId(id)) {
      query._id = new Types.ObjectId(id);
    } else {
      query.$or = [{ reference: id }, { ticket_id: id }];
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

  async findDuplicate(
    reporterId: string,
    targetType: ReportTargetType,
    targetId: string,
    idempotencyKey?: string | null,
  ): Promise<ReportDoc | null> {
    if (idempotencyKey) {
      const byKey = await Report.findOne({
        reporter_id: new Types.ObjectId(reporterId),
        idempotency_key: idempotencyKey,
      }).exec();
      if (byKey) return byKey;
    }

    return Report.findOne({
      reporter_id: new Types.ObjectId(reporterId),
      target_type: targetType,
      target_id: new Types.ObjectId(targetId),
      status: { $in: OPEN_REPORT_STATUSES },
    }).exec();
  }

  async listByReporter(
    reporterId: string,
    query: ReportsQuery,
  ): Promise<{ items: ReportDoc[]; total: number; page: number; limit: number; totalPages: number }> {
    const filter: QueryFilter<ReportData> = {
      reporter_id: new Types.ObjectId(reporterId),
      hidden_by_reporter: false,
    };

    if (query.status === 'open') {
      filter.status = { $in: OPEN_REPORT_STATUSES };
    } else if (query.status === 'closed') {
      filter.status = { $in: CLOSED_REPORT_STATUSES };
    }

    if (query.search) {
      const sanitized = escapeRegex(query.search.trim());
      const searchRegex = new RegExp(sanitized, 'i');
      filter.$or = [
        { reference: searchRegex },
        { ticket_id: searchRegex },
        { 'target_snapshot.title': searchRegex },
        { 'target_snapshot.enterprise_name': searchRegex },
        { target_title: searchRegex },
      ];
    }

    const page = Math.max(1, query.page);
    const limit = Math.max(1, query.limit);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Report.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      Report.countDocuments(filter).exec(),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return { items, total, page, limit, totalPages };
  }

  async countStatusesByReporter(
    reporterId: string,
  ): Promise<{ all: number; open: number; closed: number }> {
    const baseFilter: QueryFilter<ReportData> = {
      reporter_id: new Types.ObjectId(reporterId),
      hidden_by_reporter: false,
    };

    const [all, open, closed] = await Promise.all([
      Report.countDocuments(baseFilter).exec(),
      Report.countDocuments({ ...baseFilter, status: { $in: OPEN_REPORT_STATUSES } }).exec(),
      Report.countDocuments({ ...baseFilter, status: { $in: CLOSED_REPORT_STATUSES } }).exec(),
    ]);

    return { all, open, closed };
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
      filter.$or = [{ reason_category: query.category }, { reason: query.category }];
    }

    if (query.search) {
      const searchRegex = new RegExp(escapeRegex(query.search.trim()), 'i');
      filter.$or = [
        { ticket_id: searchRegex },
        { reference: searchRegex },
        { target_title: searchRegex },
        { 'target_snapshot.title': searchRegex },
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

  async withdrawIfPending(
    idOrRef: string,
    reporterId: string,
    note?: string,
    session?: ClientSession,
  ): Promise<ReportDoc | null> {
    const conditions: QueryFilter<ReportData>[] = [
      { reference: idOrRef },
      { ticket_id: idOrRef },
    ];
    if (isValidObjectId(idOrRef)) {
      conditions.push({ _id: new Types.ObjectId(idOrRef) });
    }

    const filter: QueryFilter<ReportData> = {
      $or: conditions,
      reporter_id: new Types.ObjectId(reporterId),
      status: 'pending' as ReportStatus,
    };

    const now = new Date();
    const update = {
      $set: {
        status: 'withdrawn' as ReportStatus,
        withdrawn_at: now,
        withdrawal_reason: note ?? 'Withdrawn by reporter',
      },
      $push: {
        status_history: {
          status: 'withdrawn' as ReportStatus,
          changed_at: now,
          changed_by: new Types.ObjectId(reporterId),
          note: note ?? 'Withdrawn by reporter',
        },
        timeline: {
          status: 'withdrawn' as ReportStatus,
          timestamp: now,
          actor_id: new Types.ObjectId(reporterId),
          note: note ?? 'Report retracted by reporter',
        },
      },
    };

    return Report.findOneAndUpdate(filter, update, {
      returnDocument: 'after',
      ...(session ? { session } : {}),
    }).exec();
  }

  async withdrawReport(id: string, reporterId: string, reason?: string): Promise<ReportDoc | null> {
    return this.withdrawIfPending(id, reporterId, reason);
  }

  async hideIfClosed(
    idOrRef: string,
    reporterId: string,
    session?: ClientSession,
  ): Promise<ReportDoc | null> {
    const conditions: QueryFilter<ReportData>[] = [
      { reference: idOrRef },
      { ticket_id: idOrRef },
    ];
    if (isValidObjectId(idOrRef)) {
      conditions.push({ _id: new Types.ObjectId(idOrRef) });
    }

    const filter: QueryFilter<ReportData> = {
      $or: conditions,
      reporter_id: new Types.ObjectId(reporterId),
      status: { $in: CLOSED_REPORT_STATUSES },
    };

    const update = {
      $set: {
        hidden_by_reporter: true,
        hidden_at: new Date(),
        is_deleted_by_reporter: true,
        deleted_by_reporter_at: new Date(),
      },
    };

    return Report.findOneAndUpdate(filter, update, {
      returnDocument: 'after',
      ...(session ? { session } : {}),
    }).exec();
  }

  async softDeleteByReporter(id: string, reporterId: string): Promise<ReportDoc | null> {
    return this.hideIfClosed(id, reporterId);
  }

  async claimTicket(id: string, adminId: string): Promise<ReportDoc | null> {
    const query = isValidObjectId(id)
      ? { _id: new Types.ObjectId(id) }
      : { $or: [{ ticket_id: id }, { reference: id }] };
    const report = await Report.findOne(query);

    if (!report) {
      return null;
    }

    const now = new Date();
    report.status = 'reviewing';
    report.assigned_admin_id = new Types.ObjectId(adminId);
    report.reviewed_at = now;
    report.timeline = report.timeline ?? [];
    report.timeline.push({
      status: 'reviewing',
      timestamp: now,
      actor_id: new Types.ObjectId(adminId),
      note: 'Ticket claimed for investigation by administrator',
    });
    report.status_history = report.status_history ?? [];
    report.status_history.push({
      status: 'reviewing',
      changed_at: now,
      changed_by: new Types.ObjectId(adminId),
      note: 'Ticket claimed for investigation by administrator',
    });

    return report.save();
  }

  async resolveTicket(
    id: string,
    adminId: string,
    resolution: AdminResolveReportInput,
  ): Promise<ReportDoc | null> {
    const query = isValidObjectId(id)
      ? { _id: new Types.ObjectId(id) }
      : { $or: [{ ticket_id: id }, { reference: id }] };
    const report = await Report.findOne(query);

    if (!report) {
      return null;
    }

    const now = new Date();
    report.status = resolution.decision;
    report.resolution_decision = resolution.decision;
    report.action_taken = resolution.action_taken ?? 'none';
    report.internal_notes = resolution.internal_notes;
    report.message_to_reporter = resolution.message_to_reporter;
    report.resolution_response = resolution.message_to_reporter;
    report.resolved_at = now;
    report.assigned_admin_id = new Types.ObjectId(adminId);
    report.timeline = report.timeline ?? [];
    report.timeline.push({
      status: resolution.decision,
      timestamp: now,
      actor_id: new Types.ObjectId(adminId),
      note: `Report ${resolution.decision}: ${resolution.action_taken ?? 'none'}`,
    });
    report.status_history = report.status_history ?? [];
    report.status_history.push({
      status: resolution.decision,
      changed_at: now,
      changed_by: new Types.ObjectId(adminId),
      note: `Report ${resolution.decision}: ${resolution.action_taken ?? 'none'}`,
    });

    return report.save();
  }
}

export const reportsRepository = new ReportsRepository();
