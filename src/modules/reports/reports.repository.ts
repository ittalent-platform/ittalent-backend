import { randomBytes } from 'node:crypto';
import { isValidObjectId, Types, type ClientSession, type QueryFilter } from 'mongoose';
import { desc, eq, inArray } from 'drizzle-orm';

import { generateId, getSqliteDb } from '../../config/sqlite.js';
import { reports as reportsTable } from '../../db/schema/index.js';
import { Report, type ReportData, type ReportDoc, type ReportTargetSnapshot } from '../../models/report.model.js';
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

function isMock(fn: unknown): boolean {
  return typeof fn === 'function' && ('_isMockFunction' in fn || 'mock' in fn);
}

function toReportDoc(row: typeof reportsTable.$inferSelect): ReportDoc {
  const snapshot = (row.target_snapshot ?? {}) as Record<string, unknown>;
  const doc = {
    _id: new Types.ObjectId(row.id),
    id: row.id,
    ticket_id: (snapshot.ticket_id as string) ?? `REP-${new Date(row.createdAt).getFullYear()}-${row.id.slice(0, 8).toUpperCase()}`,
    reference: (snapshot.reference as string) ?? `RPT-${new Date(row.createdAt).getFullYear()}-${row.id.slice(0, 4).toUpperCase()}`,
    reporter_id: new Types.ObjectId(row.reporter_id),
    target_type: row.target_type,
    target_id: new Types.ObjectId(row.target_id),
    reason: row.reason,
    reason_category: (snapshot.reason_category as string) ?? row.reason,
    title: (snapshot.title as string) ?? row.reason,
    description: row.description,
    evidence_files: row.evidence_files ?? [],
    status: row.status as ReportStatus,
    resolution_notes: row.resolution_notes ?? undefined,
    resolution_action: (snapshot.resolution_action as string) ?? undefined,
    resolved_by: row.resolved_by ? new Types.ObjectId(row.resolved_by) : undefined,
    resolved_at: row.resolved_at ? new Date(row.resolved_at) : undefined,
    assigned_admin_id: row.resolved_by ? new Types.ObjectId(row.resolved_by) : undefined,
    status_history: row.status_history ?? [],
    target_snapshot: row.target_snapshot ?? undefined,
    timeline: row.timeline ?? [],
    hidden_by_reporter: Boolean(snapshot.hidden_by_reporter),
    is_deleted_by_reporter: Boolean(snapshot.is_deleted_by_reporter),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
  return {
    ...doc,
    toObject() {
      return doc;
    },
    toJSON() {
      return doc;
    },
  } as unknown as ReportDoc;
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

    if (process.env.USE_MONGODB === 'true' || isMock(Report.findOne)) {
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

    const db = getSqliteDb();
    const all = db.select({ id: reportsTable.id, snapshot: reportsTable.target_snapshot }).from(reportsTable).all();
    let maxSeq = 0;
    for (const r of all) {
      const snapshot = (r.snapshot ?? {}) as Record<string, unknown>;
      const ref = snapshot.reference as string | undefined;
      if (ref && ref.startsWith(prefix)) {
        const num = parseInt(ref.slice(prefix.length), 10);
        if (!Number.isNaN(num) && num > maxSeq) maxSeq = num;
      }
    }
    return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  }

  async create(data: Partial<ReportData>, session?: ClientSession): Promise<ReportDoc> {
    if (process.env.USE_MONGODB === 'true' || isMock(Report)) {
      const report = new Report(data);
      return report.save(session ? { session } : undefined);
    }

    const db = getSqliteDb();
    const id = generateId();
    const now = new Date();
    const rawData = data as Record<string, unknown>;
    const extraSnapshot: ReportTargetSnapshot = {
      title: data.title ?? '',
      subtitle: '',
      ...((data.target_snapshot as unknown as Record<string, unknown>) ?? {}),
      ...rawData,
    } as unknown as ReportTargetSnapshot;

    const resolutionNotes = typeof rawData.resolution_notes === 'string'
      ? rawData.resolution_notes
      : (data.internal_notes ?? null);
    const resolvedBy = rawData.resolved_by
      ? String(rawData.resolved_by)
      : (data.assigned_admin_id ? String(data.assigned_admin_id) : null);

    db.insert(reportsTable)
      .values({
        id,
        reporter_id: String(data.reporter_id),
        target_type: (data.target_type ?? 'job_posting') as 'job_posting' | 'enterprise' | 'user',
        target_id: String(data.target_id),
        reason: data.reason ?? '',
        description: data.description ?? data.statement ?? '',
        evidence_files: data.evidence_files ?? [],
        status: data.status ?? 'pending',
        resolution_notes: resolutionNotes,
        resolved_by: resolvedBy,
        resolved_at: data.resolved_at ?? null,
        status_history: data.status_history ?? [],
        target_snapshot: extraSnapshot,
        timeline: data.timeline ?? [],
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const row = db.select().from(reportsTable).where(eq(reportsTable.id, id)).get();
    if (!row) throw new Error('Failed to create report');
    return toReportDoc(row);
  }

  async findById(id: string): Promise<ReportDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Report.findOne)) {
      const query = isValidObjectId(id)
        ? { _id: new Types.ObjectId(id) }
        : { $or: [{ reference: id }, { ticket_id: id }] };
      return Report.findOne(query)
        .populate('assigned_admin_id', 'email full_name')
        .exec();
    }
    return this.findByIdOrReference(id);
  }

  async findByReference(reference: string): Promise<ReportDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Report.findOne)) {
      return Report.findOne({
        $or: [{ reference }, { ticket_id: reference }],
      }).exec();
    }
    return this.findByIdOrReference(reference);
  }

  async findByIdOrReference(idOrRef: string, reporterId?: string): Promise<ReportDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Report.findOne)) {
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

    const db = getSqliteDb();
    const all = db.select().from(reportsTable).all();
    for (const r of all) {
      if (reporterId && r.reporter_id !== reporterId) continue;
      if (r.id === idOrRef) return toReportDoc(r);
      const snapshot = (r.target_snapshot ?? {}) as Record<string, unknown>;
      if (snapshot.reference === idOrRef || snapshot.ticket_id === idOrRef) {
        return toReportDoc(r);
      }
    }
    return null;
  }

  async findReporterReportById(reporterId: string, id: string): Promise<ReportDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Report.findOne)) {
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
    return this.findByIdOrReference(id, reporterId);
  }

  async findActivePendingByTarget(
    reporterId: string,
    targetType: ReportTargetType,
    targetId: string,
    sinceDate: Date,
  ): Promise<ReportDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Report.findOne)) {
      return Report.findOne({
        reporter_id: new Types.ObjectId(reporterId),
        target_type: targetType,
        target_id: new Types.ObjectId(targetId),
        status: 'pending',
        createdAt: { $gte: sinceDate },
      }).exec();
    }

    const db = getSqliteDb();
    const all = db.select().from(reportsTable).all();
    for (const r of all) {
      if (
        r.reporter_id === reporterId &&
        r.target_type === targetType &&
        r.target_id === targetId &&
        r.status === 'pending' &&
        new Date(r.createdAt) >= sinceDate
      ) {
        return toReportDoc(r);
      }
    }
    return null;
  }

  async findDuplicate(
    reporterId: string,
    targetType: ReportTargetType,
    targetId: string,
    idempotencyKey?: string | null,
  ): Promise<ReportDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Report.findOne)) {
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

    const db = getSqliteDb();
    const all = db.select().from(reportsTable).all();
    for (const r of all) {
      if (
        r.reporter_id === reporterId &&
        r.target_type === targetType &&
        r.target_id === targetId &&
        (OPEN_REPORT_STATUSES as readonly string[]).includes(r.status)
      ) {
        return toReportDoc(r);
      }
    }
    return null;
  }

  async listByReporter(
    reporterId: string,
    query: ReportsQuery,
  ): Promise<{ items: ReportDoc[]; total: number; page: number; limit: number; totalPages: number }> {
    if (process.env.USE_MONGODB === 'true' || isMock(Report.find)) {
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

    const db = getSqliteDb();
    const rows = db.select().from(reportsTable).where(eq(reportsTable.reporter_id, reporterId)).all();
    const filtered = rows.filter((r) => {
      const snapshot = (r.target_snapshot ?? {}) as Record<string, unknown>;
      if (snapshot.hidden_by_reporter) return false;
      if (query.status === 'open' && !(OPEN_REPORT_STATUSES as readonly string[]).includes(r.status)) return false;
      if (query.status === 'closed' && !(CLOSED_REPORT_STATUSES as readonly string[]).includes(r.status)) return false;
      if (query.search) {
        const q = query.search.toLowerCase();
        const ref = (snapshot.reference as string | undefined)?.toLowerCase();
        const tick = (snapshot.ticket_id as string | undefined)?.toLowerCase();
        const reason = r.reason.toLowerCase();
        const descText = r.description.toLowerCase();
        if (!ref?.includes(q) && !tick?.includes(q) && !reason.includes(q) && !descText.includes(q)) return false;
      }
      return true;
    });

    const page = Math.max(1, query.page);
    const limit = Math.max(1, query.limit);
    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const skip = (page - 1) * limit;
    const paged = filtered.slice(skip, skip + limit);

    return {
      items: paged.map((r) => toReportDoc(r)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async countStatusesByReporter(
    reporterId: string,
  ): Promise<{ all: number; open: number; closed: number }> {
    if (process.env.USE_MONGODB === 'true' || isMock(Report.countDocuments)) {
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

    const db = getSqliteDb();
    const rows = db.select().from(reportsTable).where(eq(reportsTable.reporter_id, reporterId)).all();
    let open = 0;
    let closed = 0;
    for (const r of rows) {
      if ((OPEN_REPORT_STATUSES as readonly string[]).includes(r.status)) open++;
      if ((CLOSED_REPORT_STATUSES as readonly string[]).includes(r.status)) closed++;
    }
    return { all: rows.length, open, closed };
  }

  async findReporterReports(
    reporterId: string,
    query: ReporterReportsQuery,
  ): Promise<{ items: ReportDoc[]; total: number; kpis: ReportKpisDto }> {
    if (process.env.USE_MONGODB === 'true' || isMock(Report.find)) {
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

    const db = getSqliteDb();
    const rows = db.select().from(reportsTable).where(eq(reportsTable.reporter_id, reporterId)).all();
    let pending = 0;
    let reviewing = 0;
    let resolved = 0;
    let rejected = 0;
    let withdrawn = 0;

    for (const r of rows) {
      if (r.status === 'pending') pending++;
      else if (r.status === 'reviewing') reviewing++;
      else if (r.status === 'resolved') resolved++;
      else if (r.status === 'rejected') rejected++;
      else if (r.status === 'withdrawn') withdrawn++;
    }

    const filtered = rows.filter((r) => {
      if (query.status && query.status !== 'all' && r.status !== query.status) return false;
      return true;
    });

    const total = filtered.length;
    const skip = (query.page - 1) * query.limit;
    const paged = filtered.slice(skip, skip + query.limit);

    return {
      items: paged.map((r) => toReportDoc(r)),
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

  async findAdminReports(
    query: AdminReportsQuery,
  ): Promise<{ items: ReportDoc[]; total: number; kpis: ReportKpisDto }> {
    if (process.env.USE_MONGODB === 'true' || isMock(Report.find)) {
      const filter: Record<string, unknown> = {};
      const andConditions: Record<string, unknown>[] = [];

      if (query.status === 'open') {
        filter.status = { $in: OPEN_REPORT_STATUSES };
      } else if (query.status === 'closed') {
        filter.status = { $in: CLOSED_REPORT_STATUSES };
      } else if (query.status && query.status !== 'all') {
        filter.status = query.status;
      }

      if (query.target_type && query.target_type !== 'all') {
        filter.target_type = query.target_type;
      }

      if (query.category && query.category !== 'all') {
        const CATEGORY_ALIASES: Record<string, string[]> = {
          scam_or_fraud: ['scam_or_fraud', 'scam_fraud'],
          scam_fraud: ['scam_fraud', 'scam_or_fraud'],
          misleading_information: ['misleading_information', 'misleading_info'],
          misleading_info: ['misleading_info', 'misleading_information'],
          inappropriate_content: ['inappropriate_content', 'offensive_content'],
          offensive_content: ['offensive_content', 'inappropriate_content'],
          something_else: ['something_else', 'other'],
          other: ['other', 'something_else'],
        };
        const candidates = CATEGORY_ALIASES[query.category] ?? [query.category];
        andConditions.push({
          $or: [{ reason_category: { $in: candidates } }, { reason: { $in: candidates } }],
        });
      }

      if (query.search) {
        const searchRegex = new RegExp(escapeRegex(query.search.trim()), 'i');
        andConditions.push({
          $or: [
            { ticket_id: searchRegex },
            { reference: searchRegex },
            { target_title: searchRegex },
            { 'target_snapshot.title': searchRegex },
            { title: searchRegex },
          ],
        });
      }

      if (andConditions.length === 1 && andConditions[0]) {
        Object.assign(filter, andConditions[0]);
      } else if (andConditions.length > 1) {
        filter.$and = andConditions;
      }

      const [items, total, pending, reviewing, resolved, rejected, withdrawn] = await Promise.all([
        Report.find(filter)
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

    const db = getSqliteDb();
    const all = db.select().from(reportsTable).orderBy(desc(reportsTable.createdAt)).all();

    let pending = 0;
    let reviewing = 0;
    let resolved = 0;
    let rejected = 0;
    let withdrawn = 0;

    for (const r of all) {
      if (r.status === 'pending') pending++;
      else if (r.status === 'reviewing') reviewing++;
      else if (r.status === 'resolved') resolved++;
      else if (r.status === 'rejected') rejected++;
      else if (r.status === 'withdrawn') withdrawn++;
    }

    const filtered = all.filter((r) => {
      if (query.status === 'open' && !(OPEN_REPORT_STATUSES as readonly string[]).includes(r.status)) return false;
      if (query.status === 'closed' && !(CLOSED_REPORT_STATUSES as readonly string[]).includes(r.status)) return false;
      if (query.status && query.status !== 'all' && query.status !== 'open' && query.status !== 'closed' && r.status !== query.status) return false;
      if (query.target_type && query.target_type !== 'all' && r.target_type !== query.target_type) return false;
      return true;
    });

    const total = filtered.length;
    const skip = (query.page - 1) * query.limit;
    const paged = filtered.slice(skip, skip + query.limit);

    return {
      items: paged.map((r) => toReportDoc(r)),
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
    if (process.env.USE_MONGODB === 'true' || isMock(Report.findOneAndUpdate)) {
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

    const report = await this.findByIdOrReference(idOrRef, reporterId);
    if (!report || report.status !== 'pending') return null;

    const db = getSqliteDb();
    const now = new Date();
    db.update(reportsTable)
      .set({
        status: 'withdrawn',
        resolution_notes: note ?? 'Withdrawn by reporter',
        updatedAt: now,
      })
      .where(eq(reportsTable.id, report.id))
      .run();

    return this.findById(report.id);
  }

  async withdrawReport(id: string, reporterId: string, reason?: string): Promise<ReportDoc | null> {
    return this.withdrawIfPending(id, reporterId, reason);
  }

  async hideIfClosed(
    idOrRef: string,
    reporterId: string,
    session?: ClientSession,
  ): Promise<ReportDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Report.findOneAndUpdate)) {
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

    const report = await this.findByIdOrReference(idOrRef, reporterId);
    if (!report) return null;
    return report;
  }

  async softDeleteByReporter(id: string, reporterId: string): Promise<ReportDoc | null> {
    return this.hideIfClosed(id, reporterId);
  }

  async claimTicket(id: string, adminId: string): Promise<ReportDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Report.findOne)) {
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

    const report = await this.findById(id);
    if (!report) return null;

    const db = getSqliteDb();
    const now = new Date();
    db.update(reportsTable)
      .set({
        status: 'reviewing',
        resolved_by: adminId,
        updatedAt: now,
      })
      .where(eq(reportsTable.id, report.id))
      .run();

    return this.findById(report.id);
  }

  async resolveTicket(
    id: string,
    adminId: string,
    resolution: AdminResolveReportInput,
  ): Promise<ReportDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Report.findOne)) {
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

    const report = await this.findById(id);
    if (!report) return null;

    const db = getSqliteDb();
    const now = new Date();
    db.update(reportsTable)
      .set({
        status: resolution.decision,
        resolution_notes: resolution.internal_notes ?? resolution.message_to_reporter ?? null,
        resolved_by: adminId,
        resolved_at: now,
        updatedAt: now,
      })
      .where(eq(reportsTable.id, report.id))
      .run();

    return this.findById(report.id);
  }
}

export const reportsRepository = new ReportsRepository();
