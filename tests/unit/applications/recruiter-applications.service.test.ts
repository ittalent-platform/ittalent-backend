import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';

import { Interview } from '../../../src/models/interview.model.js';
import { RecruiterApplicationsService } from '../../../src/modules/applications/recruiter-applications.service.js';

function mockMongooseQuery(result: unknown): Record<string, ReturnType<typeof vi.fn>> {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['sort', 'skip', 'limit', 'lean']) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.exec = vi.fn().mockResolvedValue(result);
  return chain;
}

describe('RecruiterApplicationsService', () => {
  const repository = {
    findByIdAndJobIds: vi.fn(),
    findPageForRecruiter: vi.fn(),
    countByStatusForRecruiter: vi.fn(),
    addNoteToApplication: vi.fn(),
    findNotesByApplicationId: vi.fn(),
    updateStatusAtomically: vi.fn(),
    countHiredApplications: vi.fn(),
    cascadePositionFilled: vi.fn(),
    findApplicantSubmissionsByJobIds: vi.fn(),
  };

  const usersService = {
    getEnterpriseId: vi.fn(),
    findById: vi.fn(),
    findByIds: vi.fn(),
    findIdsByKeyword: vi.fn(),
  };

  const jobPostingsService = {
    findJobIdsByEnterpriseId: vi.fn(),
    findJobIdsByTitleAndEnterpriseId: vi.fn(),
    findJobById: vi.fn(),
    findSummariesByIds: vi.fn(),
    findJobsByIds: vi.fn(),
    closeJobPosting: vi.fn(),
  };

  const documentsService = {
    findByIds: vi.fn(),
    findOwnedByType: vi.fn(),
    download: vi.fn(),
  };

  const notificationsService = {
    dispatch: vi.fn().mockResolvedValue({ id: 'noti-123' }),
  };

  const service = new RecruiterApplicationsService(
    repository as never,
    usersService as never,
    jobPostingsService as never,
    documentsService as never,
    notificationsService as never,
  );

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  describe('getApplicationDetail', () => {
    const actorId = new Types.ObjectId().toString();
    const enterpriseId = new Types.ObjectId().toString();
    const appId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();
    const applicantId = new Types.ObjectId().toString();
    const cvId = new Types.ObjectId().toString();

    it('rejects with 403 when actor does not have recruiter role', async () => {
      await expect(
        service.getApplicationDetail(actorId, 'candidate', appId),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: 'Recruiter or enterprise administrator role required',
      });
    });

    it('rejects with 403 when recruiter has no active enterprise assignment', async () => {
      usersService.getEnterpriseId.mockResolvedValue(null);

      await expect(
        service.getApplicationDetail(actorId, 'recruiter', appId),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: 'Active enterprise assignment required',
      });
    });

    it('throws 404 if enterprise has no job postings', async () => {
      usersService.getEnterpriseId.mockResolvedValue(enterpriseId);
      jobPostingsService.findJobIdsByEnterpriseId.mockResolvedValue([]);

      await expect(
        service.getApplicationDetail(actorId, 'recruiter', appId),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Application not found',
      });
    });

    it('throws opaque 404 if application does not exist or is not owned by enterprise', async () => {
      usersService.getEnterpriseId.mockResolvedValue(enterpriseId);
      jobPostingsService.findJobIdsByEnterpriseId.mockResolvedValue([jobId]);
      repository.findByIdAndJobIds.mockResolvedValue(null);

      await expect(
        service.getApplicationDetail(actorId, 'recruiter', appId),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Application not found',
      });
    });

    it('returns full application detail when found and authorized', async () => {
      usersService.getEnterpriseId.mockResolvedValue(enterpriseId);
      jobPostingsService.findJobIdsByEnterpriseId.mockResolvedValue([jobId]);

      const mockApplication = {
        _id: new Types.ObjectId(appId),
        job_id: new Types.ObjectId(jobId),
        applicant_id: new Types.ObjectId(applicantId),
        cv_id: new Types.ObjectId(cvId),
        cover_letter_id: undefined,
        status: 'under_review',
        message: 'My cover letter text',
        status_history: [
          {
            status: 'submitted',
            changed_at: new Date('2026-10-12T10:00:00.000Z'),
            changed_by: new Types.ObjectId(),
          },
        ],
        notes: [
          {
            author_id: new Types.ObjectId(actorId),
            author_name: 'Lead Recruiter',
            content: 'Great resume',
            created_at: new Date('2026-10-12T10:30:00.000Z'),
          },
        ],
        createdAt: new Date('2026-10-12T10:00:00.000Z'),
        updatedAt: new Date('2026-10-12T10:30:00.000Z'),
      };
      repository.findByIdAndJobIds.mockResolvedValue(mockApplication);

      jobPostingsService.findJobById.mockResolvedValue({
        _id: new Types.ObjectId(jobId),
        title: 'Fullstack Dev',
        location: 'Danang',
        employment_type: 'full_time',
        status: 'published',
        expires_at: new Date('2026-12-31T00:00:00.000Z'),
      });

      usersService.findById.mockResolvedValue({
        _id: new Types.ObjectId(applicantId),
        full_name: 'Nguyen Van B',
        email: 'applicant@example.com',
        phone: '0987654321',
        role: 'candidate',
        status: 'active',
      });

      documentsService.findByIds.mockResolvedValue([
        {
          _id: new Types.ObjectId(cvId),
          file_name: 'resume.pdf',
          mime_type: 'application/pdf',
          size: 20480,
        },
      ]);

      vi.spyOn(Interview, 'find').mockReturnValue(mockMongooseQuery([]) as never);

      const result = await service.getApplicationDetail(actorId, 'recruiter', appId);

      expect(result.id).toBe(appId);
      expect(result.job.title).toBe('Fullstack Dev');
      expect(result.applicant.fullName).toBe('Nguyen Van B');
      expect(result.attachments).toHaveLength(1);
      expect(result.attachments[0]?.fileName).toBe('resume.pdf');
      expect(result.notes).toHaveLength(1);
      expect(result.version).toBe(1);
    });
  });

  describe('getCvDownload', () => {
    const actorId = new Types.ObjectId().toString();
    const enterpriseId = new Types.ObjectId().toString();
    const appId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();
    const applicantId = new Types.ObjectId().toString();
    const cvId = new Types.ObjectId().toString();

    it('throws opaque 404 when application is not found in enterprise jobs', async () => {
      usersService.getEnterpriseId.mockResolvedValue(enterpriseId);
      jobPostingsService.findJobIdsByEnterpriseId.mockResolvedValue([jobId]);
      repository.findByIdAndJobIds.mockResolvedValue(null);

      await expect(
        service.getCvDownload(actorId, 'recruiter', appId),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Application or CV not found',
      });
    });

    it('throws 404 when referenced CV document does not exist or was deleted', async () => {
      usersService.getEnterpriseId.mockResolvedValue(enterpriseId);
      jobPostingsService.findJobIdsByEnterpriseId.mockResolvedValue([jobId]);
      repository.findByIdAndJobIds.mockResolvedValue({
        _id: new Types.ObjectId(appId),
        applicant_id: new Types.ObjectId(applicantId),
        cv_id: new Types.ObjectId(cvId),
      });
      documentsService.findOwnedByType.mockResolvedValue(null);

      await expect(
        service.getCvDownload(actorId, 'recruiter', appId),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'CV not found or has been removed',
      });
    });

    it('returns fileResult and metadata when valid CV is found', async () => {
      usersService.getEnterpriseId.mockResolvedValue(enterpriseId);
      jobPostingsService.findJobIdsByEnterpriseId.mockResolvedValue([jobId]);
      repository.findByIdAndJobIds.mockResolvedValue({
        _id: new Types.ObjectId(appId),
        applicant_id: new Types.ObjectId(applicantId),
        cv_id: new Types.ObjectId(cvId),
      });

      const mockDoc = {
        _id: new Types.ObjectId(cvId),
        file_name: 'cv.pdf',
        mime_type: 'application/pdf',
        size: 51200,
        file_url: 'https://storage.example.com/cv.pdf',
      };
      documentsService.findOwnedByType.mockResolvedValue(mockDoc);

      const mockFileResult = {
        fileName: 'cv.pdf',
        mimeType: 'application/pdf',
        response: { ok: true },
      };
      documentsService.download.mockResolvedValue(mockFileResult);

      const result = await service.getCvDownload(actorId, 'recruiter', appId);

      expect(result.fileResult).toEqual(mockFileResult);
      expect(result.metadata.documentId).toBe(cvId);
      expect(result.metadata.fileName).toBe('cv.pdf');
      expect(result.metadata.size).toBe(51200);
    });
  });

  describe('addNote', () => {
    const actorId = new Types.ObjectId().toString();
    const enterpriseId = new Types.ObjectId().toString();
    const appId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();

    it('rejects with 403 when actor does not have recruiter role', async () => {
      await expect(
        service.addNote(actorId, 'candidate', appId, 'Valid note'),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: 'Recruiter or enterprise administrator role required',
      });
    });

    it('rejects with 403 when recruiter has no active enterprise assignment', async () => {
      usersService.getEnterpriseId.mockResolvedValue(null);

      await expect(
        service.addNote(actorId, 'recruiter', appId, 'Valid note'),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: 'Active enterprise assignment required',
      });
    });

    it('throws 404 if enterprise has no job postings', async () => {
      usersService.getEnterpriseId.mockResolvedValue(enterpriseId);
      jobPostingsService.findJobIdsByEnterpriseId.mockResolvedValue([]);

      await expect(
        service.addNote(actorId, 'recruiter', appId, 'Valid note'),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Application not found',
      });
    });

    it('throws opaque 404 if application is not found or not owned by enterprise', async () => {
      usersService.getEnterpriseId.mockResolvedValue(enterpriseId);
      jobPostingsService.findJobIdsByEnterpriseId.mockResolvedValue([jobId]);
      usersService.findById.mockResolvedValue({
        _id: new Types.ObjectId(actorId),
        full_name: 'Lead Recruiter',
        email: 'recruiter@enterprise.com',
      });
      repository.addNoteToApplication.mockResolvedValue(null);

      await expect(
        service.addNote(actorId, 'recruiter', appId, 'Valid note'),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Application not found',
      });
    });

    it('successfully creates note and resolves author name from user profile', async () => {
      usersService.getEnterpriseId.mockResolvedValue(enterpriseId);
      jobPostingsService.findJobIdsByEnterpriseId.mockResolvedValue([jobId]);
      usersService.findById.mockResolvedValue({
        _id: new Types.ObjectId(actorId),
        full_name: 'Senior Recruiter',
        email: 'sr@enterprise.com',
      });

      const createdAt = new Date('2026-10-12T11:00:00.000Z');
      repository.addNoteToApplication.mockResolvedValue({
        author_id: new Types.ObjectId(actorId),
        author_name: 'Senior Recruiter',
        content: 'Promising candidate',
        created_at: createdAt,
      });

      const result = await service.addNote(actorId, 'recruiter', appId, 'Promising candidate');

      expect(repository.addNoteToApplication).toHaveBeenCalledWith(
        appId,
        [jobId],
        {
          authorId: actorId,
          authorName: 'Senior Recruiter',
          content: 'Promising candidate',
        },
      );
      expect(result).toEqual({
        authorId: actorId,
        authorName: 'Senior Recruiter',
        content: 'Promising candidate',
        createdAt: createdAt.toISOString(),
      });
    });

    it('falls back to email or Recruiter when full_name is absent', async () => {
      usersService.getEnterpriseId.mockResolvedValue(enterpriseId);
      jobPostingsService.findJobIdsByEnterpriseId.mockResolvedValue([jobId]);
      usersService.findById.mockResolvedValue({
        _id: new Types.ObjectId(actorId),
        email: 'anon@enterprise.com',
      });

      const createdAt = new Date('2026-10-12T11:00:00.000Z');
      repository.addNoteToApplication.mockResolvedValue({
        author_id: new Types.ObjectId(actorId),
        author_name: 'anon@enterprise.com',
        content: 'Note without name',
        created_at: createdAt,
      });

      const result = await service.addNote(actorId, 'recruiter', appId, 'Note without name');

      expect(repository.addNoteToApplication).toHaveBeenCalledWith(
        appId,
        [jobId],
        {
          authorId: actorId,
          authorName: 'anon@enterprise.com',
          content: 'Note without name',
        },
      );
      expect(result.authorName).toBe('anon@enterprise.com');
    });
  });

  describe('listNotes', () => {
    const actorId = new Types.ObjectId().toString();
    const enterpriseId = new Types.ObjectId().toString();
    const appId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();

    it('rejects with 403 when actor does not have recruiter role', async () => {
      await expect(
        service.listNotes(actorId, 'candidate', appId),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: 'Recruiter or enterprise administrator role required',
      });
    });

    it('rejects with 403 when recruiter has no active enterprise assignment', async () => {
      usersService.getEnterpriseId.mockResolvedValue(null);

      await expect(
        service.listNotes(actorId, 'recruiter', appId),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: 'Active enterprise assignment required',
      });
    });

    it('throws 404 if enterprise has no job postings', async () => {
      usersService.getEnterpriseId.mockResolvedValue(enterpriseId);
      jobPostingsService.findJobIdsByEnterpriseId.mockResolvedValue([]);

      await expect(
        service.listNotes(actorId, 'recruiter', appId),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Application not found',
      });
    });

    it('throws opaque 404 if application is not found or not owned by enterprise', async () => {
      usersService.getEnterpriseId.mockResolvedValue(enterpriseId);
      jobPostingsService.findJobIdsByEnterpriseId.mockResolvedValue([jobId]);
      repository.findNotesByApplicationId.mockResolvedValue(null);

      await expect(
        service.listNotes(actorId, 'recruiter', appId),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Application not found',
      });
    });

    it('returns formatted notes list when application belongs to enterprise', async () => {
      usersService.getEnterpriseId.mockResolvedValue(enterpriseId);
      jobPostingsService.findJobIdsByEnterpriseId.mockResolvedValue([jobId]);

      const createdAt = new Date('2026-10-12T11:00:00.000Z');
      repository.findNotesByApplicationId.mockResolvedValue([
        {
          author_id: new Types.ObjectId(actorId),
          author_name: 'Lead Recruiter',
          content: 'First interview went well',
          created_at: createdAt,
        },
      ]);

      const result = await service.listNotes(actorId, 'recruiter', appId);

      expect(repository.findNotesByApplicationId).toHaveBeenCalledWith(appId, [jobId]);
      expect(result.total).toBe(1);
      expect(result.items).toEqual([
        {
          authorId: actorId,
          authorName: 'Lead Recruiter',
          content: 'First interview went well',
          createdAt: createdAt.toISOString(),
        },
      ]);
    });
  });

  describe('updateStatus (PR 5)', () => {
    const actorId = new Types.ObjectId().toString();
    const enterpriseId = new Types.ObjectId().toString();
    const appId = new Types.ObjectId().toString();
    const jobId = new Types.ObjectId().toString();
    const applicantId = new Types.ObjectId().toString();

    it('rejects with 403 when actor does not have recruiter role', async () => {
      await expect(
        service.updateStatus(actorId, 'candidate', appId, { status: 'under_review' }),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: 'Recruiter or enterprise administrator role required',
      });
    });

    it('rejects with 403 when recruiter has no active enterprise assignment', async () => {
      usersService.getEnterpriseId.mockResolvedValue(null);

      await expect(
        service.updateStatus(actorId, 'recruiter', appId, { status: 'under_review' }),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: 'Active enterprise assignment required',
      });
    });

    it('throws 404 if enterprise has no job postings', async () => {
      usersService.getEnterpriseId.mockResolvedValue(enterpriseId);
      jobPostingsService.findJobIdsByEnterpriseId.mockResolvedValue([]);

      await expect(
        service.updateStatus(actorId, 'recruiter', appId, { status: 'under_review' }),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Application not found',
      });
    });

    it('throws opaque 404 if application is not found or not owned by enterprise', async () => {
      usersService.getEnterpriseId.mockResolvedValue(enterpriseId);
      jobPostingsService.findJobIdsByEnterpriseId.mockResolvedValue([jobId]);
      repository.findByIdAndJobIds.mockResolvedValue(null);

      await expect(
        service.updateStatus(actorId, 'recruiter', appId, { status: 'under_review' }),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Application not found',
      });
    });

    it('rejects with 400 when transition is invalid per BR-17', async () => {
      usersService.getEnterpriseId.mockResolvedValue(enterpriseId);
      jobPostingsService.findJobIdsByEnterpriseId.mockResolvedValue([jobId]);
      repository.findByIdAndJobIds.mockResolvedValue({
        _id: new Types.ObjectId(appId),
        status: 'submitted',
      });

      await expect(
        service.updateStatus(actorId, 'recruiter', appId, { status: 'hired' }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('Invalid status transition'),
      });
    });

    it('rejects with 400 when transitioning to interviewing without scheduled interview (BR-37)', async () => {
      usersService.getEnterpriseId.mockResolvedValue(enterpriseId);
      jobPostingsService.findJobIdsByEnterpriseId.mockResolvedValue([jobId]);
      repository.findByIdAndJobIds.mockResolvedValue({
        _id: new Types.ObjectId(appId),
        status: 'under_review',
      });
      vi.spyOn(Interview, 'exists').mockResolvedValue(null as never);

      await expect(
        service.updateStatus(actorId, 'recruiter', appId, { status: 'interviewing' }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'An active interview must be scheduled before transitioning to interviewing',
      });
    });

    it('rejects with 400 when transitioning to offered without completed interview (BR-37)', async () => {
      usersService.getEnterpriseId.mockResolvedValue(enterpriseId);
      jobPostingsService.findJobIdsByEnterpriseId.mockResolvedValue([jobId]);
      repository.findByIdAndJobIds.mockResolvedValue({
        _id: new Types.ObjectId(appId),
        status: 'interviewing',
      });
      vi.spyOn(Interview, 'exists').mockResolvedValue(null as never);

      await expect(
        service.updateStatus(actorId, 'recruiter', appId, { status: 'offered' }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'At least one interview must be completed before making an offer',
      });
    });

    it('rejects with 409 when hiring into fully filled openings (EX5)', async () => {
      usersService.getEnterpriseId.mockResolvedValue(enterpriseId);
      jobPostingsService.findJobIdsByEnterpriseId.mockResolvedValue([jobId]);
      repository.findByIdAndJobIds.mockResolvedValue({
        _id: new Types.ObjectId(appId),
        job_id: new Types.ObjectId(jobId),
        status: 'offered',
      });
      jobPostingsService.findJobById.mockResolvedValue({
        _id: new Types.ObjectId(jobId),
        openings: 2,
      });
      repository.countHiredApplications.mockResolvedValue(2);

      await expect(
        service.updateStatus(actorId, 'recruiter', appId, { status: 'hired' }),
      ).rejects.toMatchObject({
        statusCode: 409,
        message: 'All vacancies for this job posting have been filled',
      });
    });

    it('successfully updates status and returns updated application detail', async () => {
      usersService.getEnterpriseId.mockResolvedValue(enterpriseId);
      jobPostingsService.findJobIdsByEnterpriseId.mockResolvedValue([jobId]);

      const mockApp = {
        _id: new Types.ObjectId(appId),
        job_id: new Types.ObjectId(jobId),
        applicant_id: new Types.ObjectId(applicantId),
        status: 'submitted',
        status_history: [
          { status: 'submitted', changed_at: new Date('2026-10-12T10:00:00.000Z') },
        ],
        notes: [],
        createdAt: new Date('2026-10-12T10:00:00.000Z'),
        updatedAt: new Date('2026-10-12T10:00:00.000Z'),
      };

      const mockUpdated = {
        ...mockApp,
        status: 'under_review',
        status_history: [
          ...mockApp.status_history,
          { status: 'under_review', changed_at: new Date('2026-10-12T10:30:00.000Z'), changed_by: new Types.ObjectId(actorId) },
        ],
      };
      repository.findByIdAndJobIds
        .mockResolvedValueOnce(mockApp)
        .mockResolvedValueOnce(mockUpdated);
      repository.updateStatusAtomically.mockResolvedValue(mockUpdated);

      jobPostingsService.findJobById.mockResolvedValue({
        _id: new Types.ObjectId(jobId),
        title: 'Fullstack Dev',
      });
      usersService.findById.mockResolvedValue({
        _id: new Types.ObjectId(applicantId),
        full_name: 'Nguyen Van B',
        email: 'applicant@example.com',
      });
      documentsService.findByIds.mockResolvedValue([]);
      vi.spyOn(Interview, 'find').mockReturnValue(mockMongooseQuery([]) as never);

      const result = await service.updateStatus(actorId, 'recruiter', appId, {
        status: 'under_review',
        note: 'Screening passed',
      });

      expect(repository.updateStatusAtomically).toHaveBeenCalledWith(
        appId,
        [jobId],
        {
          status: 'under_review',
          changedBy: actorId,
          actorRole: 'recruiter',
          note: 'Screening passed',
          messageToCandidate: undefined,
          rejectionReason: undefined,
        },
        undefined,
      );
      expect(result.status).toBe('under_review');
      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: applicantId,
          type: 'application_status_changed',
          category: 'info',
          data: expect.objectContaining({
            applicationId: appId,
            status: 'under_review',
          }),
        }),
      );
    });

    it('auto-closes job posting and cascades position_filled when final vacancy is hired (BR-18)', async () => {
      usersService.getEnterpriseId.mockResolvedValue(enterpriseId);
      jobPostingsService.findJobIdsByEnterpriseId.mockResolvedValue([jobId]);

      const mockApp = {
        _id: new Types.ObjectId(appId),
        job_id: new Types.ObjectId(jobId),
        applicant_id: new Types.ObjectId(applicantId),
        status: 'offered',
        status_history: [
          { status: 'submitted', changed_at: new Date('2026-10-12T10:00:00.000Z') },
          { status: 'offered', changed_at: new Date('2026-10-12T10:30:00.000Z') },
        ],
        notes: [],
        createdAt: new Date('2026-10-12T10:00:00.000Z'),
        updatedAt: new Date('2026-10-12T10:30:00.000Z'),
      };
      repository.findByIdAndJobIds.mockResolvedValue(mockApp);
      jobPostingsService.findJobById.mockResolvedValue({
        _id: new Types.ObjectId(jobId),
        title: 'Fullstack Dev',
        openings: 1,
      });
      repository.countHiredApplications.mockResolvedValue(0);

      const mockUpdated = {
        ...mockApp,
        status: 'hired',
        status_history: [
          ...mockApp.status_history,
          { status: 'hired', changed_at: new Date('2026-10-12T11:00:00.000Z'), changed_by: new Types.ObjectId(actorId) },
        ],
      };
      repository.updateStatusAtomically.mockResolvedValue(mockUpdated);
      usersService.findById.mockResolvedValue({
        _id: new Types.ObjectId(applicantId),
        email: 'applicant@example.com',
      });
      documentsService.findByIds.mockResolvedValue([]);
      vi.spyOn(Interview, 'find').mockReturnValue(mockMongooseQuery([]) as never);

      await service.updateStatus(actorId, 'recruiter', appId, { status: 'hired' });

      expect(jobPostingsService.closeJobPosting).toHaveBeenCalledWith(mockApp.job_id);
      expect(repository.cascadePositionFilled).toHaveBeenCalledWith(
        mockApp.job_id,
        mockApp._id,
        actorId,
      );
    });
  });

  describe('getApplicantCompanyHistory (PR 6: UC-S2-AA-07)', () => {
    const actorId = new Types.ObjectId().toString();
    const enterpriseId = new Types.ObjectId().toString();
    const appId = new Types.ObjectId().toString();
    const applicantId = new Types.ObjectId().toString();
    const job1Id = new Types.ObjectId().toString();
    const job2Id = new Types.ObjectId().toString();

    it('rejects unauthorized role', async () => {
      await expect(
        service.getApplicantCompanyHistory(actorId, 'candidate', appId),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining('Recruiter or enterprise administrator role required'),
      });
    });

    it('rejects recruiter without enterprise assignment', async () => {
      usersService.getEnterpriseId.mockResolvedValue(null);
      await expect(
        service.getApplicantCompanyHistory(actorId, 'recruiter', appId),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining('Active enterprise assignment required'),
      });
    });

    it('throws 404 when target application not found or outside enterprise scope (BR-06)', async () => {
      usersService.getEnterpriseId.mockResolvedValue(enterpriseId);
      jobPostingsService.findJobIdsByEnterpriseId.mockResolvedValue([job1Id]);
      repository.findByIdAndJobIds.mockResolvedValue(null);

      await expect(
        service.getApplicantCompanyHistory(actorId, 'recruiter', appId),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Application not found',
      });
    });

    it('returns history with isFirstTimeApplicant: true when candidate has only 1 submission', async () => {
      usersService.getEnterpriseId.mockResolvedValue(enterpriseId);
      jobPostingsService.findJobIdsByEnterpriseId.mockResolvedValue([job1Id]);

      const mockApp = {
        _id: new Types.ObjectId(appId),
        job_id: new Types.ObjectId(job1Id),
        applicant_id: new Types.ObjectId(applicantId),
        cv_id: new Types.ObjectId(),
        status: 'under_review',
        status_history: [
          { status: 'submitted', changed_at: new Date('2026-10-01T10:00:00.000Z') },
          { status: 'under_review', changed_at: new Date('2026-10-02T10:00:00.000Z') },
        ],
        notes: [{ content: 'Good fit' }],
        createdAt: new Date('2026-10-01T10:00:00.000Z'),
        updatedAt: new Date('2026-10-02T10:00:00.000Z'),
      };
      repository.findByIdAndJobIds.mockResolvedValue(mockApp);
      usersService.findById.mockResolvedValue({
        _id: new Types.ObjectId(applicantId),
        full_name: 'Nguyễn Văn A',
        email: 'applicant@example.com',
        phone: '+84900000001',
      });
      repository.findApplicantSubmissionsByJobIds.mockResolvedValue([mockApp]);
      jobPostingsService.findSummariesByIds.mockResolvedValue(
        new Map([
          [
            job1Id,
            {
              id: job1Id,
              title: 'Frontend Engineer',
              location: 'Hà Nội',
              employmentType: 'Full-time',
              status: 'published',
            },
          ],
        ]),
      );
      jobPostingsService.findJobsByIds.mockResolvedValue([
        { _id: new Types.ObjectId(job1Id), status: 'published' },
      ]);

      const result = await service.getApplicantCompanyHistory(actorId, 'recruiter', appId);

      expect(result.applicant.email).toBe('applicant@example.com');
      expect(result.isFirstTimeApplicant).toBe(true);
      expect(result.totalSubmissionsToCompany).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.id).toBe(appId);
      expect(result.items[0]?.isCurrentApplication).toBe(true);
      expect(result.items[0]?.job.title).toBe('Frontend Engineer');
      expect(result.items[0]?.reviewStage).toBe('screening');
      expect(result.items[0]?.submittedDocuments).toEqual(['cv']);
      expect(result.items[0]?.notesCount).toBe(1);
    });

    it('returns history with isFirstTimeApplicant: false when candidate has multiple submissions across company jobs', async () => {
      usersService.getEnterpriseId.mockResolvedValue(enterpriseId);
      jobPostingsService.findJobIdsByEnterpriseId.mockResolvedValue([job1Id, job2Id]);

      const mockAppCurrent = {
        _id: new Types.ObjectId(appId),
        job_id: new Types.ObjectId(job1Id),
        applicant_id: new Types.ObjectId(applicantId),
        cv_id: new Types.ObjectId(),
        status: 'interviewing',
        status_history: [
          { status: 'submitted', changed_at: new Date('2026-10-05T10:00:00.000Z') },
          { status: 'interviewing', changed_at: new Date('2026-10-06T10:00:00.000Z') },
        ],
        notes: [],
        createdAt: new Date('2026-10-05T10:00:00.000Z'),
        updatedAt: new Date('2026-10-06T10:00:00.000Z'),
      };
      const pastAppId = new Types.ObjectId().toString();
      const mockAppPast = {
        _id: new Types.ObjectId(pastAppId),
        job_id: new Types.ObjectId(job2Id),
        applicant_id: new Types.ObjectId(applicantId),
        cv_id: new Types.ObjectId(),
        cover_letter_id: new Types.ObjectId(),
        status: 'rejected',
        status_history: [
          { status: 'submitted', changed_at: new Date('2026-09-01T10:00:00.000Z') },
          {
            status: 'rejected',
            rejection_reason: 'Budget constraints',
            changed_at: new Date('2026-09-10T10:00:00.000Z'),
          },
        ],
        notes: [],
        createdAt: new Date('2026-09-01T10:00:00.000Z'),
        updatedAt: new Date('2026-09-10T10:00:00.000Z'),
      };

      repository.findByIdAndJobIds.mockResolvedValue(mockAppCurrent);
      usersService.findById.mockResolvedValue({
        _id: new Types.ObjectId(applicantId),
        full_name: 'Trần Thị B',
        email: 'b@example.com',
        phone: null,
      });
      repository.findApplicantSubmissionsByJobIds.mockResolvedValue([mockAppCurrent, mockAppPast]);
      jobPostingsService.findSummariesByIds.mockResolvedValue(
        new Map([
          [
            job1Id,
            {
              id: job1Id,
              title: 'Senior Backend Engineer',
              location: 'TP.HCM',
              employmentType: 'Full-time',
              status: 'published',
            },
          ],
          [
            job2Id,
            {
              id: job2Id,
              title: 'DevOps Engineer',
              location: 'Remote',
              employmentType: 'Contract',
              status: 'closed',
            },
          ],
        ]),
      );
      jobPostingsService.findJobsByIds.mockResolvedValue([
        { _id: new Types.ObjectId(job1Id), status: 'published' },
        { _id: new Types.ObjectId(job2Id), status: 'closed' },
      ]);

      const result = await service.getApplicantCompanyHistory(actorId, 'recruiter', appId);

      expect(result.isFirstTimeApplicant).toBe(false);
      expect(result.totalSubmissionsToCompany).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.items[0]?.id).toBe(appId);
      expect(result.items[0]?.isCurrentApplication).toBe(true);
      expect(result.items[1]?.id).toBe(pastAppId);
      expect(result.items[1]?.isCurrentApplication).toBe(false);
      expect(result.items[1]?.job.title).toBe('DevOps Engineer');
      expect(result.items[1]?.rejectionReason).toBe('Budget constraints');
      expect(result.items[1]?.submittedDocuments).toEqual(['cv', 'cover_letter']);
    });
  });
});

