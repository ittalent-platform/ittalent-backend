import { describe, expect, it } from 'vitest';

import { DASHBOARD_MESSAGES } from '../../../src/modules/dashboard/dashboard.constants.js';
import { companyDashboardQueryValidator } from '../../../src/modules/dashboard/dashboard.schemas.js';

function issues(input: unknown): string[] {
  const result = companyDashboardQueryValidator.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('companyDashboardQueryValidator', () => {
  it('defaults to the last 30 days', () => {
    expect(companyDashboardQueryValidator.parse({})).toEqual({ range: 'last_30_days' });
  });

  it.each(['last_7_days', 'last_30_days', 'last_90_days', 'this_month'])('accepts the %s preset', (range) => {
    expect(companyDashboardQueryValidator.parse({ range })).toEqual({ range });
  });

  it('accepts a custom range, including a single day and dates in the future', () => {
    expect(companyDashboardQueryValidator.parse({ range: 'custom', from: '2026-09-01', to: '2026-09-30' })).toEqual({
      range: 'custom',
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(issues({ range: 'custom', from: '2026-09-15', to: '2026-09-15' })).toEqual([]);
    expect(issues({ range: 'custom', from: '2031-01-01', to: '2031-01-31' })).toEqual([]);
  });

  it('accepts exactly 366 days and refuses one more', () => {
    expect(issues({ range: 'custom', from: '2026-01-01', to: '2027-01-01' })).toEqual([]);
    expect(issues({ range: 'custom', from: '2026-01-01', to: '2027-01-02' })).toEqual([DASHBOARD_MESSAGES.RANGE_TOO_LONG]);
  });

  it('refuses a custom range without both dates', () => {
    expect(issues({ range: 'custom' })).toEqual([DASHBOARD_MESSAGES.CUSTOM_RANGE_NEEDS_DATES]);
    expect(issues({ range: 'custom', from: '2026-09-01' })).toEqual([DASHBOARD_MESSAGES.CUSTOM_RANGE_NEEDS_DATES]);
    expect(issues({ range: 'custom', to: '2026-09-01' })).toEqual([DASHBOARD_MESSAGES.CUSTOM_RANGE_NEEDS_DATES]);
  });

  it('refuses "to" before "from"', () => {
    expect(issues({ range: 'custom', from: '2026-09-30', to: '2026-09-01' })).toEqual([DASHBOARD_MESSAGES.END_BEFORE_START]);
  });

  it('refuses dates on a preset', () => {
    expect(issues({ range: 'last_7_days', from: '2026-09-01', to: '2026-09-07' })).toEqual([DASHBOARD_MESSAGES.DATES_ONLY_FOR_CUSTOM]);
    expect(issues({ from: '2026-09-01' })).toEqual([DASHBOARD_MESSAGES.DATES_ONLY_FOR_CUSTOM]);
  });

  it.each(['2026-02-30', '2026-13-01', '01/09/2026', '2026-9-1', '', 'yesterday'])('refuses the date %j', (date) => {
    expect(issues({ range: 'custom', from: date, to: '2026-09-30' })).not.toEqual([]);
  });

  it('refuses an unknown range and any key that is not part of the contract', () => {
    expect(issues({ range: 'last_year' })).not.toEqual([]);
    // A company id must never be accepted: the company always comes from the account.
    expect(issues({ range: 'last_7_days', enterpriseId: '507f1f77bcf86cd799439011' })).not.toEqual([]);
    expect(issues({ tz: 'Europe/Paris' })).not.toEqual([]);
  });
});
