import { Types, type ClientSession, type QueryFilter } from 'mongoose';

import { Report, type ReportData, type ReportDoc } from '../../models/report.model.js';
import {
  CLOSED_REPORT_STATUSES,
  OPEN_REPORT_STATUSES,
  type ReportStatus,
  type ReportTargetType,
} from './reports.constants.js';
import type { ReportsQuery } from './reports.schemas.js';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class ReportsRepository {
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
    if (!Types.ObjectId.isValid(id)) return null;
    return Report.findById(id).exec();
  }

  async findByReference(reference: string): Promise<ReportDoc | null> {
    return Report.findOne({ reference }).exec();
  }

  async findByIdOrReference(idOrRef: string, reporterId?: string): Promise<ReportDoc | null> {
    const conditions: QueryFilter<ReportData>[] = [{ reference: idOrRef }];
    if (Types.ObjectId.isValid(idOrRef)) {
      conditions.push({ _id: new Types.ObjectId(idOrRef) });
    }

    const query: QueryFilter<ReportData> = { $or: conditions };
    if (reporterId && Types.ObjectId.isValid(reporterId)) {
      query.reporter_id = new Types.ObjectId(reporterId);
    }

    return Report.findOne(query).exec();
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

    // Check open report on identical target
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
        { 'target_snapshot.title': searchRegex },
        { 'target_snapshot.enterprise_name': searchRegex },
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

  async withdrawIfPending(
    idOrRef: string,
    reporterId: string,
    note?: string,
    session?: ClientSession,
  ): Promise<ReportDoc | null> {
    const conditions: QueryFilter<ReportData>[] = [{ reference: idOrRef }];
    if (Types.ObjectId.isValid(idOrRef)) {
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
      },
      $push: {
        status_history: {
          status: 'withdrawn' as ReportStatus,
          changed_at: now,
          changed_by: new Types.ObjectId(reporterId),
          note: note ?? 'Withdrawn by reporter',
        },
      },
    };

    return Report.findOneAndUpdate(filter, update, {
      returnDocument: 'after',
      ...(session ? { session } : {}),
    }).exec();
  }

  async hideIfClosed(
    idOrRef: string,
    reporterId: string,
    session?: ClientSession,
  ): Promise<ReportDoc | null> {
    const conditions: QueryFilter<ReportData>[] = [{ reference: idOrRef }];
    if (Types.ObjectId.isValid(idOrRef)) {
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
      },
    };

    return Report.findOneAndUpdate(filter, update, {
      returnDocument: 'after',
      ...(session ? { session } : {}),
    }).exec();
  }
}

export const reportsRepository = new ReportsRepository();
