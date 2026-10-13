import { Types, type QueryFilter } from 'mongoose';

import {
  Application,
  type ApplicationCertificateSnapshot,
  type ApplicationData,
  type ApplicationDoc,
  type ApplicationNoteEntry,
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

export interface RecruiterApplicationListFilters {
  jobIds: string[];
  applicantIds?: string[] | undefined;
  applicationIds?: string[] | undefined;
  statuses?: ApplicationStatus[] | undefined;
  documentType?: 'cv' | 'cover_letter' | undefined;
  submittedFrom?: Date | undefined;
  submittedTo?: Date | undefined;
  searchOr?: {
    jobIds?: string[];
    applicantIds?: string[];
    applicationIds?: string[];
  } | undefined;
}

export interface FindRecruiterApplicationsPageParams {
  page: number;
  limit: number;
  sortBy: ApplicationSortField;
  sortOrder: ApplicationSortOrder;
  filters: RecruiterApplicationListFilters;
}

export interface UpdateRecruiterStatusData {
  status: ApplicationStatus;
  changedBy: string | Types.ObjectId;
  actorRole?: string | undefined;
  note?: string | undefined;
  messageToCandidate?: string | undefined;
  rejectionReason?: string | undefined;
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
  certificates?: ApplicationCertificateSnapshot[];
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
  // Documents call this through ApplicationsService so the document repository never reaches
  // across the bounded-context boundary to the Application model.
  async isDocumentReferenced(documentId: string): Promise<boolean> {
    return (
      (await Application.exists({
        $or: [{ cv_id: documentId }, { cover_letter_id: documentId }],
      }).exec()) !== null
    );
  }

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

  async countCertificatesSent(applicantId: string, certificateIds: string[]): Promise<Map<string, number>> {
    if (!certificateIds.length) return new Map();
    const ids = certificateIds.map((id) => new Types.ObjectId(id));
    const rows = await Application.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { applicant_id: new Types.ObjectId(applicantId), 'certificates.certificate_id': { $in: ids } } },
      { $unwind: '$certificates' },
      { $match: { 'certificates.certificate_id': { $in: ids } } },
      { $group: { _id: '$certificates.certificate_id', count: { $sum: 1 } } },
    ]).exec();
    return new Map(rows.map((row) => [String(row._id), row.count]));
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
        ...(data.certificates?.length ? { certificates: data.certificates } : {}),
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

  // ---- Recruiter application listing & status counting (UC-S2-AA-01, 05, 06) ----

  private buildRecruiterFilter(filters: RecruiterApplicationListFilters): QueryFilter<ApplicationData> {
    const filter: QueryFilter<ApplicationData> = {
      job_id: { $in: filters.jobIds.map((id) => new Types.ObjectId(id)) },
    };

    if (filters.statuses?.length) {
      filter.status = { $in: filters.statuses };
    }

    if (filters.searchOr) {
      const orConditions: QueryFilter<ApplicationData>[] = [];
      if (filters.searchOr.jobIds?.length) {
        orConditions.push({ job_id: { $in: filters.searchOr.jobIds.map((id) => new Types.ObjectId(id)) } });
      }
      if (filters.searchOr.applicantIds?.length) {
        orConditions.push({ applicant_id: { $in: filters.searchOr.applicantIds.map((id) => new Types.ObjectId(id)) } });
      }
      if (filters.searchOr.applicationIds?.length) {
        orConditions.push({ _id: { $in: filters.searchOr.applicationIds.map((id) => new Types.ObjectId(id)) } });
      }
      if (orConditions.length > 0) {
        filter.$or = orConditions;
      }
    } else {
      if (filters.applicantIds?.length) {
        filter.applicant_id = { $in: filters.applicantIds.map((id) => new Types.ObjectId(id)) };
      }
      if (filters.applicationIds?.length) {
        filter._id = { $in: filters.applicationIds.map((id) => new Types.ObjectId(id)) };
      }
    }

    if (filters.documentType === 'cv') {
      filter.cv_id = { $exists: true, $ne: null as unknown as Types.ObjectId };
    } else if (filters.documentType === 'cover_letter') {
      filter.cover_letter_id = { $exists: true, $ne: null as unknown as Types.ObjectId };
    }

    if (filters.submittedFrom || filters.submittedTo) {
      filter.createdAt = {
        ...(filters.submittedFrom ? { $gte: filters.submittedFrom } : {}),
        ...(filters.submittedTo ? { $lt: new Date(filters.submittedTo.getTime() + TIME_MS.ONE_DAY) } : {}),
      };
    }

    return filter;
  }

  async findPageForRecruiter(
    params: FindRecruiterApplicationsPageParams,
  ): Promise<{ items: ApplicationDoc[]; total: number }> {
    if (params.filters.jobIds.length === 0) {
      return { items: [], total: 0 };
    }

    const filter = this.buildRecruiterFilter(params.filters);
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

  async countByStatusForRecruiter(
    filters: RecruiterApplicationListFilters,
  ): Promise<Record<ApplicationStatus, number>> {
    const counts = createEmptyStatusCounts();
    if (filters.jobIds.length === 0) {
      return counts;
    }

    const rows = await Application.aggregate<{ _id: ApplicationStatus; count: number }>([
      { $match: this.buildRecruiterFilter(filters) },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).exec();

    for (const row of rows) {
      counts[row._id] = row.count;
    }

    return counts;
  }

  async findById(id: string | Types.ObjectId): Promise<ApplicationDoc | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return Application.findById(id).lean<ApplicationDoc>().exec();
  }

  // Scoped to enterprise job IDs to prevent leaking application existence across organizations (BR-06).
  async findByIdAndJobIds(
    applicationId: string | Types.ObjectId,
    jobIds: (string | Types.ObjectId)[],
  ): Promise<ApplicationDoc | null> {
    if (jobIds.length === 0 || !Types.ObjectId.isValid(applicationId)) {
      return null;
    }

    return Application.findOne({
      _id: new Types.ObjectId(applicationId),
      job_id: { $in: jobIds.map((id) => (typeof id === 'string' ? new Types.ObjectId(id) : id)) },
    })
      .lean<ApplicationDoc>()
      .exec();
  }

  // Atomically appends an internal recruiter note scoped strictly to enterprise job postings (BR-06).
  async addNoteToApplication(
    applicationId: string | Types.ObjectId,
    enterpriseJobIds: (string | Types.ObjectId)[],
    noteData: {
      authorId: string | Types.ObjectId;
      authorName: string;
      content: string;
    },
  ): Promise<ApplicationNoteEntry | null> {
    if (enterpriseJobIds.length === 0 || !Types.ObjectId.isValid(applicationId)) {
      return null;
    }

    const noteEntry: ApplicationNoteEntry = {
      author_id: new Types.ObjectId(noteData.authorId),
      author_name: noteData.authorName,
      content: noteData.content,
      created_at: new Date(),
    };

    const updated = await Application.findOneAndUpdate(
      {
        _id: new Types.ObjectId(applicationId),
        job_id: { $in: enterpriseJobIds.map((id) => (typeof id === 'string' ? new Types.ObjectId(id) : id)) },
      },
      {
        $push: { notes: noteEntry },
      },
      { returnDocument: 'after' },
    )
      .lean<ApplicationDoc>()
      .exec();

    if (!updated) {
      return null;
    }

    return noteEntry;
  }

  // Retrieves notes array for an application strictly within the enterprise boundary (BR-06).
  async findNotesByApplicationId(
    applicationId: string | Types.ObjectId,
    enterpriseJobIds: (string | Types.ObjectId)[],
  ): Promise<ApplicationNoteEntry[] | null> {
    if (enterpriseJobIds.length === 0 || !Types.ObjectId.isValid(applicationId)) {
      return null;
    }

    const application = await Application.findOne(
      {
        _id: new Types.ObjectId(applicationId),
        job_id: { $in: enterpriseJobIds.map((id) => (typeof id === 'string' ? new Types.ObjectId(id) : id)) },
      },
      { notes: 1 },
    )
      .lean<Pick<ApplicationDoc, '_id' | 'notes'>>()
      .exec();

    if (!application) {
      return null;
    }

    return application.notes ?? [];
  }

  // Atomically updates application recruitment status and appends audit record (BR-17, BR-24)
  async updateStatusAtomically(
    applicationId: string | Types.ObjectId,
    enterpriseJobIds: (string | Types.ObjectId)[],
    data: UpdateRecruiterStatusData,
    expectedVersion?: number,
  ): Promise<ApplicationDoc | null> {
    if (enterpriseJobIds.length === 0 || !Types.ObjectId.isValid(applicationId)) {
      return null;
    }

    const filter: Record<string, unknown> = {
      _id: new Types.ObjectId(applicationId),
      job_id: { $in: enterpriseJobIds.map((id) => (typeof id === 'string' ? new Types.ObjectId(id) : id)) },
    };

    if (typeof expectedVersion === 'number') {
      filter.$expr = { $eq: [{ $size: '$status_history' }, expectedVersion] };
    }

    const historyEntry: ApplicationStatusHistoryEntry = {
      status: data.status,
      changed_at: new Date(),
      changed_by: new Types.ObjectId(data.changedBy),
      actor_role: data.actorRole ?? 'recruiter',
      ...(data.note ? { note: data.note } : {}),
      ...(data.messageToCandidate ? { message_to_candidate: data.messageToCandidate } : {}),
      ...(data.rejectionReason ? { rejection_reason: data.rejectionReason } : {}),
    };

    const update: Record<string, unknown> = {
      $set: {
        status: data.status,
        ...(data.rejectionReason ? { rejection_reason: data.rejectionReason } : {}),
      },
      $push: { status_history: historyEntry },
    };

    return Application.findOneAndUpdate(filter, update, { returnDocument: 'after' })
      .lean<ApplicationDoc>()
      .exec();
  }

  // Counts currently hired applications for a specific job posting (BR-18, EX5)
  async countHiredApplications(jobId: string | Types.ObjectId): Promise<number> {
    if (!Types.ObjectId.isValid(jobId)) {
      return 0;
    }
    return Application.countDocuments({
      job_id: new Types.ObjectId(jobId),
      status: 'hired',
    }).exec();
  }

  // Cascades position_filled status to remaining active applications when openings are filled (BR-18)
  async cascadePositionFilled(
    jobId: string | Types.ObjectId,
    excludedApplicationId: string | Types.ObjectId,
    changedBy: string | Types.ObjectId = '000000000000000000000000',
  ): Promise<number> {
    if (!Types.ObjectId.isValid(jobId) || !Types.ObjectId.isValid(changedBy)) {
      return 0;
    }

    const historyEntry: ApplicationStatusHistoryEntry = {
      status: 'position_filled',
      changed_at: new Date(),
      changed_by: new Types.ObjectId(changedBy),
      actor_role: 'system',
      note: 'Position filled by another candidate',
    };

    const result = await Application.updateMany(
      {
        job_id: new Types.ObjectId(jobId),
        _id: { $ne: new Types.ObjectId(excludedApplicationId) },
        status: { $in: ['submitted', 'under_review', 'interviewing', 'offered'] },
      },
      {
        $set: { status: 'position_filled' },
        $push: { status_history: historyEntry },
      },
    ).exec();

    return result.modifiedCount;
  }
}

export const applicationsRepository = new ApplicationsRepository();
