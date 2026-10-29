import { describe, expect, it } from 'vitest';

import { createPortfolioLinkSchema, deletePortfolioLinkQuerySchema, portfolioLinkListQuerySchema, updatePortfolioLinkSchema } from '../../../src/modules/portfolio-links/portfolio-links.schemas.js';

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

  it('accepts a partial update with the expected version, and a null, empty or blank description to remove it', () => {
    expect(updatePortfolioLinkSchema.parse({ expectedVersion: 2, title: ' New ' })).toEqual({ expectedVersion: 2, title: 'New' });
    expect(updatePortfolioLinkSchema.parse({ expectedVersion: 1, url: 'https://me.example/new' })).toEqual({ expectedVersion: 1, url: 'https://me.example/new' });
    expect(updatePortfolioLinkSchema.parse({ expectedVersion: 1, description: null })).toEqual({ expectedVersion: 1, description: null });
    // A form that clears the field sends "" (or spaces): the same as null, and it counts as a change.
    for (const description of ['', '   ']) {
      expect(updatePortfolioLinkSchema.parse({ expectedVersion: 1, description })).toEqual({ expectedVersion: 1, description: null });
    }
    expect(updatePortfolioLinkSchema.parse({ expectedVersion: 1, description: ' Notes ' })).toEqual({ expectedVersion: 1, description: 'Notes' });
  });

  it('rejects an update without a version or any change, with an unsafe URL, a blank field or unknown keys', () => {
    for (const body of [
      { title: 'New' },
      { expectedVersion: 0, title: 'New' },
      { expectedVersion: 1 },
      { expectedVersion: 1, url: 'javascript:alert(1)' },
      { expectedVersion: 1, title: '   ' },
      { expectedVersion: 1, description: 'x'.repeat(1001) },
      { expectedVersion: 1, title: 'New', owner_id: 'x' },
    ]) {
      expect(updatePortfolioLinkSchema.safeParse(body).success).toBe(false);
    }
  });

  it('trims the search keyword and rejects an empty or over-long one', () => {
    expect(portfolioLinkListQuerySchema.parse({ keyword: '  react ' })).toMatchObject({ keyword: 'react' });
    expect(portfolioLinkListQuerySchema.safeParse({ keyword: '   ' }).success).toBe(false);
    expect(portfolioLinkListQuerySchema.safeParse({ keyword: 'x'.repeat(101) }).success).toBe(false);
  });
});
