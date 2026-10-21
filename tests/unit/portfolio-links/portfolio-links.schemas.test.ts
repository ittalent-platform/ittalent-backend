import { describe, expect, it } from 'vitest';

import { createPortfolioLinkSchema, deletePortfolioLinkQuerySchema, portfolioLinkListQuerySchema } from '../../../src/modules/portfolio-links/portfolio-links.schemas.js';

describe('portfolio link schemas', () => {
  it('accepts a safe external HTTPS link with an optional description', () => {
    expect(createPortfolioLinkSchema.parse({ title: ' My site ', url: 'https://me.example/work', description: ' Projects ' }))
      .toEqual({ title: 'My site', url: 'https://me.example/work', description: 'Projects' });
    expect(createPortfolioLinkSchema.safeParse({ title: 'Site', url: 'https://me.example' }).success).toBe(true);
  });

  it.each(['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'https://user:pass@me.example', 'http://localhost:3000', 'https://10.0.0.1/x', 'ftp://me.example'])(
    'rejects the unsafe URL %s',
    (url) => {
      expect(createPortfolioLinkSchema.safeParse({ title: 'Site', url }).success).toBe(false);
    },
  );

  it('rejects an empty title, an over-long field and unknown keys', () => {
    expect(createPortfolioLinkSchema.safeParse({ title: '   ', url: 'https://me.example' }).success).toBe(false);
    expect(createPortfolioLinkSchema.safeParse({ title: 'x'.repeat(201), url: 'https://me.example' }).success).toBe(false);
    expect(createPortfolioLinkSchema.safeParse({ title: 'Site', url: 'https://me.example', extra: 1 }).success).toBe(false);
  });

  it('requires a positive expected version to delete and applies pagination defaults', () => {
    expect(deletePortfolioLinkQuerySchema.parse({ expectedVersion: '2' })).toEqual({ expectedVersion: 2 });
    expect(deletePortfolioLinkQuerySchema.safeParse({}).success).toBe(false);
    expect(deletePortfolioLinkQuerySchema.safeParse({ expectedVersion: '0' }).success).toBe(false);
    expect(portfolioLinkListQuerySchema.parse({})).toMatchObject({ page: 1, limit: 20 });
    expect(portfolioLinkListQuerySchema.safeParse({ search: 'x' }).success).toBe(false);
  });
});
