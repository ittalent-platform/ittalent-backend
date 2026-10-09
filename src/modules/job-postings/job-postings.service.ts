import { Types } from 'mongoose';
import type {
  JobPostingDoc,
  JobPostingStatus,
} from '../../models/job-posting.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { usersService, type UsersService } from '../users/users.service.js';
import {
  jobPostingsRepository,
  type JobPostingsRepository,
} from './job-postings.repository.js';
import {
  JOB_DEADLINE,
  JOB_POSTING_MESSAGES,
  type JobAuditAction,
  type RecruitmentStatus,
} from './job-postings.constants.js';
import type {
  CreateJobPosting,
  JobPostingListQuery,
  JobPostingHistoryQuery,
  JobPostingHistoryResponse,
  JobPostingEnterpriseSummary,
  JobPostingResponse,
  UpdateJobPosting,
} from './job-postings.schemas.js';

// What an application shows about its job. `isOpen` = Published and not past its expiry date.
export interface JobSummary {
  id: string;
  title: string;
  companyName: string;
  location: string | null;
  employmentType: string | null;
  expiresAt: Date | null;
  isOpen: boolean;
}
type PaginatedJobPostings = {
  items: JobPostingResponse[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `job-${Date.now()}`
  );
}

export class JobPostingsService {
  constructor(
    private readonly repository: JobPostingsRepository = jobPostingsRepository,
    private readonly userService: UsersService = usersService,
  ) {}
  private recruitmentStatusOf(
    record: JobPostingDoc,
    now = new Date(),
  ): RecruitmentStatus {
    return record.status === 'published' &&
      (!record.expires_at || record.expires_at.getTime() >= now.getTime())
      ? 'open'
      : 'closed';
  }
  private map(
    record: JobPostingDoc,
    enterprise: JobPostingEnterpriseSummary,
    applicationCount?: number,
  ): JobPostingResponse {
    const raw = record.toObject();
    return {
      id: String(record._id),
      enterpriseId: String(record.enterprise_id),
      enterprise,
      postedByUserId: String(record.posted_by_user_id),
      title: record.title,
      slug: record.slug,
      ...(record.location ? { location: record.location } : {}),
      ...(record.employment_type
        ? { employmentType: record.employment_type }
        : {}),
      ...(record.salary_min !== undefined
        ? { salaryMin: record.salary_min }
        : {}),
      ...(record.salary_max !== undefined
        ? { salaryMax: record.salary_max }
        : {}),
      salaryNegotiable: record.salary_negotiable ?? false,
      currency: record.currency,
      ...(record.level ? { level: record.level } : {}),
      ...(record.description ? { description: record.description } : {}),
      ...(record.requirements ? { requirements: record.requirements } : {}),
      ...(record.benefits ? { benefits: record.benefits } : {}),
      ...(record.openings !== undefined ? { openings: record.openings } : {}),
      status: record.status,
      recruitmentStatus: this.recruitmentStatusOf(record),
      ...(applicationCount !== undefined ? { applicationCount } : {}),
      ...(record.published_at
        ? { publishedAt: record.published_at.toISOString() }
        : {}),
      ...(record.closed_at ? { closedAt: record.closed_at.toISOString() } : {}),
      ...(record.archived_at
        ? { archivedAt: record.archived_at.toISOString() }
        : {}),
      ...(record.expires_at
        ? { expiresAt: record.expires_at.toISOString() }
        : {}),
      createdAt: new Date(raw.createdAt).toISOString(),
      updatedAt: new Date(raw.updatedAt).toISOString(),
    };
  }
  private async mapOne(
    record: JobPostingDoc,
    withApplicationCount = false,
  ): Promise<JobPostingResponse> {
    const enterpriseId = String(record.enterprise_id);
    const enterprise = (
      await this.repository.findEnterpriseSummaries([enterpriseId])
    ).get(enterpriseId);
    if (!enterprise)
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        'Enterprise not found for job posting',
      );
    const count = withApplicationCount
      ? ((
          await this.repository.countApplicationsByJobIds([String(record._id)])
        ).get(String(record._id)) ?? 0)
      : undefined;
    return this.map(record, enterprise, count);
  }
  private async uniqueSlug(title: string, exceptId?: string): Promise<string> {
    const base = slugify(title);
    let slug = base;
    let suffix = 2;
    while (await this.repository.findBySlug(slug, exceptId)) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }
    return slug;
  }
  private async getRecruiterEnterpriseId(recruiterId: string): Promise<string> {
    const enterpriseId = await this.userService.getEnterpriseId(recruiterId);
    if (!enterpriseId)
      throw createHttpError(
        HTTP_STATUS.HTTP_403_FORBIDDEN,
        'Recruiter is not assigned to an enterprise',
      );
    return enterpriseId;
  }
  private async assertRecruiterCanManage(
    jobPosting: JobPostingDoc,
    recruiterId: string,
  ): Promise<void> {
    if (
      String(jobPosting.enterprise_id) !==
      (await this.getRecruiterEnterpriseId(recruiterId))
    )
      throw createHttpError(
        HTTP_STATUS.HTTP_403_FORBIDDEN,
        'Job posting belongs to another enterprise',
      );
  }
  private async getExisting(id: string): Promise<JobPostingDoc> {
    const jobPosting = await this.repository.findById(id);
    if (!jobPosting)
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        'Job posting not found',
      );
    return jobPosting;
  }
  // Audit is part of the transaction policy (BR-MULTI-008): if it cannot be written the change is undone
  // and the caller gets a retryable failure, never a success.
  private async audit(
    action: JobAuditAction,
    job: Pick<JobPostingDoc, '_id' | 'enterprise_id' | 'title'>,
    actorId: string,
    undo: () => Promise<void>,
    changedFields?: string[],
  ): Promise<void> {
    try {
      await this.repository.recordAudit({
        job_posting_id: job._id,
        enterprise_id: job.enterprise_id,
        actor_user_id: new Types.ObjectId(actorId),
        action,
        result: 'success',
        job_title: job.title,
        ...(changedFields ? { changed_fields: changedFields } : {}),
      });
    } catch {
      await undo().catch(() => undefined);
      throw createHttpError(
        HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE,
        JOB_POSTING_MESSAGES.AUDIT_FAILED,
      );
    }
  }
  /** The selected day ends at 23:59:59.999 in Asia/Ho_Chi_Minh (TBD-JOB-01). */
  private deadlineFromInput(value: string): Date {
    // ISO datetimes use their Vietnam calendar day, which can differ from their UTC day.
    const day = JOB_DEADLINE.DATE_ONLY_PATTERN.test(value)
      ? value
      : new Date(Date.parse(value) + JOB_DEADLINE.ICT_OFFSET_MS)
          .toISOString()
          .slice(0, JOB_DEADLINE.DATE_LENGTH);
    return new Date(`${day}${JOB_DEADLINE.ICT_END_OF_DAY}`);
  }
  private assertDeadlineNotPast(deadline: Date): void {
    if (!(deadline.getTime() >= Date.now()))
      throw createHttpError(
        HTTP_STATUS.HTTP_400_BAD_REQUEST,
        JOB_POSTING_MESSAGES.DEADLINE_IN_PAST,
      );
  }
  // Recruiter-only mutations (the admin has no default company-job mutation permission).
  private assertRecruiter(actorRole: string): void {
    if (actorRole !== 'recruiter')
      throw createHttpError(
        HTTP_STATUS.HTTP_403_FORBIDDEN,
        'Only recruiters can change job postings',
      );
  }
  async create(
    recruiterId: string,
    input: CreateJobPosting,
  ): Promise<JobPostingResponse> {
    const enterpriseId = await this.getRecruiterEnterpriseId(recruiterId);
    const publicationStatus = input.publication_status ?? 'published';
    if (
      publicationStatus === 'published' &&
      !(await this.repository.isEnterpriseActive(enterpriseId))
    )
      throw createHttpError(
        HTTP_STATUS.HTTP_403_FORBIDDEN,
        JOB_POSTING_MESSAGES.ENTERPRISE_NOT_ACTIVE,
      );
    const deadline = input.expires_at
      ? this.deadlineFromInput(input.expires_at)
      : undefined;
    if (deadline) this.assertDeadlineNotPast(deadline);
    const created = await this.repository.create(
      recruiterId,
      enterpriseId,
      input,
      await this.uniqueSlug(input.title),
      deadline,
    );
    await this.audit('create', created, recruiterId, async () => {
      await this.repository.delete(String(created._id));
    });
    return this.mapOne(created, true);
  }
  async getByIdForManagement(
    id: string,
    actorId: string,
    actorRole: string,
  ): Promise<JobPostingResponse> {
    const jobPosting = await this.getExisting(id);
    if (actorRole === 'recruiter')
      await this.assertRecruiterCanManage(jobPosting, actorId);
    return this.mapOne(jobPosting, true);
  }
  async update(
    id: string,
    actorId: string,
    actorRole: string,
    input: UpdateJobPosting,
  ): Promise<JobPostingResponse> {
    this.assertRecruiter(actorRole);
    const existing = await this.getExisting(id);
    await this.assertRecruiterCanManage(existing, actorId);
    if (existing.status === 'archived')
      throw createHttpError(
        HTTP_STATUS.HTTP_409_CONFLICT,
        JOB_POSTING_MESSAGES.ARCHIVED_NOT_EDITABLE,
      );
    if (existing.status === 'closed' && input.publication_status !== undefined)
      throw createHttpError(
        HTTP_STATUS.HTTP_409_CONFLICT,
        JOB_POSTING_MESSAGES.REOPEN_NOT_ALLOWED,
      );
    // A changed deadline must be today or later; an unchanged (possibly already passed) one is left alone.
    const deadline =
      input.expires_at !== undefined
        ? this.deadlineFromInput(input.expires_at)
        : undefined;
    const deadlineChanged =
      deadline !== undefined &&
      deadline.getTime() !== existing.expires_at?.getTime();
    if (deadline && deadlineChanged) this.assertDeadlineNotPast(deadline);
    const candidateStatus = input.publication_status ?? existing.status;
    const candidateDeadline = deadline ?? existing.expires_at;
    const candidate = {
      ...existing.toObject(),
      ...input,
      status: candidateStatus,
      expires_at: candidateDeadline,
    };
    if (candidateStatus === 'published') {
      if (
        !candidate.description ||
        !candidate.requirements ||
        !candidate.benefits ||
        !candidate.location ||
        !candidate.employment_type ||
        !candidateDeadline
      )
        throw createHttpError(
          HTTP_STATUS.HTTP_400_BAD_REQUEST,
          JOB_POSTING_MESSAGES.PUBLISHED_FIELDS_REQUIRED,
        );
      if (existing.status !== 'published') {
        this.assertDeadlineNotPast(candidateDeadline);
        if (
          !(await this.repository.isEnterpriseActive(
            String(existing.enterprise_id),
          ))
        )
          throw createHttpError(
            HTTP_STATUS.HTTP_403_FORBIDDEN,
            JOB_POSTING_MESSAGES.ENTERPRISE_NOT_ACTIVE,
          );
      }
    }
    const snapshot = existing.toObject() as unknown as Record<string, unknown>;
    const updated = await this.repository.update(
      id,
      input,
      input.title ? await this.uniqueSlug(input.title, id) : undefined,
      deadlineChanged ? deadline : undefined,
    );
    if (!updated)
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        JOB_POSTING_MESSAGES.NOT_FOUND,
      );
    const auditAction: JobAuditAction =
      input.publication_status && input.publication_status !== existing.status
        ? input.publication_status === 'published'
          ? 'publish'
          : 'draft'
        : 'update';
    await this.audit(
      auditAction,
      updated,
      actorId,
      () => this.repository.restore(snapshot),
      Object.keys(input),
    );
    return this.mapOne(updated, true);
  }
  private async transition(
    id: string,
    actorId: string,
    actorRole: string,
    currentStatus: JobPostingStatus,
    nextStatus: JobPostingStatus,
    action: JobAuditAction,
  ): Promise<JobPostingResponse> {
    this.assertRecruiter(actorRole);
    const existing = await this.getExisting(id);
    await this.assertRecruiterCanManage(existing, actorId);
    if (existing.status !== currentStatus) {
      const message =
        action === 'close'
          ? JOB_POSTING_MESSAGES.CLOSE_NOT_ALLOWED
          : action === 'reopen'
            ? JOB_POSTING_MESSAGES.REOPEN_NOT_ALLOWED
            : action === 'archive'
              ? JOB_POSTING_MESSAGES.ARCHIVE_NOT_ALLOWED
              : JOB_POSTING_MESSAGES.RESTORE_NOT_ALLOWED;
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, message);
    }
    if (action === 'close' && this.recruitmentStatusOf(existing) !== 'open') {
      throw createHttpError(
        HTTP_STATUS.HTTP_409_CONFLICT,
        JOB_POSTING_MESSAGES.CLOSE_NOT_ALLOWED,
      );
    }
    if (action === 'reopen') {
      if (!existing.expires_at || existing.expires_at.getTime() < Date.now()) {
        throw createHttpError(
          HTTP_STATUS.HTTP_409_CONFLICT,
          JOB_POSTING_MESSAGES.DEADLINE_IN_PAST,
        );
      }
      if (
        !(await this.repository.isEnterpriseActive(
          String(existing.enterprise_id),
        ))
      ) {
        throw createHttpError(
          HTTP_STATUS.HTTP_403_FORBIDDEN,
          JOB_POSTING_MESSAGES.ENTERPRISE_NOT_ACTIVE,
        );
      }
    }
    const snapshot = existing.toObject() as unknown as Record<string, unknown>;
    const updated = await this.repository.transition(
      id,
      currentStatus,
      nextStatus,
      new Date(),
    );
    if (!updated)
      throw createHttpError(
        HTTP_STATUS.HTTP_409_CONFLICT,
        'Job posting state changed before the request completed.',
      );
    await this.audit(action, updated, actorId, () =>
      this.repository.restore(snapshot),
    );
    return this.mapOne(updated, true);
  }
  async close(
    id: string,
    actorId: string,
    actorRole: string,
  ): Promise<JobPostingResponse> {
    return this.transition(
      id,
      actorId,
      actorRole,
      'published',
      'closed',
      'close',
    );
  }
  async reopen(
    id: string,
    actorId: string,
    actorRole: string,
  ): Promise<JobPostingResponse> {
    return this.transition(
      id,
      actorId,
      actorRole,
      'closed',
      'published',
      'reopen',
    );
  }
  async archive(
    id: string,
    actorId: string,
    actorRole: string,
  ): Promise<JobPostingResponse> {
    const existing = await this.getExisting(id);
    if (existing.status === 'archived') {
      this.assertRecruiter(actorRole);
      await this.assertRecruiterCanManage(existing, actorId);
      return this.mapOne(existing, true);
    }
    return this.transition(
      id,
      actorId,
      actorRole,
      'closed',
      'archived',
      'archive',
    );
  }
  async restore(
    id: string,
    actorId: string,
    actorRole: string,
  ): Promise<JobPostingResponse> {
    return this.transition(
      id,
      actorId,
      actorRole,
      'archived',
      'closed',
      'restore',
    );
  }
  async getHistory(
    id: string,
    actorId: string,
    actorRole: string,
    query: JobPostingHistoryQuery,
  ): Promise<JobPostingHistoryResponse> {
    const job = await this.getExisting(id);
    if (actorRole === 'recruiter')
      await this.assertRecruiterCanManage(job, actorId);
    const result = await this.repository.listAudit(id, query.page, query.limit);
    return {
      items: result.items.map((item) => ({
        id: String(item._id),
        action: item.action,
        actorUserId: String(item.actor_user_id),
        occurredAt: item.createdAt.toISOString(),
        ...(item.changed_fields ? { changedFields: item.changed_fields } : {}),
      })),
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / query.limit),
    };
  }
  async remove(id: string, actorId: string, actorRole: string): Promise<void> {
    this.assertRecruiter(actorRole);
    const jobPosting = await this.getExisting(id);
    await this.assertRecruiterCanManage(jobPosting, actorId);
    // Flag first so an application cannot slip in between the count and the delete; the apply path
    // refuses flagged jobs and re-checks the job after saving (see ApplicationsService.submit).
    const flagged = await this.repository.markDeleting(id);
    if (!flagged)
      throw createHttpError(
        HTTP_STATUS.HTTP_409_CONFLICT,
        'This job posting is already being deleted.',
      );
    const snapshot = flagged.toObject() as unknown as Record<string, unknown>;
    try {
      if (await this.repository.hasApplications(id))
        throw createHttpError(
          HTTP_STATUS.HTTP_409_CONFLICT,
          JOB_POSTING_MESSAGES.CANNOT_DELETE_WITH_APPLICATIONS,
        );
      if (!(await this.repository.delete(id)))
        throw createHttpError(
          HTTP_STATUS.HTTP_404_NOT_FOUND,
          JOB_POSTING_MESSAGES.NOT_FOUND,
        );
    } catch (error) {
      await this.repository.clearDeleting(id).catch(() => undefined);
      throw error;
    }
    // A failed audit puts the job back without the flag: deletion is never reported as a success.
    const restorable = { ...snapshot };
    delete restorable.deleting;
    await this.audit('delete', jobPosting, actorId, () =>
      this.repository.restore(restorable),
    );
  }
  async findSummariesByIds(ids: string[]): Promise<Map<string, JobSummary>> {
    const jobs = await this.repository.findManyByIds(ids);
    const names = await this.repository.findEnterpriseNames([
      ...new Set(jobs.map((job) => String(job.enterprise_id))),
    ]);
    const now = Date.now();
    return new Map(
      jobs.map((job) => [
        String(job._id),
        {
          id: String(job._id),
          title: job.title,
          companyName: names.get(String(job.enterprise_id)) ?? '',
          location: job.location ?? null,
          employmentType: job.employment_type ?? null,
          expiresAt: job.expires_at ?? null,
          isOpen:
            job.status === 'published' &&
            (!job.expires_at || job.expires_at.getTime() > now),
        },
      ]),
    );
  }
  async findIdsByKeyword(keyword: string): Promise<string[]> {
    return this.repository.findIdsByKeyword(keyword);
  }
  // Returns the job only when it is Published and still open for applications.
  async findPublicJobById(id: string): Promise<JobPostingDoc | null> {
    return this.repository.findOpenPublishedById(id, new Date());
  }
  // Public detail: 404 unless the job is Published, still open and owned by an Active enterprise.
  async getPublicById(id: string): Promise<JobPostingResponse> {
    const job = await this.findPublicJobById(id);
    if (!job)
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        JOB_POSTING_MESSAGES.NOT_FOUND,
      );
    return this.mapOne(job);
  }
  // Used right after an application is saved: false means the job was deleted in the meantime.
  async stillExists(id: string): Promise<boolean> {
    return this.repository.exists(id);
  }
  async listPublic(query: JobPostingListQuery): Promise<PaginatedJobPostings> {
    return this.list(query, {
      publicOnly: true,
      activeEnterpriseIds: await this.repository.findActiveEnterpriseIds(),
    });
  }
  async listAdmin(query: JobPostingListQuery): Promise<PaginatedJobPostings> {
    return this.list(query, { publicOnly: false });
  }
  async listRecruiter(
    recruiterId: string,
    query: JobPostingListQuery,
  ): Promise<PaginatedJobPostings> {
    return this.list(query, {
      publicOnly: false,
      enterpriseId: await this.getRecruiterEnterpriseId(recruiterId),
    });
  }
  private async list(
    query: JobPostingListQuery,
    options: {
      publicOnly: boolean;
      enterpriseId?: string;
      activeEnterpriseIds?: string[];
    },
  ): Promise<PaginatedJobPostings> {
    const result = await this.repository.list(query, options);
    // Application counts are management data, not public.
    const counts = options.publicOnly
      ? undefined
      : await this.repository.countApplicationsByJobIds(
          result.items.map((item) => String(item._id)),
        );
    const enterprises = await this.repository.findEnterpriseSummaries([
      ...new Set(result.items.map((item) => String(item.enterprise_id))),
    ]);
    return {
      items: result.items.map((item) => {
        const enterpriseId = String(item.enterprise_id);
        const enterprise = enterprises.get(enterpriseId);
        if (!enterprise)
          throw createHttpError(
            HTTP_STATUS.HTTP_404_NOT_FOUND,
            'Enterprise not found for job posting',
          );
        return this.map(
          item,
          enterprise,
          counts ? (counts.get(String(item._id)) ?? 0) : undefined,
        );
      }),
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / query.limit),
    };
  }
}
export const jobPostingsService = new JobPostingsService();
