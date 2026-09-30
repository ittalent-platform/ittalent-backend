import type { Types } from 'mongoose';

import type { ApplicationDoc } from '../../models/application.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import {
  consumeEmailDeliveryStatus,
  sendApplicationConfirmationEmail,
} from '../../shared/services/email.service.js';
import { documentsService, type DocumentsService } from '../documents/documents.service.js';
import { jobPostingsService, type JobPostingsService } from '../job-postings/job-postings.service.js';
import { usersService, type UsersService } from '../users/users.service.js';
import {
  APPLICATION_EMAIL_FAILED_LOG,
  APPLICATION_ERROR_CODES,
  APPLICATION_HIRED_STATUS,
  APPLICATION_MESSAGES,
  APPLICATION_SUBMITTED_LABEL,
  CLOSED_APPLICATION_STATUSES,
  MAX_APPLICATIONS_PER_JOB,
} from './applications.constants.js';
import {
  applicationsRepository,
  type ApplicationsRepository,
  type SubmitApplicationData,
} from './applications.repository.js';
import type { ApplicationDTO, CreateApplicationBody } from './applications.schemas.js';

export class ApplicationsService {
  constructor(
    private readonly repository: ApplicationsRepository = applicationsRepository,
    private readonly users: UsersService = usersService,
    private readonly jobs: JobPostingsService = jobPostingsService,
    private readonly documents: DocumentsService = documentsService,
  ) {}

  private mapDto(application: ApplicationDoc): ApplicationDTO {
    return {
      id: String(application._id),
      jobPostingId: String(application.job_id),
      status: application.status,
      cvId: String(application.cv_id),
      coverLetterId: application.cover_letter_id ? String(application.cover_letter_id) : null,
      message: application.message ?? null,
      reappliedFrom: application.reapplied_from ? String(application.reapplied_from) : null,
      reappliedAs: application.reapplied_as ? String(application.reapplied_as) : null,
      createdAt: application.createdAt.toISOString(),
      updatedAt: application.updatedAt.toISOString(),
    };
  }

  // E7: a failed confirmation email never fails the application; it is only logged.
  private async sendConfirmation(email: string, jobTitle: string): Promise<void> {
    try {
      await sendApplicationConfirmationEmail(email, jobTitle, APPLICATION_SUBMITTED_LABEL);
      if (consumeEmailDeliveryStatus(email) === false) {
        console.error(APPLICATION_EMAIL_FAILED_LOG, { email });
      }
    } catch (error) {
      console.error(APPLICATION_EMAIL_FAILED_LOG, error);
    }
  }

  async applyToJob(userId: string, input: CreateApplicationBody): Promise<ApplicationDTO> {
    // E1/E2: signed-in user must exist and have a verified (active) account.
    const user = await this.users.findById(userId);
    if (!user) {
      throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, APPLICATION_MESSAGES.AUTH_REQUIRED);
    }
    if (user.status === 'inactive') {
      throw createHttpError(
        HTTP_STATUS.HTTP_403_FORBIDDEN,
        APPLICATION_MESSAGES.EMAIL_NOT_VERIFIED,
        APPLICATION_ERROR_CODES.EMAIL_NOT_VERIFIED,
      );
    }
    if (user.status !== 'active') {
      throw createHttpError(
        HTTP_STATUS.HTTP_403_FORBIDDEN,
        APPLICATION_MESSAGES.ACCOUNT_NOT_ACTIVE,
        APPLICATION_ERROR_CODES.ACCOUNT_NOT_ACTIVE,
      );
    }

    // E4: job must be Published + Open.
    const job = await this.jobs.findPublicJobById(input.jobPostingId);
    if (!job) {
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        APPLICATION_MESSAGES.JOB_UNAVAILABLE,
        APPLICATION_ERROR_CODES.JOB_UNAVAILABLE,
      );
    }

    // E5a: stop when hired applicants already reached the number of openings.
    const hiredCount = await this.repository.countHiredByJobId(job._id);
    if (hiredCount >= job.openings) {
      throw createHttpError(
        HTTP_STATUS.HTTP_409_CONFLICT,
        APPLICATION_MESSAGES.POSITION_FILLED,
        APPLICATION_ERROR_CODES.POSITION_FILLED,
      );
    }

    // E3: CV (required) and cover letter (optional) must be owned by the signed-in user (Document.owner_id).
    const cv = await this.documents.findOwnedByType(input.cvId, userId, 'cv');
    if (!cv) {
      throw createHttpError(
        HTTP_STATUS.HTTP_400_BAD_REQUEST,
        APPLICATION_MESSAGES.INVALID_CV,
        APPLICATION_ERROR_CODES.INVALID_CV,
      );
    }
    if (input.coverLetterId) {
      const coverLetter = await this.documents.findOwnedByType(input.coverLetterId, userId, 'cover_letter');
      if (!coverLetter) {
        throw createHttpError(
          HTTP_STATUS.HTTP_400_BAD_REQUEST,
          APPLICATION_MESSAGES.INVALID_COVER_LETTER,
          APPLICATION_ERROR_CODES.INVALID_COVER_LETTER,
        );
      }
    }

    const data: SubmitApplicationData = {
      jobId: job._id,
      applicantId: userId,
      cvId: input.cvId,
      coverLetterId: input.coverLetterId,
      message: input.message,
      changedBy: userId,
    };

    // E5 / BR-APP-002: one active application per applicant/job. E6 / BR-APP-010: after a Withdrawn or
    // Rejected one the applicant may apply again as a NEW record (the closed one is never reopened), at most
    // twice per job, and never after Hired.
    const latest = await this.repository.findLatestByJobAndApplicant(job._id, userId);
    let reappliedFrom: Types.ObjectId | undefined;
    if (latest) {
      if (latest.status === APPLICATION_HIRED_STATUS) {
        throw this.applyAgainNotAllowed();
      }
      if (!CLOSED_APPLICATION_STATUSES.includes(latest.status)) {
        throw this.alreadyApplied();
      }
      if ((await this.repository.countByJobAndApplicant(job._id, userId)) >= MAX_APPLICATIONS_PER_JOB) {
        throw this.applyAgainNotAllowed();
      }
      reappliedFrom = latest._id as Types.ObjectId;
    }
    const application = await this.repository.create({ ...data, reappliedFrom });

    // null = a concurrent request won the race (unique index / status condition).
    if (!application) {
      throw this.alreadyApplied();
    }

    await this.sendConfirmation(user.email, job.title);

    return this.mapDto(application);
  }

  // Powers the apply area on the job page. Returns the LATEST record of the pair in any status; the client
  // decides whether the applicant may apply again (Withdrawn/Rejected) or should see the "already applied" card.
  async findMyApplication(userId: string, jobPostingId: string): Promise<ApplicationDTO | null> {
    const application = await this.repository.findLatestByJobAndApplicant(jobPostingId, userId);
    return application ? this.mapDto(application) : null;
  }

  private applyAgainNotAllowed(): Error {
    return createHttpError(
      HTTP_STATUS.HTTP_409_CONFLICT,
      APPLICATION_MESSAGES.APPLY_AGAIN_NOT_ALLOWED,
      APPLICATION_ERROR_CODES.APPLY_AGAIN_NOT_ALLOWED,
    );
  }

  private alreadyApplied(): Error {
    return createHttpError(
      HTTP_STATUS.HTTP_409_CONFLICT,
      APPLICATION_MESSAGES.ALREADY_APPLIED,
      APPLICATION_ERROR_CODES.ALREADY_APPLIED,
    );
  }
}

export const applicationsService = new ApplicationsService();