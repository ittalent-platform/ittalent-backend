import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Enterprise } from '../../../src/models/enterprise.model.js';
import { JobPosting } from '../../../src/models/job-posting.model.js';
import { User } from '../../../src/models/user.model.js';
import { REPORT_MESSAGES } from '../../../src/modules/reports/reports.constants.js';
import { ReportsRepository } from '../../../src/modules/reports/reports.repository.js';
import { ReportsService } from '../../../src/modules/reports/reports.service.js';
import { StorageService } from '../../../src/shared/services/storage.service.js';

describe('ReportsService - submitReport Unit Tests', () => {
  let mockRepo: ReportsRepository;
  let mockStorage: StorageService;
  let service: ReportsService;

  const reporterId = '507f1f77bcf86cd799439011';
  const targetJobId = '507f1f77bcf86cd799439022';
  const enterpriseId = '507f1f77bcf86cd799439033';

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      generateNextReference: vi.fn().mockResolvedValue('RPT-2026-0142'),
      findDuplicate: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((data) => Promise.resolve({ ...data, _id: 'new-id' })),
    } as unknown as ReportsRepository;

    mockStorage = {
      uploadFile: vi.fn().mockResolvedValue({
        fileUrl: 'https://cloudinary.com/call-notes.pdf',
        storageKey: 'evidence/call-notes',
        fileName: 'call-notes.pdf',
        mimeType: 'application/pdf',
        size: 2048,
      }),
    } as unknown as StorageService;

    service = new ReportsService(mockRepo, mockStorage);
  });

  it('submits report for job target and creates snapshot with enterprise name', async () => {
    vi.spyOn(JobPosting, 'findById').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue({
        _id: targetJobId,
        title: 'Senior Backend Engineer (Go)',
        enterprise_id: enterpriseId,
        status: 'published',
        deleting: false,
      }),
    } as never);

    vi.spyOn(Enterprise, 'findById').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue({
        _id: enterpriseId,
        name: 'Nimbus Pay',
        status: 'active',
        is_deleted: false,
      }),
    } as never);

    const payload = {
      targetType: 'job' as const,
      targetId: targetJobId,
      reason: 'misleading_information' as const,
      statement: 'Salary range in call was much lower than posted.',
    };

    const result = await service.submitReport(reporterId, payload);

    expect(result.reference).toBe('RPT-2026-0142');
    expect(result.message).toBe(REPORT_MESSAGES.CREATE_SUCCESS);
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: 'RPT-2026-0142',
        target_snapshot: {
          title: 'Senior Backend Engineer (Go)',
          subtitle: 'Job · Nimbus Pay',
          enterprise_id: enterpriseId,
          enterprise_name: 'Nimbus Pay',
        },
        status: 'pending',
      }),
    );
  });

  it('throws 400 TARGET_UNAVAILABLE when job is deleted or missing', async () => {
    vi.spyOn(JobPosting, 'findById').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(null),
    } as never);

    const payload = {
      targetType: 'job' as const,
      targetId: targetJobId,
      reason: 'scam_or_fraud' as const,
      statement: 'Scam post',
    };

    await expect(service.submitReport(reporterId, payload)).rejects.toMatchObject({
      statusCode: 400,
      message: REPORT_MESSAGES.TARGET_UNAVAILABLE,
    });
  });

  it('handles idempotency by returning existing reference on duplicate submission without creating new report', async () => {
    vi.spyOn(JobPosting, 'findById').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue({
        _id: targetJobId,
        title: 'Senior Backend Engineer (Go)',
        enterprise_id: null,
      }),
    } as never);

    mockRepo.findDuplicate = vi.fn().mockResolvedValue({
      reference: 'RPT-2026-0142',
    } as never);

    const payload = {
      targetType: 'job' as const,
      targetId: targetJobId,
      reason: 'misleading_information' as const,
      statement: 'Details',
      idempotencyKey: 'client-key-abc',
    };

    const result = await service.submitReport(reporterId, payload);

    expect(result.reference).toBe('RPT-2026-0142');
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it('uploads evidence files to storage service and persists file metadata', async () => {
    vi.spyOn(JobPosting, 'findById').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue({
        _id: targetJobId,
        title: 'Senior Backend Engineer (Go)',
        enterprise_id: null,
      }),
    } as never);

    const mockFile = {
      originalname: 'call-notes.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('PDF content'),
      size: 2048,
    } as Express.Multer.File;

    const payload = {
      targetType: 'job' as const,
      targetId: targetJobId,
      reason: 'misleading_information' as const,
      statement: 'Details with attached PDF evidence',
    };

    await service.submitReport(reporterId, payload, [mockFile]);

    expect(mockStorage.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'call-notes.pdf',
        folder: 'italent/reports/evidence',
        resourceType: 'raw',
      }),
    );

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        evidence_files: expect.arrayContaining([
          expect.objectContaining({
            file_name: 'call-notes.pdf',
            file_url: 'https://cloudinary.com/call-notes.pdf',
            storage_key: 'evidence/call-notes',
          }),
        ]),
      }),
    );
  });

  it('submits report for enterprise target with snapshot', async () => {
    vi.spyOn(Enterprise, 'findById').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue({
        _id: enterpriseId,
        name: 'Golden Gate Recruit',
        is_deleted: false,
      }),
    } as never);

    const payload = {
      targetType: 'company' as const,
      targetId: enterpriseId,
      reason: 'scam_or_fraud' as const,
      statement: 'Company requested upfront recruitment fees.',
    };

    const result = await service.submitReport(reporterId, payload);

    expect(result.reference).toBe('RPT-2026-0142');
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        target_snapshot: {
          title: 'Golden Gate Recruit',
          subtitle: 'Company',
          enterprise_id: expect.anything(),
          enterprise_name: 'Golden Gate Recruit',
        },
      }),
    );
  });

  it('submits report for user target with snapshot', async () => {
    const targetUserId = '507f1f77bcf86cd799439044';
    vi.spyOn(User, 'findById').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue({
        _id: targetUserId,
        full_name: 'Recruiter at Pixel Labs',
        role: 'recruiter',
        status: 'active',
      }),
    } as never);

    const payload = {
      targetType: 'user' as const,
      targetId: targetUserId,
      reason: 'inappropriate_content' as const,
      statement: 'Received inappropriate messages.',
    };

    const result = await service.submitReport(reporterId, payload);

    expect(result.reference).toBe('RPT-2026-0142');
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        target_snapshot: {
          title: 'Recruiter at Pixel Labs',
          subtitle: 'Recruiter',
          enterprise_id: null,
          enterprise_name: null,
        },
      }),
    );
  });
});
