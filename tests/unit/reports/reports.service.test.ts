import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JobPosting } from '../../../src/models/job-posting.model.js';
import { User } from '../../../src/models/user.model.js';
import { notificationsService } from '../../../src/modules/notifications/notifications.service.js';
import { REPORT_MESSAGES } from '../../../src/modules/reports/reports.constants.js';
import type { ReportsRepository } from '../../../src/modules/reports/reports.repository.js';
import { ReportsService } from '../../../src/modules/reports/reports.service.js';

describe('ReportsService (UC-30 to UC-36)', () => {
  let mockRepository: {
    generateTicketId: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findReporterReportById: ReturnType<typeof vi.fn>;
    findActivePendingByTarget: ReturnType<typeof vi.fn>;
    findReporterReports: ReturnType<typeof vi.fn>;
    findAdminReports: ReturnType<typeof vi.fn>;
    withdrawReport: ReturnType<typeof vi.fn>;
    softDeleteByReporter: ReturnType<typeof vi.fn>;
    claimTicket: ReturnType<typeof vi.fn>;
    resolveTicket: ReturnType<typeof vi.fn>;
  };
  let service: ReportsService;

  const reporterId = new Types.ObjectId().toString();
  const targetJobId = new Types.ObjectId().toString();
  const targetEnterpriseId = new Types.ObjectId().toString();
  const adminId = new Types.ObjectId().toString();

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepository = {
      generateTicketId: vi.fn().mockReturnValue('REP-2026-1042'),
      create: vi.fn(),
      findById: vi.fn(),
      findReporterReportById: vi.fn(),
      findActivePendingByTarget: vi.fn().mockResolvedValue(null),
      findReporterReports: vi.fn(),
      findAdminReports: vi.fn(),
      withdrawReport: vi.fn(),
      softDeleteByReporter: vi.fn(),
      claimTicket: vi.fn(),
      resolveTicket: vi.fn(),
    };

    service = new ReportsService(mockRepository as unknown as ReportsRepository);

    // Mock dispatch notifications
    vi.spyOn(notificationsService, 'dispatch').mockResolvedValue({} as never);
  });

  describe('UC-30: createReport', () => {
    it('creates a job report successfully', async () => {
      vi.spyOn(User, 'findById').mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          _id: new Types.ObjectId(reporterId),
          email: 'reporter@test.com',
          enterprise_id: null,
        }),
      } as never);

      vi.spyOn(JobPosting, 'findById').mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          _id: new Types.ObjectId(targetJobId),
          title: 'Senior Node.js Engineer',
          slug: 'senior-nodejs-engineer-1',
          posted_by_user_id: new Types.ObjectId(),
          enterprise_id: new Types.ObjectId(),
        }),
      } as never);

      const createdDoc = {
        _id: new Types.ObjectId(),
        ticket_id: 'REP-2026-1042',
        reporter_id: new Types.ObjectId(reporterId),
        target_type: 'job',
        target_id: new Types.ObjectId(targetJobId),
        target_title: 'Senior Node.js Engineer',
        target_link: '/career/senior-nodejs-engineer-1',
        reason_category: 'scam_fraud',
        title: 'Fee extortion observed',
        description: 'Recruiter asked for 500k registration fee via Zalo.',
        evidence_files: ['https://example.com/proof.png'],
        is_anonymous: true,
        status: 'pending',
        timeline: [{ status: 'pending', timestamp: new Date() }],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRepository.create.mockResolvedValue(createdDoc);

      const result = await service.createReport(reporterId, {
        target_type: 'job',
        target_id: targetJobId,
        reason_category: 'scam_fraud',
        title: 'Fee extortion observed',
        description: 'Recruiter asked for 500k registration fee via Zalo.',
        evidence_files: ['https://example.com/proof.png'],
        is_anonymous: true,
      });

      expect(result.ticket_id).toBe('REP-2026-1042');
      expect(result.target_title).toBe('Senior Node.js Engineer');
      expect(notificationsService.dispatch).toHaveBeenCalledTimes(1);
    });

    it('rejects self-report when reporting own user profile (BR-REP-01)', async () => {
      vi.spyOn(User, 'findById').mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          _id: new Types.ObjectId(reporterId),
        }),
      } as never);

      await expect(
        service.createReport(reporterId, {
          target_type: 'user',
          target_id: reporterId, // self
          reason_category: 'other',
          title: 'Testing self report',
          description: 'Attempting to report own account profile.',
          evidence_files: [],
          is_anonymous: false,
        }),
      ).rejects.toThrow(REPORT_MESSAGES.SELF_REPORT_FORBIDDEN);
    });

    it('rejects self-report when reporting own posted job (BR-REP-01)', async () => {
      vi.spyOn(User, 'findById').mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          _id: new Types.ObjectId(reporterId),
          enterprise_id: new Types.ObjectId(targetEnterpriseId),
        }),
      } as never);

      vi.spyOn(JobPosting, 'findById').mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          _id: new Types.ObjectId(targetJobId),
          title: 'Lead Architect',
          posted_by_user_id: new Types.ObjectId(reporterId), // same user!
          enterprise_id: new Types.ObjectId(targetEnterpriseId),
        }),
      } as never);

      await expect(
        service.createReport(reporterId, {
          target_type: 'job',
          target_id: targetJobId,
          reason_category: 'misleading_info',
          title: 'Own job report attempt',
          description: 'Trying to report my own job posting.',
          evidence_files: [],
          is_anonymous: false,
        }),
      ).rejects.toThrow(REPORT_MESSAGES.SELF_REPORT_FORBIDDEN);
    });

    it('rejects duplicate pending report within 24h (BR-REP-02)', async () => {
      vi.spyOn(User, 'findById').mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          _id: new Types.ObjectId(reporterId),
          enterprise_id: null,
        }),
      } as never);

      vi.spyOn(JobPosting, 'findById').mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          _id: new Types.ObjectId(targetJobId),
          title: 'React Dev',
          posted_by_user_id: new Types.ObjectId(),
        }),
      } as never);

      mockRepository.findActivePendingByTarget.mockResolvedValue({ _id: new Types.ObjectId() });

      await expect(
        service.createReport(reporterId, {
          target_type: 'job',
          target_id: targetJobId,
          reason_category: 'scam_fraud',
          title: 'Duplicate pending attempt',
          description: 'Reporting again within 24 hours of first pending submission.',
          evidence_files: [],
          is_anonymous: false,
        }),
      ).rejects.toThrow(REPORT_MESSAGES.DUPLICATE_PENDING);
    });
  });

  describe('UC-31: listReporterReports', () => {
    it('returns paginated reports and summary KPIs for authenticated reporter', async () => {
      const items = [
        {
          _id: new Types.ObjectId(),
          ticket_id: 'REP-2026-1001',
          target_type: 'job',
          target_id: new Types.ObjectId(),
          target_title: 'Backend Dev',
          reason_category: 'scam_fraud',
          title: 'Fee fraud',
          description: 'Detailed description of fee fraud violation.',
          evidence_files: [],
          is_anonymous: true,
          status: 'pending',
          timeline: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockRepository.findReporterReports.mockResolvedValue({
        items,
        total: 1,
        kpis: {
          total: 1,
          pending: 1,
          reviewing: 0,
          resolved: 0,
          rejected: 0,
          withdrawn: 0,
        },
      });

      const result = await service.listReporterReports(reporterId, {
        page: 1,
        limit: 10,
        status: 'all',
      });

      expect(result.items.length).toBe(1);
      expect(result.kpis.pending).toBe(1);
      expect(result.total).toBe(1);
    });
  });

  describe('UC-32: getReporterReportDetail', () => {
    it('returns report detail and strips internal admin notes', async () => {
      mockRepository.findReporterReportById.mockResolvedValue({
        _id: new Types.ObjectId(),
        ticket_id: 'REP-2026-1042',
        target_type: 'job',
        target_id: new Types.ObjectId(),
        target_title: 'Frontend Lead',
        reason_category: 'offensive_content',
        title: 'Offensive language in description',
        description: 'Contains discriminatory statements against junior developers.',
        evidence_files: [],
        is_anonymous: true,
        status: 'resolved',
        resolution_decision: 'resolved',
        action_taken: 'content_takedown',
        message_to_reporter: 'We have taken down this listing.',
        internal_notes: 'INTERNAL SECRET ADMIN NOTE', // must not appear in reporter DTO
        timeline: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.getReporterReportDetail(reporterId, 'REP-2026-1042');
      expect(result.ticket_id).toBe('REP-2026-1042');
      expect((result as unknown as Record<string, unknown>).internal_notes).toBeUndefined();
      expect(result.message_to_reporter).toBe('We have taken down this listing.');
    });

    it('throws 404 when report not found or does not belong to user', async () => {
      mockRepository.findReporterReportById.mockResolvedValue(null);
      await expect(service.getReporterReportDetail(reporterId, 'invalid-id')).rejects.toThrow(
        REPORT_MESSAGES.NOT_FOUND,
      );
    });
  });

  describe('UC-33: withdrawReport', () => {
    it('successfully withdraws a pending report (BR-REP-08)', async () => {
      const pendingDoc = {
        _id: new Types.ObjectId(),
        ticket_id: 'REP-2026-1042',
        status: 'pending',
        target_type: 'job',
        target_id: new Types.ObjectId(),
        target_title: 'Job 1',
        reason_category: 'other',
        title: 'Test report',
        description: 'Description of test report for withdrawal.',
        evidence_files: [],
        is_anonymous: true,
        timeline: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRepository.findReporterReportById.mockResolvedValue(pendingDoc);
      mockRepository.withdrawReport.mockResolvedValue({
        ...pendingDoc,
        status: 'withdrawn',
        withdrawal_reason: 'Submitted by mistake',
        withdrawn_at: new Date(),
      });

      const result = await service.withdrawReport(reporterId, 'REP-2026-1042', {
        withdrawal_reason: 'Submitted by mistake',
      });

      expect(result.message).toBe(REPORT_MESSAGES.WITHDRAWN);
      expect(result.report.status).toBe('withdrawn');
    });

    it('rejects withdrawal if status is not pending (BR-REP-08)', async () => {
      mockRepository.findReporterReportById.mockResolvedValue({
        _id: new Types.ObjectId(),
        status: 'reviewing', // already under investigation!
      });

      await expect(
        service.withdrawReport(reporterId, 'some-id', { withdrawal_reason: 'test' }),
      ).rejects.toThrow(REPORT_MESSAGES.NOT_PENDING_CANNOT_WITHDRAW);
    });
  });

  describe('UC-34: deleteReporterReport', () => {
    it('allows soft-deletion of terminal reports (BR-REP-10 & BR-REP-11)', async () => {
      mockRepository.findReporterReportById.mockResolvedValue({
        _id: new Types.ObjectId(),
        status: 'resolved',
      });
      mockRepository.softDeleteByReporter.mockResolvedValue({});

      const result = await service.deleteReporterReport(reporterId, 'some-id');
      expect(result.success).toBe(true);
      expect(mockRepository.softDeleteByReporter).toHaveBeenCalled();
    });

    it('rejects deletion of active pending or reviewing reports (BR-REP-10)', async () => {
      mockRepository.findReporterReportById.mockResolvedValue({
        _id: new Types.ObjectId(),
        status: 'pending',
      });

      await expect(service.deleteReporterReport(reporterId, 'some-id')).rejects.toThrow(
        REPORT_MESSAGES.NOT_TERMINAL_CANNOT_DELETE,
      );
    });
  });

  describe('UC-35 & UC-36: Admin Review & Resolution', () => {
    it('claims a pending ticket and assigns to administrator', async () => {
      const pendingDoc = {
        _id: new Types.ObjectId(),
        ticket_id: 'REP-2026-1042',
        status: 'pending',
        target_type: 'job',
        target_id: new Types.ObjectId(),
        target_title: 'Job 1',
        reason_category: 'scam_fraud',
        title: 'Test',
        description: 'Test description text for claiming ticket.',
        evidence_files: [],
        is_anonymous: false,
        timeline: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRepository.findById.mockResolvedValue(pendingDoc);
      mockRepository.claimTicket.mockResolvedValue({
        ...pendingDoc,
        status: 'reviewing',
        assigned_admin_id: new Types.ObjectId(adminId),
      });

      const result = await service.claimTicket(adminId, 'REP-2026-1042');
      expect(result.status).toBe('reviewing');
      expect(mockRepository.claimTicket).toHaveBeenCalled();
    });

    it('resolves a report ticket with atomic content takedown (BR-ADM-REP-04)', async () => {
      const reviewingDoc = {
        _id: new Types.ObjectId(),
        ticket_id: 'REP-2026-1042',
        reporter_id: new Types.ObjectId(reporterId),
        status: 'reviewing',
        target_type: 'job',
        target_id: new Types.ObjectId(targetJobId),
        target_title: 'Scam Post',
        reason_category: 'scam_fraud',
        title: 'Fee Extortion',
        description: 'Recruiter asked for 500k registration fee.',
        evidence_files: [],
        is_anonymous: false,
        timeline: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRepository.findById.mockResolvedValue(reviewingDoc);
      mockRepository.resolveTicket.mockResolvedValue({
        ...reviewingDoc,
        status: 'resolved',
        resolution_decision: 'resolved',
        action_taken: 'content_takedown',
        internal_notes: 'Confirmed scam receipts.',
        message_to_reporter: 'Job removed.',
      });

      const jobPostingSpy = vi
        .spyOn(JobPosting, 'findByIdAndUpdate')
        .mockReturnValue({ exec: vi.fn().mockResolvedValue({}) } as never);

      const result = await service.resolveTicket(adminId, 'REP-2026-1042', {
        decision: 'resolved',
        action_taken: 'content_takedown',
        internal_notes: 'Confirmed scam receipts.',
        message_to_reporter: 'Job removed.',
      });

      expect(result.message).toBe(REPORT_MESSAGES.RESOLVED);
      expect(jobPostingSpy).toHaveBeenCalled();
      expect(notificationsService.dispatch).toHaveBeenCalledTimes(1);
    });

    it('rejects modification if ticket is already in terminal state (BR-ADM-REP-06)', async () => {
      mockRepository.findById.mockResolvedValue({
        _id: new Types.ObjectId(),
        status: 'resolved', // already finalized!
      });

      await expect(
        service.resolveTicket(adminId, 'REP-2026-1042', {
          decision: 'rejected',
          internal_notes: 'Trying to re-resolve.',
          message_to_reporter: 'Should fail.',
        }),
      ).rejects.toThrow(REPORT_MESSAGES.ALREADY_RESOLVED);
    });
  });
});
