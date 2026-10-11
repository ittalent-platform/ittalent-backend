import { describe, expect, it } from 'vitest';

import {
  adminDecisionBodySchema,
  registrationListQuerySchema,
  saveDraftBodySchema,
  startRegistrationBodySchema,
  submitRegistrationBodySchema,
  verifyEmailQuerySchema,
} from '../../../src/modules/enterprise-registrations/enterprise-registrations.schemas.js';
import {
  REGISTRATION_MESSAGES,
} from '../../../src/modules/enterprise-registrations/enterprise-registrations.constants.js';

describe('Enterprise Registration Schemas', () => {
  describe('startRegistrationBodySchema', () => {
    it('passes validation with a valid corporate email and representative info', () => {
      const payload = {
        corporate_email: 'recruitment@techcorp.vn',
        representative_name: 'Nguyen Van A',
        representative_phone: '+84901234567',
        representative_position: 'Head of HR',
      };

      const result = startRegistrationBodySchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects common consumer/personal email domains (BR-27)', () => {
      const personalEmails = [
        'applicant@gmail.com',
        'recruiter@yahoo.com',
        'admin@hotmail.com',
        'rep@outlook.com',
        'hr@icloud.com',
      ];

      for (const email of personalEmails) {
        const result = startRegistrationBodySchema.safeParse({
          corporate_email: email,
          representative_name: 'Nguyen Van A',
          representative_phone: '+84901234567',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          const emailIssue = result.error.issues.find((issue) => issue.path.includes('corporate_email'));
          expect(emailIssue?.message).toBe(REGISTRATION_MESSAGES.PERSONAL_EMAIL_REJECTED);
        }
      }
    });

    it('rejects invalid representative phone number format', () => {
      const result = startRegistrationBodySchema.safeParse({
        corporate_email: 'contact@acme.inc',
        representative_name: 'Jane Doe',
        representative_phone: '123',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('verifyEmailQuerySchema', () => {
    it('accepts tokens with at least 16 characters', () => {
      const result = verifyEmailQuerySchema.safeParse({
        token: 'abcdef1234567890abcdef',
      });
      expect(result.success).toBe(true);
    });

    it('rejects tokens shorter than 16 characters', () => {
      const result = verifyEmailQuerySchema.safeParse({
        token: 'short_token',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('saveDraftBodySchema', () => {
    it('allows partial incremental draft updates', () => {
      const result = saveDraftBodySchema.safeParse({
        representative: {
          full_name: 'Nguyen Van B',
        },
        company_data: {
          name: 'Acme Software',
          tax_code: '0109998888',
        },
        version: 1,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('submitRegistrationBodySchema', () => {
    const validSubmissionPayload = {
      representative: {
        full_name: 'Le Thi C',
        phone: '+84912345678',
        position: 'Operations Director',
      },
      company_data: {
        name: 'Tech Future Corp',
        legal_name: 'Tech Future Corporation Vietnam Ltd.',
        tax_code: '0101234567',
        registration_number: 'B2026-999',
        website: 'https://techfuture.vn',
        industry: 'Software Development',
        company_size: '51-200',
        company_type: 'Product',
        founded_year: 2020,
        address: {
          street: '12 Duy Tan',
          city: 'Hanoi',
          district: 'Cau Giay',
          country: 'Vietnam',
          postal_code: '10000',
        },
        short_description: 'Building modern enterprise solutions.',
      },
      legal_documents: [
        {
          document_type: 'business_license',
          file_name: 'giay_phep_kinh_doanh.pdf',
          file_url: 'https://cdn.example.com/docs/gpdk.pdf',
          file_size: 1048576,
        },
      ],
      version: 1,
    };

    it('passes validation with a complete submission payload', () => {
      const result = submitRegistrationBodySchema.safeParse(validSubmissionPayload);
      expect(result.success).toBe(true);
    });

    it('rejects invalid tax identification codes (must be 10 to 13 digits) (BR-39)', () => {
      const invalidTaxCodes = ['123456789', '12345678901234', '010123456A', ''];

      for (const taxCode of invalidTaxCodes) {
        const payload = {
          ...validSubmissionPayload,
          company_data: {
            ...validSubmissionPayload.company_data,
            tax_code: taxCode,
          },
        };

        const result = submitRegistrationBodySchema.safeParse(payload);
        expect(result.success).toBe(false);
      }
    });

    it('accepts 13-digit tax codes for branch offices', () => {
      const payload = {
        ...validSubmissionPayload,
        company_data: {
          ...validSubmissionPayload.company_data,
          tax_code: '0101234567001',
        },
      };

      const result = submitRegistrationBodySchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects submissions without at least one business_license document', () => {
      const payload = {
        ...validSubmissionPayload,
        legal_documents: [
          {
            document_type: 'other',
            file_name: 'intro.pdf',
            file_url: 'https://cdn.example.com/docs/intro.pdf',
          },
        ],
      };

      const result = submitRegistrationBodySchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const docIssue = result.error.issues.find((issue) => issue.path.includes('legal_documents'));
        expect(docIssue?.message).toBe(REGISTRATION_MESSAGES.MISSING_LEGAL_DOCUMENTS);
      }
    });
  });

  describe('adminDecisionBodySchema', () => {
    it('accepts approval decision when full checklist is verified', () => {
      const payload = {
        decision: 'approved',
        version: 2,
        checklist: {
          tax_code_verified: true,
          legal_representative_verified: true,
          documents_verified: true,
        },
      };

      const result = adminDecisionBodySchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects approval decision if checklist verification is incomplete', () => {
      const payload = {
        decision: 'approved',
        version: 2,
        checklist: {
          tax_code_verified: true,
          legal_representative_verified: false,
          documents_verified: true,
        },
      };

      const result = adminDecisionBodySchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const checklistIssue = result.error.issues.find((issue) => issue.path.includes('checklist'));
        expect(checklistIssue?.message).toBe(REGISTRATION_MESSAGES.CHECKLIST_INCOMPLETE);
      }
    });

    it('accepts rejection decision when explanation is at least 20 characters (BR-42)', () => {
      const payload = {
        decision: 'rejected',
        version: 1,
        rejection_reason: 'Giay phep kinh doanh da het han su dung, vui long cap nhat ban moi.',
      };

      const result = adminDecisionBodySchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects rejection decision if explanation is shorter than 20 characters (BR-42)', () => {
      const payload = {
        decision: 'rejected',
        version: 1,
        rejection_reason: 'Invalid file',
      };

      const result = adminDecisionBodySchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const reasonIssue = result.error.issues.find((issue) => issue.path.includes('rejection_reason'));
        expect(reasonIssue?.message).toBe(REGISTRATION_MESSAGES.REJECTION_REASON_REQUIRED);
      }
    });
  });

  describe('registrationListQuerySchema', () => {
    it('applies default pagination and parses query params', () => {
      const result = registrationListQuerySchema.safeParse({
        status: 'pending_review',
        search: 'Tech',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.status).toBe('pending_review');
        expect(result.data.search).toBe('Tech');
      }
    });
  });
});
