import { Types, type QueryFilter } from 'mongoose';

import {
  Application,
  type ApplicationData,
  type ApplicationDoc,
  type ApplicationStatus,
  type ApplicationStatusHistoryEntry,
} from '../../models/application.model.js';
import { TIME_MS } from '../../shared/constants/time.js';
import {
  APPLICATION_CONFIG,
  APPLICATION_HIRED_STATUS,
  APPLICATION_INITIAL_STATUS,
  APPLICATION_SORT_COLUMNS,
  createEmptyStatusCounts,
  WITHDRAWABLE_STATUSES,
  type ApplicationSortField,
  type ApplicationSortOrder,
} from './applications.constants.js';

export interface ApplicationListFilters {
  statuses?: ApplicationStatus[] | undefined;
  // Already resolved from the job filter and the keyword; an empty array matches nothing.
  jobIds?: string[] | undefined;
  submittedFrom?: Date | undefined;
  submittedTo?: Date | undefined;
}

export interface FindApplicationsPageParams {
  page: number;
  limit: number;
  sortBy: ApplicationSortField;
  sortOrder: ApplicationSortOrder;
  filters: ApplicationListFilters;
}

export interface SubmitApplicationData {
  jobId: Types.ObjectId | string;
  applicantId: Types.ObjectId | string;
  cvId: string;
  coverLetterId?: string | undefined;
  message?: string | undefined;
  // User performing the action, stored in the status history.
  changedBy: string;
  // BR-APP-010: the closed (Withdrawn/Rejected) record this application replaces.
  reappliedFrom?: Types.ObjectId | string | undefined;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === APPLICATION_CONFIG.MONGO_DUPLICATE_KEY_ERROR_CODE
  );
}

export class ApplicationsRepository {
  // The pair can hold up to two records (BR-APP-010); the latest one decides what the applicant may do next.
  async findLatestByJobAndApplicant(
    jobId: Types.ObjectId | string,
    applicantId: Types.ObjectId | string,
  ): Promise<ApplicationDoc | null> {
    return Application.findOne({ job_id: jobId, applicant_id: applicantId })
      .sort({ createdAt: -1, _id: -1 })
      .lean<ApplicationDoc>()
      .exec();
  }

  async countByJobAndApplicant(jobId: Types.ObjectId | string, applicantId: Types.ObjectId | string): Promise<number> {
    return Application.countDocuments({ job_id: jobId, applicant_id: applicantId }).exec();
  }

  async countHiredByJobId(jobId: Types.ObjectId | string): Promise<number> {
    return Application.countDocuments({ job_id: jobId, status: APPLICATION_HIRED_STATUS }).exec();
  }

  // Returns null when the partial unique (job, applicant) index rejects the insert, i.e. another active
  // application exists (a concurrent duplicate). A reapplication also marks the closed record it replaces.
  // Compensation only: removes an application saved for a job that was deleted at the same moment.
  async deleteById(id: Types.ObjectId | string): Promise<void> {
    await Application.deleteOne({ _id: id }).exec();
  }

  async create(data: SubmitApplicationData): Promise<ApplicationDoc | null> {
    try {
      const application = await Application.create({
        job_id: data.jobId,
        applicant_id: data.applicantId,
        cv_id: data.cvId,
        ...(data.coverLetterId ? { cover_letter_id: data.coverLetterId } : {}),
        ...(data.message ? { message: data.message } : {}),
        ...(data.reappliedFrom ? { reapplied_from: data.reappliedFrom } : {}),
        status: APPLICATION_INITIAL_STATUS,
        status_history: [this.buildHistoryEntry(data.changedBy)],
      });
      if (data.reappliedFrom) {
        // Guarded so a closed record links to one replacement only.
        await Application.updateOne(
          { _id: data.reappliedFrom, reapplied_as: { $exists: false } },
          { $set: { reapplied_as: application._id } },
          // A link is not a status change: keep the closed record's "last update" date.
          { timestamps: false },
        ).exec();
      }
      return application.toObject<ApplicationDoc>();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return null;
      }
      throw error;
    }
  }


  // Strictly scopes every query to the authenticated candidate (BR-APP-001).
  private buildFilter(applicantId: string, filters: ApplicationListFilters): QueryFilter<ApplicationData> {
    const filter: QueryFilter<ApplicationData> = { applicant_id: new Types.ObjectId(applicantId) };
    if (filters.statuses?.length) filter.status = { $in: filters.statuses };
    if (filters.jobIds) filter.job_id = { $in: filters.jobIds.map((id) => new Types.ObjectId(id)) };
    if (filters.submittedFrom || filters.submittedTo) {
      filter.createdAt = {
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

  async findPageByApplicant(applicantId: string, params: FindApplicationsPageParams): Promise<{ items: ApplicationDoc[]; total: number }> {
    const filter = this.buildFilter(applicantId, params.filters);
    const [items, total] = await Promise.all([
      Application.find(filter)
        .sort(this.buildSort(params.sortBy, params.sortOrder))
        .skip((params.page - 1) * params.limit)
        .limit(params.limit)
        .lean<ApplicationDoc[]>()
        .exec(),
      Application.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  async countByStatus(applicantId: string, filters: ApplicationListFilters): Promise<Record<ApplicationStatus, number>> {
    const rows = await Application.aggregate<{ _id: ApplicationStatus; count: number }>([
      { $match: this.buildFilter(applicantId, filters) },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).exec();
    const counts = createEmptyStatusCounts();
    for (const row of rows) counts[row._id] = row.count;
    return counts;
  }

  // Ownership is part of the lookup so another candidate's record is indistinguishable from a missing one.
  async findOwnedById(id: string, applicantId: string): Promise<ApplicationDoc | null> {
    return Application.findOne({ _id: id, applicant_id: applicantId }).lean<ApplicationDoc>().exec();
  }

  async findHistoryPage(id: string, applicantId: string, page: number, limit: number): Promise<{ found: boolean; total: number; items: ApplicationStatusHistoryEntry[] }> {
    // Ownership is applied first; only the requested slice of the append-only history is returned.
    const [result] = await Application.aggregate<{ total: number; items: ApplicationStatusHistoryEntry[] }>([
      { $match: { _id: new Types.ObjectId(id), applicant_id: new Types.ObjectId(applicantId) } },
      { $project: { total: { $size: '$status_history' }, items: { $slice: ['$status_history', (page - 1) * limit, limit] } } },
    ]).exec();
    return result ? { found: true, total: result.total, items: result.items } : { found: false, total: 0, items: [] };
  }

  // Atomic lifecycle transition (BR-APP-004/005): the guard matches only while the candidate still sees the
  // same history length (optimistic version) and the status is still withdrawable, so a concurrent company
  // action wins cleanly and no partial withdrawal exists.
  async withdrawAtomically(id: string, applicantId: string, expectedVersion: number, reason: string | undefined): Promise<ApplicationDoc | null> {
    return Application.findOneAndUpdate(
      {
        _id: id,
        applicant_id: applicantId,
        status: { $in: WITHDRAWABLE_STATUSES },
        $expr: { $eq: [{ $size: '$status_history' }, expectedVersion] },
      },
      {
        $set: { status: 'withdrawn', ...(reason ? { withdrawal_reason: reason } : {}) },
        $push: { status_history: { status: 'withdrawn', changed_at: new Date(), changed_by: applicantId } },
      },
      { returnDocument: 'after' },
    )
      .lean<ApplicationDoc>()
      .exec();
  }

  private buildHistoryEntry(changedBy: string): Pick<ApplicationStatusHistoryEntry, 'status' | 'changed_at'> & {
    changed_by: string;
  } {
    return {
      status: APPLICATION_INITIAL_STATUS,
      changed_at: new Date(),
      changed_by: changedBy,
    };
  }
}

export const applicationsRepository = new ApplicationsRepository();