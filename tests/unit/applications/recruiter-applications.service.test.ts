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

describe('RecruiterApplicationsService (PR 3: Detail & CV Download)', () => {
  const repository = {
    findByIdAndJobIds: vi.fn(),
    findPageForRecruiter: vi.fn(),
    countByStatusForRecruiter: vi.fn(),
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
  };

  const documentsService = {
    findByIds: vi.fn(),
    findOwnedByType: vi.fn(),
    download: vi.fn(),
  };

  const service = new RecruiterApplicationsService(
    repository as never,
    usersService as never,
    jobPostingsService as never,
    documentsService as never,
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
});
