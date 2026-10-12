import { Types } from 'mongoose';

import type { ApplicationDoc } from '../../models/application.model.js';
import { Interview, type InterviewDoc } from '../../models/interview.model.js';
import type { UserDoc } from '../../models/user.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { jobPostingsService, type JobPostingsService, type JobSummary } from '../job-postings/job-postings.service.js';
import { usersService, type UsersService } from '../users/users.service.js';
import {
  APPLICATION_CONFIG,
  createEmptyStatusCounts,
  RECRUITER_ROLES,
  STATUS_REVIEW_STAGE,
} from './applications.constants.js';
import {
  applicationsRepository,
  type ApplicationsRepository,
  type RecruiterApplicationListFilters,
} from './applications.repository.js';
import {
  parseRecruiterStatusFilter,
  type RecruiterApplicationListQuery,
  type RecruiterApplicationListResponse,
  type RecruiterApplicationSummaryDTO,
  type RecruiterNextInterviewDTO,
} from './recruiter-applications.schemas.js';

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

export class RecruiterApplicationsService {
  constructor(
    private readonly repository: ApplicationsRepository = applicationsRepository,
    private readonly users: UsersService = usersService,
    private readonly jobs: JobPostingsService = jobPostingsService,
  ) {}

  private async assertRecruiterScope(
    actorId: string,
    actorRole: string,
  ): Promise<{ enterpriseId: string }> {
    if (!RECRUITER_ROLES.some((role) => role === actorRole)) {
      throw createHttpError(
        HTTP_STATUS.HTTP_403_FORBIDDEN,
        'Recruiter or enterprise administrator role required',
      );
    }

    const enterpriseId = await this.users.getEnterpriseId(actorId);
    if (!enterpriseId) {
      throw createHttpError(
        HTTP_STATUS.HTTP_403_FORBIDDEN,
        'Active enterprise assignment required',
      );
    }

    return { enterpriseId };
  }

  private async resolveEnterpriseJobIds(
    enterpriseId: string,
    requestedJobId?: string,
  ): Promise<string[]> {
    const allCompanyJobIds = await this.jobs.findJobIdsByEnterpriseId(enterpriseId);

    if (requestedJobId) {
      // UC-S2-AA-06.EX3: If filtered job does not belong to this company, return empty without error
      const ownsJob = allCompanyJobIds.includes(requestedJobId);
      return ownsJob ? [requestedJobId] : [];
    }

    return allCompanyJobIds;
  }

  private async resolveKeywordFilters(
    enterpriseId: string,
    keyword: string,
  ): Promise<{
    matchedJobIds: string[];
    matchedApplicantIds: string[];
    matchedApplicationIds: string[];
  }> {
    const [matchedJobIds, matchedApplicantIds] = await Promise.all([
      this.jobs.findJobIdsByTitleAndEnterpriseId(enterpriseId, keyword),
      this.users.findIdsByKeyword(keyword, APPLICATION_CONFIG.HISTORY_MAX_LIMIT),
    ]);

    const matchedApplicationIds = OBJECT_ID_PATTERN.test(keyword) ? [keyword] : [];

    return { matchedJobIds, matchedApplicantIds, matchedApplicationIds };
  }

  private async loadUpcomingInterviews(
    applicationIds: string[],
    enterpriseId: string,
  ): Promise<Map<string, RecruiterNextInterviewDTO>> {
    if (applicationIds.length === 0) {
      return new Map();
    }

    const now = new Date();
    const rows = await Interview.find({
      enterprise_id: new Types.ObjectId(enterpriseId),
      application_id: { $in: applicationIds.map((id) => new Types.ObjectId(id)) },
      status: 'scheduled',
      scheduled_at: { $gte: now },
    })
      .sort({ scheduled_at: 1 })
      .lean<InterviewDoc[]>()
      .exec();

    const result = new Map<string, RecruiterNextInterviewDTO>();
    for (const row of rows) {
      const appId = String(row.application_id);
      if (!result.has(appId)) {
        result.set(appId, {
          id: String(row._id),
          scheduledAt: row.scheduled_at.toISOString(),
          mode: row.mode,
        });
      }
    }

    return result;
  }

  private mapSummary(
    application: ApplicationDoc,
    job: JobSummary | undefined,
    applicant: UserDoc | undefined,
    nextInterview: RecruiterNextInterviewDTO | null,
  ): RecruiterApplicationSummaryDTO {
    const submittedDocuments: ('cv' | 'cover_letter')[] = [];
    if (application.cv_id) submittedDocuments.push('cv');
    if (application.cover_letter_id) submittedDocuments.push('cover_letter');

    const history = application.status_history;
    const latestStatusAt = (
      history.length > 0 ? history[history.length - 1]!.changed_at : application.updatedAt
    ).toISOString();

    return {
      id: String(application._id),
      job: {
        id: String(application.job_id),
        title: job?.title ?? '',
      },
      applicant: {
        id: String(application.applicant_id),
        fullName: applicant?.full_name ?? null,
        email: applicant?.email ?? '',
        phone: applicant?.phone ?? null,
      },
      status: application.status,
      reviewStage: STATUS_REVIEW_STAGE[application.status] ?? null,
      submittedDocuments,
      nextInterview,
      notesCount: Array.isArray(application.notes) ? application.notes.length : 0,
      submittedAt: application.createdAt.toISOString(),
      latestStatusAt,
    };
  }

  async listApplications(
    actorId: string,
    actorRole: string,
    query: RecruiterApplicationListQuery,
  ): Promise<RecruiterApplicationListResponse> {
    const { enterpriseId } = await this.assertRecruiterScope(actorId, actorRole);

    const eligibleJobIds = await this.resolveEnterpriseJobIds(enterpriseId, query.jobId);
    if (eligibleJobIds.length === 0) {
      return {
        page: query.page,
        limit: query.limit,
        total: 0,
        totalPages: 0,
        items: [],
        statusCounts: createEmptyStatusCounts(),
      };
    }

    const statuses = query.status ? parseRecruiterStatusFilter(query.status) : undefined;

    let searchOr: RecruiterApplicationListFilters['searchOr'];

    if (query.search) {
      const keywordResolution = await this.resolveKeywordFilters(enterpriseId, query.search);
      const matchedJobIds = eligibleJobIds.filter((jobId) =>
        keywordResolution.matchedJobIds.includes(jobId),
      );

      // If search matched nothing across any dimension
      if (
        matchedJobIds.length === 0 &&
        keywordResolution.matchedApplicantIds.length === 0 &&
        keywordResolution.matchedApplicationIds.length === 0
      ) {
        return {
          page: query.page,
          limit: query.limit,
          total: 0,
          totalPages: 0,
          items: [],
          statusCounts: createEmptyStatusCounts(),
        };
      }

      searchOr = {
        ...(matchedJobIds.length ? { jobIds: matchedJobIds } : {}),
        ...(keywordResolution.matchedApplicantIds.length
          ? { applicantIds: keywordResolution.matchedApplicantIds }
          : {}),
        ...(keywordResolution.matchedApplicationIds.length
          ? { applicationIds: keywordResolution.matchedApplicationIds }
          : {}),
      };
    }

    const filters: RecruiterApplicationListFilters = {
      jobIds: eligibleJobIds,
      statuses,
      documentType: query.documentType,
      submittedFrom: query.submittedFrom,
      submittedTo: query.submittedTo,
      ...(searchOr ? { searchOr } : {}),
    };

    const [pageResult, statusCounts] = await Promise.all([
      this.repository.findPageForRecruiter({
        page: query.page,
        limit: query.limit,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        filters,
      }),
      this.repository.countByStatusForRecruiter(filters),
    ]);

    const itemAppIds = pageResult.items.map((item) => String(item._id));
    const itemJobIds = [...new Set(pageResult.items.map((item) => String(item.job_id)))];
    const itemApplicantIds = [...new Set(pageResult.items.map((item) => String(item.applicant_id)))];

    const [jobsMap, applicantsList, interviewsMap] = await Promise.all([
      this.jobs.findSummariesByIds(itemJobIds),
      this.users.findByIds(itemApplicantIds),
      this.loadUpcomingInterviews(itemAppIds, enterpriseId),
    ]);

    const applicantsMap = new Map<string, UserDoc>(
      applicantsList.map((user) => [String(user._id), user]),
    );

    const items = pageResult.items.map((application) =>
      this.mapSummary(
        application,
        jobsMap.get(String(application.job_id)),
        applicantsMap.get(String(application.applicant_id)),
        interviewsMap.get(String(application._id)) ?? null,
      ),
    );

    return {
      page: query.page,
      limit: query.limit,
      total: pageResult.total,
      totalPages: Math.ceil(pageResult.total / query.limit),
      items,
      statusCounts,
    };
  }
}

export const recruiterApplicationsService = new RecruiterApplicationsService();
