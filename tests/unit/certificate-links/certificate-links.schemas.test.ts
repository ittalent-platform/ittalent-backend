import { describe, expect, it } from 'vitest';
import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';

import { certificateLinkListQuerySchema, createCertificateLinkSchema, idempotencyKeySchema } from '../../../src/modules/certificate-links/certificate-links.schemas.js';
import { registry } from '../../../src/openapi/registry.js';

describe('certificate link schemas', () => {
  it('accepts a safe external HTTPS link and coherent optional metadata', () => {
    expect(createCertificateLinkSchema.safeParse({
      name: ' Certificate ',
      url: 'https://cert.example/abc',
      issuer: 'Issuer',
      issuedDate: '2026-02-28',
      expiryDate: '2027-02-28',
    }).success).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'http://localhost/cert',
    'http://service.local/cert',
    'http://127.0.0.1/cert',
    'http://192.168.1.10/cert',
    'http://[::1]/cert',
    'http://[fc00::1]/cert',
    'https://user:pass@cert.example/abc',
    'https://cert.example/abc',
  ])('rejects unsafe URL or invalid certificate date input: %s', (url) => {
    const input = { name: 'Certificate', url, issuedDate: '2025-02-29' };
    expect(createCertificateLinkSchema.safeParse(input).success).toBe(false);
  });

  it('rejects expiry earlier than issue date and unknown request fields', () => {
    expect(createCertificateLinkSchema.safeParse({ name: 'Cert', url: 'https://cert.example', issuedDate: '2026-02-01', expiryDate: '2026-01-31' }).success).toBe(false);
    expect(createCertificateLinkSchema.safeParse({ name: 'Cert', url: 'https://cert.example', ownerId: 'spoof' }).success).toBe(false);
  });

  it('validates idempotency keys and defaults stable pagination', () => {
    expect(idempotencyKeySchema.safeParse('operation-1').success).toBe(true);
    expect(idempotencyKeySchema.safeParse('bad\nkey').success).toBe(false);
    expect(certificateLinkListQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(certificateLinkListQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it('registers both certificate-link API operations in OpenAPI', () => {
    const document = new OpenApiGeneratorV3(registry.definitions).generateDocument({ openapi: '3.0.3', info: { title: 'Test', version: '1' } });
    expect(document.paths).toHaveProperty('/api/v1/me/certificate-links');
    expect(document.paths['/api/v1/me/certificate-links']).toHaveProperty('post');
    expect(document.paths['/api/v1/me/certificate-links']).toHaveProperty('get');
  });

  it('parses the selection and validity filters and rejects unknown values (UC-S4-CERT-06)', () => {
    expect(certificateLinkListQuerySchema.parse({ suggested: 'true', validity: 'expired' })).toMatchObject({ suggested: true, validity: 'expired' });
    expect(certificateLinkListQuerySchema.parse({ suggested: 'false' }).suggested).toBe(false);
    expect(certificateLinkListQuerySchema.parse({}).suggested).toBeUndefined();
    expect(certificateLinkListQuerySchema.safeParse({ validity: 'soon' }).success).toBe(false);
    expect(certificateLinkListQuerySchema.safeParse({ suggested: 'yes' }).success).toBe(false);
    expect(certificateLinkListQuerySchema.safeParse({ unknown: 'x' }).success).toBe(false);
  });
});
