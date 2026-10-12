import { describe, expect, it } from 'vitest';

import {
  parseRecruiterStatusFilter,
  recruiterApplicationListQuerySchema,
  recruiterApplicationListQueryValidator,
  recruiterApplicationSummaryDtoSchema,
  recruiterApplicationListResponseSchema,
  recruiterApplicationDetailDtoSchema,
  recruiterApplicationCvMetadataDtoSchema,
} from '../../../src/modules/applications/recruiter-applications.schemas.js';

describe('Recruiter Applications Schemas (PR 2)', () => {
  describe('parseRecruiterStatusFilter', () => {
    it('splits and trims comma-separated statuses', () => {
      expect(
        parseRecruiterStatusFilter('submitted, under_review , interviewing'),
      ).toEqual(['submitted', 'under_review', 'interviewing']);
    });

    it('filters out empty values', () => {
      expect(parseRecruiterStatusFilter('submitted,,rejected,')).toEqual([
        'submitted',
        'rejected',
      ]);
    });
  });

  describe('recruiterApplicationListQuerySchema', () => {
    it('applies default pagination and sorting parameters', () => {
      const parsed = recruiterApplicationListQuerySchema.parse({});
      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(20);
      expect(parsed.sortBy).toBe('submittedAt');
      expect(parsed.sortOrder).toBe('desc');
    });

    it('validates status filter with valid applicationStatuses', () => {
      const result = recruiterApplicationListQuerySchema.safeParse({
        status: 'submitted,under_review,position_filled',
      });
      expect(result.success).toBe(true);
    });

    it('rejects status filter containing invalid status names', () => {
      const result = recruiterApplicationListQuerySchema.safeParse({
        status: 'submitted,not_a_valid_status',
      });
      expect(result.success).toBe(false);
    });

    it('trims search keyword and enforces max bounds', () => {
      const valid = recruiterApplicationListQuerySchema.parse({
        search: '  Fullstack Developer  ',
      });
      expect(valid.search).toBe('Fullstack Developer');

      const tooLong = recruiterApplicationListQuerySchema.safeParse({
        search: 'a'.repeat(101),
      });
      expect(tooLong.success).toBe(false);
    });

    it('validates documentType filter', () => {
      const cvValid = recruiterApplicationListQuerySchema.safeParse({
        documentType: 'cv',
      });
      expect(cvValid.success).toBe(true);

      const coverLetterValid = recruiterApplicationListQuerySchema.safeParse({
        documentType: 'cover_letter',
      });
      expect(coverLetterValid.success).toBe(true);

      const invalidType = recruiterApplicationListQuerySchema.safeParse({
        documentType: 'passport',
      });
      expect(invalidType.success).toBe(false);
    });
  });

  describe('recruiterApplicationListQueryValidator', () => {
    it('accepts valid date ordering', () => {
      const result = recruiterApplicationListQueryValidator.safeParse({
        submittedFrom: '2026-01-01',
        submittedTo: '2026-01-31',
      });
      expect(result.success).toBe(true);
    });

    it('rejects when submittedFrom is later than submittedTo', () => {
      const result = recruiterApplicationListQueryValidator.safeParse({
        submittedFrom: '2026-02-01',
        submittedTo: '2026-01-01',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          'submittedFrom must not be later than submittedTo',
        );
      }
    });
  });

  describe('recruiterApplicationSummaryDtoSchema and recruiterApplicationListResponseSchema', () => {
    const validSummary = {
      id: '507f1f77bcf86cd799439011',
      job: {
        id: '507f1f77bcf86cd799439012',
        title: 'Backend Engineer',
      },
      applicant: {
        id: '507f1f77bcf86cd799439013',
        fullName: 'Nguyễn Văn A',
        email: 'applicant@example.com',
        phone: '0901234567',
      },
      status: 'interviewing' as const,
      reviewStage: 'interview' as const,
      submittedDocuments: ['cv' as const, 'cover_letter' as const],
      nextInterview: {
        id: '507f1f77bcf86cd799439014',
        scheduledAt: '2026-10-15T09:00:00.000Z',
        mode: 'online',
      },
      notesCount: 2,
      submittedAt: '2026-10-12T10:00:00.000Z',
      latestStatusAt: '2026-10-12T11:00:00.000Z',
    };

    it('validates single application summary DTO', () => {
      const parsed = recruiterApplicationSummaryDtoSchema.parse(validSummary);
      expect(parsed.id).toBe('507f1f77bcf86cd799439011');
      expect(parsed.status).toBe('interviewing');
    });

    it('validates recruiter application list response schema with all 8 status counts', () => {
      const response = {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        items: [validSummary],
        statusCounts: {
          submitted: 0,
          under_review: 0,
          interviewing: 1,
          offered: 0,
          hired: 0,
          rejected: 0,
          withdrawn: 0,
          position_filled: 0,
        },
      };

      const parsed = recruiterApplicationListResponseSchema.parse(response);
      expect(parsed.items.length).toBe(1);
      expect(parsed.statusCounts.interviewing).toBe(1);
      expect(parsed.statusCounts.position_filled).toBe(0);
    });
  });

  describe('recruiterApplicationDetailDtoSchema (PR 3)', () => {
    const validDetail = {
      id: '507f1f77bcf86cd799439011',
      job: {
        id: '507f1f77bcf86cd799439012',
        title: 'Backend Engineer',
        location: 'Remote',
        employmentType: 'full_time',
        department: 'Engineering',
        status: 'published',
        expiresAt: '2026-12-31T23:59:59.000Z',
      },
      applicant: {
        id: '507f1f77bcf86cd799439013',
        fullName: 'Nguyễn Văn A',
        email: 'applicant@example.com',
        phone: '0901234567',
        role: 'candidate',
        status: 'active',
      },
      status: 'under_review' as const,
      reviewStage: 'screening' as const,
      message: 'Looking forward to hearing from you.',
      withdrawalReason: null,
      attachments: [
        {
          documentId: '507f1f77bcf86cd799439015',
          fileName: 'My_CV.pdf',
          type: 'cv' as const,
          size: 102400,
          mimeType: 'application/pdf',
          submittedAt: '2026-10-12T10:00:00.000Z',
        },
      ],
      interviews: [
        {
          id: '507f1f77bcf86cd799439016',
          scheduledAt: '2026-10-15T09:00:00.000Z',
          endsAt: '2026-10-15T10:00:00.000Z',
          durationMinutes: 60,
          mode: 'online' as const,
          meetingLink: 'https://meet.google.com/xyz',
          location: null,
          status: 'scheduled' as const,
          notes: 'Technical interview round 1',
        },
      ],
      notes: [
        {
          authorId: '507f1f77bcf86cd799439017',
          authorName: 'Recruiter Lead',
          content: 'Strong background in Node.js and MongoDB.',
          createdAt: '2026-10-12T11:00:00.000Z',
        },
      ],
      statusHistory: [
        {
          status: 'submitted' as const,
          reviewStage: null,
          actorRole: 'candidate',
          note: null,
          messageToCandidate: null,
          rejectionReason: null,
          occurredAt: '2026-10-12T10:00:00.000Z',
        },
        {
          status: 'under_review' as const,
          reviewStage: 'screening' as const,
          actorRole: 'recruiter',
          note: 'Moved to screening stage',
          messageToCandidate: null,
          rejectionReason: null,
          occurredAt: '2026-10-12T10:30:00.000Z',
        },
      ],
      version: 1,
      submittedAt: '2026-10-12T10:00:00.000Z',
      latestStatusAt: '2026-10-12T10:30:00.000Z',
      createdAt: '2026-10-12T10:00:00.000Z',
      updatedAt: '2026-10-12T10:30:00.000Z',
    };

    it('parses valid application detail object successfully', () => {
      const parsed = recruiterApplicationDetailDtoSchema.parse(validDetail);
      expect(parsed.id).toBe('507f1f77bcf86cd799439011');
      expect(parsed.job.title).toBe('Backend Engineer');
      expect(parsed.applicant.email).toBe('applicant@example.com');
      expect(parsed.attachments).toHaveLength(1);
      expect(parsed.interviews).toHaveLength(1);
      expect(parsed.notes).toHaveLength(1);
      expect(parsed.statusHistory).toHaveLength(2);
      expect(parsed.version).toBe(1);
    });

    it('allows nullable fields in detail object', () => {
      const detailWithNulls = {
        ...validDetail,
        job: {
          ...validDetail.job,
          location: null,
          employmentType: null,
          department: null,
          expiresAt: null,
        },
        applicant: {
          ...validDetail.applicant,
          fullName: null,
          phone: null,
        },
        reviewStage: null,
        message: null,
        interviews: [],
        notes: [],
      };

      const parsed = recruiterApplicationDetailDtoSchema.parse(detailWithNulls);
      expect(parsed.applicant.fullName).toBeNull();
      expect(parsed.job.location).toBeNull();
      expect(parsed.reviewStage).toBeNull();
      expect(parsed.interviews).toEqual([]);
    });

    it('rejects invalid status', () => {
      const invalid = {
        ...validDetail,
        status: 'invalid_status',
      };
      const result = recruiterApplicationDetailDtoSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('recruiterApplicationCvMetadataDtoSchema (PR 3)', () => {
    it('parses valid CV metadata object', () => {
      const metadata = {
        documentId: '507f1f77bcf86cd799439018',
        fileName: 'resume.pdf',
        mimeType: 'application/pdf',
        size: 204800,
        fileUrl: '/uploads/documents/resume.pdf',
      };

      const parsed = recruiterApplicationCvMetadataDtoSchema.parse(metadata);
      expect(parsed.documentId).toBe('507f1f77bcf86cd799439018');
      expect(parsed.fileName).toBe('resume.pdf');
      expect(parsed.size).toBe(204800);
    });

    it('rejects non-positive file size', () => {
      const invalid = {
        documentId: '507f1f77bcf86cd799439018',
        fileName: 'resume.pdf',
        mimeType: 'application/pdf',
        size: 0,
        fileUrl: '/uploads/documents/resume.pdf',
      };

      const result = recruiterApplicationCvMetadataDtoSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });
});

