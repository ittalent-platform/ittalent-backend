import { Types, type QueryFilter, type UpdateQuery } from 'mongoose';
import { Application } from '../../models/application.model.js';
import type {
  ApplicationData,
  ApplicationDoc,
  ApplicationHistoryEntryData,
  ApplicationReviewStage,
  ApplicationStatus,
} from '../../models/application.model.js';
import { TIME_MS } from '../../shared/constants/time.js';
import {
  APPLICATION_SORT_COLUMNS,
  createEmptyStatusCounts,
  WITHDRAWABLE_STATUSES,
  type ApplicationSortField,
  type ApplicationSortOrder,
} from './applications.constants.js';

export interface ApplicationListFilters {
  statuses?: ApplicationStatus[] | undefined;
  jobId?: string | undefined;
  reviewStage?: ApplicationReviewStage | undefined;
  keyword?: string | undefined;
  submittedFrom?: Date | undefined;
  submittedTo?: Date | undefined;
}

export interface ApplicationPage {
  items: ApplicationDoc[];
  total: number;
}

export interface FindApplicationsPageParams {
  page: number;
  limit: number;
  sortBy: ApplicationSortField;
  sortOrder: ApplicationSortOrder;
  filters: ApplicationListFilters;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsRegex(value: string): RegExp {
  return new RegExp(escapeRegex(value), 'i');
}

export class ApplicationsRepository {
  // Strictly scopes every query to the authenticated candidate (BR-APP-001).
  private buildFilter(applicantId: string, filters: ApplicationListFilters): QueryFilter<ApplicationData> {
    const filter: QueryFilter<ApplicationData> = { applicant_id: new Types.ObjectId(applicantId) };

    if (filters.statuses?.length) {
      filter.status = { $in: filters.statuses };
    }
    if (filters.jobId) {
      filter.job_id = new Types.ObjectId(filters.jobId);
    }
    if (filters.reviewStage) {
      filter.review_stage = filters.reviewStage;
    }
    if (filters.keyword) {
      // The list search box matches either the job title or the company name.
      const keywordPattern = containsRegex(filters.keyword);
      filter.$or = [{ 'job_snapshot.title': keywordPattern }, { 'job_snapshot.company_name': keywordPattern }];
    }
    if (filters.submittedFrom || filters.submittedTo) {
      filter.submitted_at = {
        ...(filters.submittedFrom ? { $gte: filters.submittedFrom } : {}),
        // Date-only upper bounds include the entire selected UTC calendar day.
        ...(filters.submittedTo ? { $lt: new Date(filters.submittedTo.getTime() + TIME_MS.ONE_DAY) } : {}),
      };
    }

    return filter;
  }

  // `_id` is the deterministic tie-breaker so paging never repeats or skips rows.
  private buildSort(sortBy: ApplicationSortField, sortOrder: ApplicationSortOrder): Record<string, 1 | -1> {
    const direction = sortOrder === 'asc' ? 1 : -1;
    const column = APPLICATION_SORT_COLUMNS[sortBy];
    return column === '_id' ? { _id: direction } : { [column]: direction, _id: direction };
  }

  async create(data: Partial<ApplicationData>): Promise<ApplicationDoc> {
    return new Application(data).save();
  }

  async findPageByApplicant(
    applicantId: string,
    params: FindApplicationsPageParams,
  ): Promise<ApplicationPage> {
    const filter = this.buildFilter(applicantId, params.filters);
    const skip = (params.page - 1) * params.limit;

    const [items, total] = await Promise.all([
      Application.find(filter)
        .sort(this.buildSort(params.sortBy, params.sortOrder))
        .skip(skip)
        .limit(params.limit)
        .exec(),
      Application.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async countByStatus(
    applicantId: string,
    filters: ApplicationListFilters,
  ): Promise<Record<ApplicationStatus, number>> {
    // Aggregations do not cast string IDs to ObjectId like Mongoose find() does.
    const match = { ...this.buildFilter(applicantId, filters), applicant_id: new Types.ObjectId(applicantId) };
    const rows = await Application.aggregate<{ _id: ApplicationStatus; count: number }>([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).exec();

    const counts = createEmptyStatusCounts();
    for (const row of rows) {
      counts[row._id] = row.count;
    }
    return counts;
  }

  // Ownership is part of the lookup so another candidate's record is indistinguishable from missing.
  async findOwnedById(id: string, applicantId: string): Promise<ApplicationDoc | null> {
    return Application.findOne({ _id: id, applicant_id: applicantId }).exec();
  }

  async findHistoryPage(id: string, applicantId: string, page: number, limit: number): Promise<{
    found: boolean;
    total: number;
    items: ApplicationHistoryEntryData[];
  }> {
    // Unwind only after applying candidate ownership; return at most one requested page.
    const [result] = await Application.aggregate<{
      total: number;
      items: ApplicationHistoryEntryData[];
    }>([
      { $match: { _id: new Types.ObjectId(id), applicant_id: new Types.ObjectId(applicantId) } },
      { $project: { history: 1 } },
      { $project: {
        total: { $size: '$history' },
        items: { $slice: ['$history', (page - 1) * limit, limit] },
      } },
    ]).exec();
    return result ? { found: true, total: result.total, items: result.items } : { found: false, total: 0, items: [] };
  }

  // Atomic lifecycle transition: `$set` status fields, `$push` the append-only history event
  // and `$inc` the optimistic-concurrency version in a single document update (BR-APP-002/004/005).
  async withdrawAtomically(
    id: string,
    applicantId: string,
    expectedVersion: number,
    reason: string | undefined,
  ): Promise<ApplicationDoc | null> {
    const now = new Date();
    const setFields: Record<string, unknown> = {
      status: 'withdrawn',
      latest_status_at: now,
      withdrawn_at: now,
    };
    if (reason !== undefined) {
      setFields.withdrawal_reason = reason;
    }

    const historyEntry: ApplicationHistoryEntryData = {
      status: 'withdrawn',
      actor_role: 'candidate',
      occurred_at: now,
    };

    const update: UpdateQuery<ApplicationData> = {
      $set: setFields,
      $inc: { version: 1 },
      $push: { history: historyEntry },
    };

    return Application.findOneAndUpdate(
      {
        _id: id,
        applicant_id: applicantId,
        status: { $in: WITHDRAWABLE_STATUSES },
        version: expectedVersion,
      },
      update,
      { returnDocument: 'after' },
    ).exec();
  }
}

export const applicationsRepository = new ApplicationsRepository();
