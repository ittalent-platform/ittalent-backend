import { describe, expect, it } from 'vitest';

import {
  parseRecruiterStatusFilter,
  recruiterApplicationListQuerySchema,
  recruiterApplicationListQueryValidator,
  recruiterApplicationSummaryDtoSchema,
  recruiterApplicationListResponseSchema,
  recruiterApplicationDetailDtoSchema,
  recruiterApplicationCvMetadataDtoSchema,
  createRecruiterNoteBodySchema,
  recruiterNotesListResponseSchema,
  updateRecruiterApplicationStatusBodySchema,
  recruiterCompanyApplicationHistoryItemDtoSchema,
  recruiterApplicantCompanyHistoryResponseSchema,
} from '../../../src/modules/applications/recruiter-applications.schemas.js';
import {
  isPermittedRecruiterTransition,
  RECRUITER_PERMITTED_TRANSITIONS,
} from '../../../src/modules/applications/applications.constants.js';

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

  describe('createRecruiterNoteBodySchema (PR 4)', () => {
    it('parses valid note content and trims whitespace', () => {
      const parsed = createRecruiterNoteBodySchema.parse({
        content: '  Strong candidate for backend team.  ',
      });
      expect(parsed.content).toBe('Strong candidate for backend team.');
    });

    it('rejects empty or whitespace-only content', () => {
      const emptyResult = createRecruiterNoteBodySchema.safeParse({ content: '' });
      expect(emptyResult.success).toBe(false);

      const whitespaceResult = createRecruiterNoteBodySchema.safeParse({ content: '   ' });
      expect(whitespaceResult.success).toBe(false);
    });

    it('rejects note content exceeding maximum length', () => {
      const tooLong = createRecruiterNoteBodySchema.safeParse({
        content: 'a'.repeat(2001),
      });
      expect(tooLong.success).toBe(false);
    });

    it('rejects unrecognized properties due to strictObject', () => {
      const extraProps = createRecruiterNoteBodySchema.safeParse({
        content: 'Valid note content',
        authorName: 'Sneaky Author',
      });
      expect(extraProps.success).toBe(false);
    });
  });

  describe('recruiterNotesListResponseSchema (PR 4)', () => {
    it('validates list response with items array and total count', () => {
      const response = {
        items: [
          {
            authorId: '507f1f77bcf86cd799439017',
            authorName: 'Recruiter Lead',
            content: 'Great cultural fit.',
            createdAt: '2026-10-13T07:00:00.000Z',
          },
        ],
        total: 1,
      };

      const parsed = recruiterNotesListResponseSchema.parse(response);
      expect(parsed.items).toHaveLength(1);
      expect(parsed.total).toBe(1);
      expect(parsed.items[0]?.authorName).toBe('Recruiter Lead');
    });

    it('validates empty notes list response', () => {
      const parsed = recruiterNotesListResponseSchema.parse({
        items: [],
        total: 0,
      });
      expect(parsed.items).toEqual([]);
      expect(parsed.total).toBe(0);
    });
  });

  describe('isPermittedRecruiterTransition (PR 5: BR-17)', () => {
    it('allows valid progressive transitions', () => {
      expect(isPermittedRecruiterTransition('submitted', 'under_review')).toBe(true);
      expect(isPermittedRecruiterTransition('under_review', 'interviewing')).toBe(true);
      expect(isPermittedRecruiterTransition('interviewing', 'offered')).toBe(true);
      expect(isPermittedRecruiterTransition('offered', 'hired')).toBe(true);
    });

    it('allows rejection from any active non-terminal status', () => {
      expect(isPermittedRecruiterTransition('submitted', 'rejected')).toBe(true);
      expect(isPermittedRecruiterTransition('under_review', 'rejected')).toBe(true);
      expect(isPermittedRecruiterTransition('interviewing', 'rejected')).toBe(true);
      expect(isPermittedRecruiterTransition('offered', 'rejected')).toBe(true);
    });

    it('disallows skipping stages or backward transitions', () => {
      expect(isPermittedRecruiterTransition('submitted', 'interviewing')).toBe(false);
      expect(isPermittedRecruiterTransition('submitted', 'hired')).toBe(false);
      expect(isPermittedRecruiterTransition('interviewing', 'under_review')).toBe(false);
      expect(isPermittedRecruiterTransition('offered', 'interviewing')).toBe(false);
    });

    it('disallows any transitions from terminal states', () => {
      expect(isPermittedRecruiterTransition('hired', 'under_review')).toBe(false);
      expect(isPermittedRecruiterTransition('rejected', 'under_review')).toBe(false);
      expect(isPermittedRecruiterTransition('withdrawn', 'under_review')).toBe(false);
      expect(isPermittedRecruiterTransition('position_filled', 'under_review')).toBe(false);
      expect(RECRUITER_PERMITTED_TRANSITIONS.hired).toEqual([]);
      expect(RECRUITER_PERMITTED_TRANSITIONS.rejected).toEqual([]);
      expect(RECRUITER_PERMITTED_TRANSITIONS.withdrawn).toEqual([]);
      expect(RECRUITER_PERMITTED_TRANSITIONS.position_filled).toEqual([]);
    });
  });

  describe('updateRecruiterApplicationStatusBodySchema (PR 5)', () => {
    it('parses valid status update request with minimal fields', () => {
      const parsed = updateRecruiterApplicationStatusBodySchema.parse({
        status: 'under_review',
      });
      expect(parsed.status).toBe('under_review');
      expect(parsed.note).toBeUndefined();
    });

    it('parses valid status update with note, candidate message, and expectedVersion', () => {
      const parsed = updateRecruiterApplicationStatusBodySchema.parse({
        status: 'interviewing',
        note: 'Candidate cleared phone screening.',
        messageToCandidate: 'Congratulations! We would like to invite you for an interview.',
        expectedVersion: 2,
      });
      expect(parsed.status).toBe('interviewing');
      expect(parsed.note).toBe('Candidate cleared phone screening.');
      expect(parsed.messageToCandidate).toBe(
        'Congratulations! We would like to invite you for an interview.',
      );
      expect(parsed.expectedVersion).toBe(2);
    });

    it('parses valid status update to rejected with rejectionReason', () => {
      const parsed = updateRecruiterApplicationStatusBodySchema.parse({
        status: 'rejected',
        rejectionReason: 'Candidate does not meet minimum technical experience requirements.',
      });
      expect(parsed.status).toBe('rejected');
      expect(parsed.rejectionReason).toBe(
        'Candidate does not meet minimum technical experience requirements.',
      );
    });

    it('rejects status values that recruiters cannot manually set', () => {
      expect(
        updateRecruiterApplicationStatusBodySchema.safeParse({ status: 'submitted' }).success,
      ).toBe(false);
      expect(
        updateRecruiterApplicationStatusBodySchema.safeParse({ status: 'withdrawn' }).success,
      ).toBe(false);
      expect(
        updateRecruiterApplicationStatusBodySchema.safeParse({ status: 'position_filled' }).success,
      ).toBe(false);
      expect(
        updateRecruiterApplicationStatusBodySchema.safeParse({ status: 'invalid_status' }).success,
      ).toBe(false);
    });

    it('rejects rejectionReason shorter than minimum length', () => {
      const result = updateRecruiterApplicationStatusBodySchema.safeParse({
        status: 'rejected',
        rejectionReason: 'Nope', // only 4 chars, min is 5
      });
      expect(result.success).toBe(false);
    });

    it('rejects note exceeding maximum length', () => {
      const result = updateRecruiterApplicationStatusBodySchema.safeParse({
        status: 'under_review',
        note: 'x'.repeat(2001),
      });
      expect(result.success).toBe(false);
    });

    it('rejects unrecognized extra fields', () => {
      const result = updateRecruiterApplicationStatusBodySchema.safeParse({
        status: 'under_review',
        unknownField: 'test',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('recruiterCompanyApplicationHistoryItemDtoSchema & recruiterApplicantCompanyHistoryResponseSchema (PR 6)', () => {
    const validItem = {
      id: '507f1f77bcf86cd799439011',
      job: {
        id: '507f1f77bcf86cd799439012',
        title: 'Senior Backend Engineer',
        location: 'Hà Nội',
        employmentType: 'Full-time',
        status: 'published',
      },
      status: 'under_review' as const,
      reviewStage: 'screening' as const,
      submittedDocuments: ['cv' as const],
      rejectionReason: null,
      withdrawalReason: null,
      notesCount: 2,
      submittedAt: '2026-10-10T10:00:00.000Z',
      latestStatusAt: '2026-10-11T14:00:00.000Z',
      isCurrentApplication: true,
    };

    it('parses valid company application history item', () => {
      const parsed = recruiterCompanyApplicationHistoryItemDtoSchema.parse(validItem);
      expect(parsed.id).toBe('507f1f77bcf86cd799439011');
      expect(parsed.job.title).toBe('Senior Backend Engineer');
      expect(parsed.isCurrentApplication).toBe(true);
      expect(parsed.notesCount).toBe(2);
    });

    it('parses complete recruiter applicant company history response', () => {
      const response = {
        applicant: {
          id: '507f1f77bcf86cd799439013',
          fullName: 'Lê Văn B',
          email: 'applicantB@example.com',
          phone: '+84987654321',
        },
        isFirstTimeApplicant: false,
        totalSubmissionsToCompany: 2,
        items: [
          validItem,
          {
            ...validItem,
            id: '507f1f77bcf86cd799439099',
            status: 'rejected' as const,
            reviewStage: 'rejected' as const,
            rejectionReason: 'Position closed before interview',
            isCurrentApplication: false,
          },
        ],
      };

      const parsed = recruiterApplicantCompanyHistoryResponseSchema.parse(response);
      expect(parsed.applicant.email).toBe('applicantB@example.com');
      expect(parsed.isFirstTimeApplicant).toBe(false);
      expect(parsed.totalSubmissionsToCompany).toBe(2);
      expect(parsed.items).toHaveLength(2);
      expect(parsed.items[1]?.isCurrentApplication).toBe(false);
      expect(parsed.items[1]?.rejectionReason).toBe('Position closed before interview');
    });

    it('parses first-time applicant response with 1 submission', () => {
      const response = {
        applicant: {
          id: '507f1f77bcf86cd799439013',
          fullName: null,
          email: 'first-time@example.com',
          phone: null,
        },
        isFirstTimeApplicant: true,
        totalSubmissionsToCompany: 1,
        items: [validItem],
      };

      const parsed = recruiterApplicantCompanyHistoryResponseSchema.parse(response);
      expect(parsed.isFirstTimeApplicant).toBe(true);
      expect(parsed.totalSubmissionsToCompany).toBe(1);
      expect(parsed.items).toHaveLength(1);
    });
  });
});



