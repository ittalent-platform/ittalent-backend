import { describe, expect, it } from 'vitest';

import {
  createEnterpriseBodySchema,
  enterpriseListQuerySchema,
  updateEnterpriseStatusBodySchema,
} from '../../../src/modules/enterprises/enterprises.schemas.js';

describe('Enterprise Schemas', () => {
  describe('createEnterpriseBodySchema', () => {
    const validPayload = {
      name: 'Tech Global Corp',
      legal_name: 'Tech Global Corporation Vietnam Ltd.',
      tax_code: '0101234567',
      registration_number: 'B2023-0988',
      email: 'contact@techglobal.com',
      phone: '+842838123456',
      website: 'https://techglobal.com',
      industry: 'Information Technology',
      sub_industries: ['Software Development', 'Cloud Services'],
      company_size: '51-200',
      company_type: 'Product',
      founded_year: 2018,
      address: {
        street: '123 Innovation Street',
        city: 'Ho Chi Minh City',
        district: 'District 1',
        state_province: 'Ho Chi Minh',
        country: 'Vietnam',
        postal_code: '70000',
      },
      branches: [
        {
          street: '456 Tech Park',
          city: 'Da Nang',
          country: 'Vietnam',
        },
      ],
      logo_url: 'https://cdn.example.com/logo.png',
      cover_url: 'https://cdn.example.com/cover.png',
      short_description: 'Pioneering next-generation enterprise AI solutions.',
      description: 'Tech Global is a leading software company specializing in cloud native architectures.',
      culture_summary: 'Open, transparent, and continuous learning environment.',
      benefits: ['13th month salary', 'Premium healthcare', 'MacBook Pro provided'],
      tech_stack: ['TypeScript', 'Node.js', 'React', 'MongoDB', 'Docker', 'AWS'],
      social_links: {
        linkedin: 'https://linkedin.com/company/techglobal',
        github: 'https://github.com/techglobal',
      },
      working_days: 'Monday - Friday (8:30 - 17:30)',
      media_gallery: ['https://cdn.example.com/office1.jpg'],
    };

    it('passes validation with a complete valid international payload', () => {
      const result = createEnterpriseBodySchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('passes validation with minimal required fields', () => {
      const minimalPayload = {
        name: 'Tech Corp',
        tax_code: '0123456789',
        email: 'jobs@techcorp.io',
        phone: '0987654321',
        industry: 'IT Services',
        company_size: '11-50',
        address: {
          street: '12 Le Loi',
          city: 'Hanoi',
          country: 'Vietnam',
        },
      };

      const result = createEnterpriseBodySchema.safeParse(minimalPayload);
      expect(result.success).toBe(true);
    });

    it('fails when tax_code does not match 10-13 numeric digits', () => {
      const invalidTaxPayload = {
        ...validPayload,
        tax_code: '12345', // only 5 digits
      };

      const result = createEnterpriseBodySchema.safeParse(invalidTaxPayload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('Tax code must be 10 to 13');
      }
    });

    it('fails when email is invalid format', () => {
      const invalidEmailPayload = {
        ...validPayload,
        email: 'invalid-email-string',
      };

      const result = createEnterpriseBodySchema.safeParse(invalidEmailPayload);
      expect(result.success).toBe(false);
    });

    it('fails when company_size is invalid enum value', () => {
      const invalidSizePayload = {
        ...validPayload,
        company_size: 'massive',
      };

      const result = createEnterpriseBodySchema.safeParse(invalidSizePayload);
      expect(result.success).toBe(false);
    });

    it('fails when founded_year is in the future', () => {
      const futureYear = new Date().getFullYear() + 5;
      const invalidYearPayload = {
        ...validPayload,
        founded_year: futureYear,
      };

      const result = createEnterpriseBodySchema.safeParse(invalidYearPayload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('future');
      }
    });
  });

  describe('updateEnterpriseStatusBodySchema', () => {
    it('passes for active status without reason', () => {
      const result = updateEnterpriseStatusBodySchema.safeParse({
        status: 'active',
      });
      expect(result.success).toBe(true);
    });

    it('passes for suspended status with a valid reason (>= 10 chars)', () => {
      const result = updateEnterpriseStatusBodySchema.safeParse({
        status: 'suspended',
        reason: 'Violation of recruitment terms and spam job postings',
      });
      expect(result.success).toBe(true);
    });

    it('fails for suspended status without reason', () => {
      const result = updateEnterpriseStatusBodySchema.safeParse({
        status: 'suspended',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('at least 10 characters');
      }
    });

    it('fails for rejected status with reason under 10 chars', () => {
      const result = updateEnterpriseStatusBodySchema.safeParse({
        status: 'rejected',
        reason: 'Too short',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('at least 10 characters');
      }
    });
  });

  describe('enterpriseListQuerySchema', () => {
    it('parses valid query parameters', () => {
      const query = {
        page: 2,
        limit: 20,
        keyword: 'Fintech',
        industry: 'Information Technology',
        location: 'Ho Chi Minh City',
        company_size: '51-200',
        status: 'active',
      };

      const result = enterpriseListQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(20);
        expect(result.data.keyword).toBe('Fintech');
      }
    });

    it('rejects unsupported unexpected query parameters (strictObject)', () => {
      const query = {
        page: 1,
        limit: 10,
        unsupportedParam: 'injection',
      };

      const result = enterpriseListQuerySchema.safeParse(query);
      expect(result.success).toBe(false);
    });
  });
});
