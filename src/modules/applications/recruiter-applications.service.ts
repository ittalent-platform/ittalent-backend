import { Types } from 'mongoose';

import type { ApplicationDoc } from '../../models/application.model.js';
import type { DocumentDoc } from '../../models/document.model.js';
import { Interview, type InterviewDoc } from '../../models/interview.model.js';
import type { UserDoc } from '../../models/user.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { documentsService, type DocumentsService, type DocumentFileResult } from '../documents/documents.service.js';
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
  type RecruiterApplicationCvMetadataDTO,
  type RecruiterApplicationDetailDTO,
  type RecruiterApplicationListQuery,
  type RecruiterApplicationListResponse,
  type RecruiterApplicationSummaryDTO,
  type RecruiterAttachmentDTO,
  type RecruiterInterviewTimelineEntryDTO,
  type RecruiterNextInterviewDTO,
  type RecruiterNoteEntryDTO,
  type RecruiterNotesListResponse,
  type RecruiterStatusHistoryEntryDTO,
} from './recruiter-applications.schemas.js';

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

export class RecruiterApplicationsService {
  constructor(
    private readonly repository: ApplicationsRepository = applicationsRepository,
    private readonly users: UsersService = usersService,
    private readonly jobs: JobPostingsService = jobPostingsService,
    private readonly documents: DocumentsService = documentsService,
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

  async getApplicationDetail(
    actorId: string,
    actorRole: string,
    applicationId: string,
  ): Promise<RecruiterApplicationDetailDTO> {
    const { enterpriseId } = await this.assertRecruiterScope(actorId, actorRole);
    const enterpriseJobIds = await this.resolveEnterpriseJobIds(enterpriseId);
    if (enterpriseJobIds.length === 0) {
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        'Application not found',
      );
    }

    const application = await this.repository.findByIdAndJobIds(
      applicationId,
      enterpriseJobIds,
    );
    if (!application) {
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        'Application not found',
      );
    }

    const docIds: string[] = [];
    if (application.cv_id) docIds.push(String(application.cv_id));
    if (application.cover_letter_id) docIds.push(String(application.cover_letter_id));

    const [jobDoc, applicantUser, docs, interviews] = await Promise.all([
      this.jobs.findJobById(String(application.job_id)),
      this.users.findById(String(application.applicant_id)),
      docIds.length > 0 ? this.documents.findByIds(docIds) : Promise.resolve([]),
      Interview.find({
        application_id: application._id,
        enterprise_id: new Types.ObjectId(enterpriseId),
      })
        .sort({ scheduled_at: 1 })
        .lean<InterviewDoc[]>()
        .exec(),
    ]);

    const docsMap = new Map<string, DocumentDoc>(
      docs.map((d) => [String(d._id), d]),
    );

    const attachments: RecruiterAttachmentDTO[] = [];
    if (application.cv_id) {
      const cvDoc = docsMap.get(String(application.cv_id));
      if (cvDoc) {
        attachments.push({
          documentId: String(cvDoc._id),
          type: 'cv',
          fileName: cvDoc.file_name,
          mimeType: cvDoc.mime_type,
          size: cvDoc.size,
          submittedAt: application.createdAt.toISOString(),
        });
      }
    }
    if (application.cover_letter_id) {
      const clDoc = docsMap.get(String(application.cover_letter_id));
      if (clDoc) {
        attachments.push({
          documentId: String(clDoc._id),
          type: 'cover_letter',
          fileName: clDoc.file_name,
          mimeType: clDoc.mime_type,
          size: clDoc.size,
          submittedAt: application.createdAt.toISOString(),
        });
      }
    }

    const timelineInterviews: RecruiterInterviewTimelineEntryDTO[] = interviews.map(
      (interview) => ({
        id: String(interview._id),
        scheduledAt: interview.scheduled_at.toISOString(),
        endsAt: interview.ends_at.toISOString(),
        durationMinutes: interview.duration_minutes,
        mode: interview.mode,
        meetingLink: interview.meeting_link ?? null,
        location: interview.location ?? null,
        status: interview.status,
        notes: interview.notes ?? null,
      }),
    );

    const notes: RecruiterNoteEntryDTO[] = (application.notes ?? []).map((note) => ({
      authorId: String(note.author_id),
      authorName: note.author_name,
      content: note.content,
      createdAt: note.created_at.toISOString(),
    }));

    const statusHistory: RecruiterStatusHistoryEntryDTO[] = application.status_history.map(
      (entry) => ({
        status: entry.status,
        reviewStage: STATUS_REVIEW_STAGE[entry.status] ?? null,
        actorRole: entry.actor_role ?? null,
        note: entry.note ?? null,
        messageToCandidate: entry.message_to_candidate ?? null,
        rejectionReason: entry.rejection_reason ?? null,
        occurredAt: entry.changed_at.toISOString(),
      }),
    );

    const history = application.status_history;
    const latestStatusAt = (
      history.length > 0 ? history[history.length - 1]!.changed_at : application.updatedAt
    ).toISOString();

    return {
      id: String(application._id),
      job: {
        id: String(application.job_id),
        title: jobDoc?.title ?? '',
        location: jobDoc?.location ?? null,
        employmentType: jobDoc?.employment_type ?? null,
        department: null,
        status: jobDoc?.status ?? 'closed',
        expiresAt: jobDoc?.expires_at ? jobDoc.expires_at.toISOString() : null,
      },
      applicant: {
        id: String(application.applicant_id),
        fullName: applicantUser?.full_name ?? null,
        email: applicantUser?.email ?? '',
        phone: applicantUser?.phone ?? null,
        role: applicantUser?.role ?? 'candidate',
        status: applicantUser?.status ?? 'active',
      },
      status: application.status,
      reviewStage: STATUS_REVIEW_STAGE[application.status] ?? null,
      message: application.message ?? null,
      withdrawalReason: application.withdrawal_reason ?? null,
      attachments,
      interviews: timelineInterviews,
      notes,
      statusHistory,
      version: history.length,
      submittedAt: application.createdAt.toISOString(),
      latestStatusAt,
      createdAt: application.createdAt.toISOString(),
      updatedAt: application.updatedAt.toISOString(),
    };
  }

  async getCvDownload(
    actorId: string,
    actorRole: string,
    applicationId: string,
  ): Promise<{
    fileResult: DocumentFileResult;
    metadata: RecruiterApplicationCvMetadataDTO;
  }> {
    const { enterpriseId } = await this.assertRecruiterScope(actorId, actorRole);
    const enterpriseJobIds = await this.resolveEnterpriseJobIds(enterpriseId);
    if (enterpriseJobIds.length === 0) {
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        'Application not found',
      );
    }

    const application = await this.repository.findByIdAndJobIds(
      applicationId,
      enterpriseJobIds,
    );
    if (!application || !application.cv_id) {
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        'Application or CV not found',
      );
    }

    const applicantId = String(application.applicant_id);
    const cvId = String(application.cv_id);

    const cvDocument = await this.documents.findOwnedByType(
      cvId,
      applicantId,
      'cv',
    );
    if (!cvDocument || cvDocument.deleted_at) {
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        'CV not found or has been removed',
      );
    }

    const fileResult = await this.documents.download(applicantId, cvId);

    const metadata: RecruiterApplicationCvMetadataDTO = {
      documentId: String(cvDocument._id),
      fileName: cvDocument.file_name,
      mimeType: cvDocument.mime_type,
      size: cvDocument.size,
      fileUrl: cvDocument.file_url,
    };

    return { fileResult, metadata };
  }

  async addNote(
    actorId: string,
    actorRole: string,
    applicationId: string,
    content: string,
  ): Promise<RecruiterNoteEntryDTO> {
    const { enterpriseId } = await this.assertRecruiterScope(actorId, actorRole);
    const enterpriseJobIds = await this.resolveEnterpriseJobIds(enterpriseId);
    if (enterpriseJobIds.length === 0) {
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        'Application not found',
      );
    }

    const author = await this.users.findById(actorId);
    const authorName = author?.full_name || author?.email || 'Recruiter';

    const note = await this.repository.addNoteToApplication(
      applicationId,
      enterpriseJobIds,
      {
        authorId: actorId,
        authorName,
        content,
      },
    );

    if (!note) {
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        'Application not found',
      );
    }

    return {
      authorId: String(note.author_id),
      authorName: note.author_name,
      content: note.content,
      createdAt: note.created_at.toISOString(),
    };
  }

  async listNotes(
    actorId: string,
    actorRole: string,
    applicationId: string,
  ): Promise<RecruiterNotesListResponse> {
    const { enterpriseId } = await this.assertRecruiterScope(actorId, actorRole);
    const enterpriseJobIds = await this.resolveEnterpriseJobIds(enterpriseId);
    if (enterpriseJobIds.length === 0) {
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        'Application not found',
      );
    }

    const notes = await this.repository.findNotesByApplicationId(
      applicationId,
      enterpriseJobIds,
    );

    if (!notes) {
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        'Application not found',
      );
    }

    const items: RecruiterNoteEntryDTO[] = notes.map((note) => ({
      authorId: String(note.author_id),
      authorName: note.author_name,
      content: note.content,
      createdAt: note.created_at.toISOString(),
    }));

    return {
      items,
      total: items.length,
    };
  }
}

export const recruiterApplicationsService = new RecruiterApplicationsService();
