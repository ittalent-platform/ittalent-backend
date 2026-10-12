import { describe, expect, it } from 'vitest';

import {
  createInterviewBodyValidator,
  interviewCalendarQueryValidator,
  interviewListQueryValidator,
  parseInterviewStatusFilter,
  updateInterviewBodyValidator,
  updateInterviewStatusBodySchema,
} from '../../../src/modules/interviews/interviews.schemas.js';

const APPLICATION = 'b00000000000000000000001';
const INTERVIEWER = 'a00000000000000000000002';
const validCreate = {
  applicationId: APPLICATION,
  interviewerIds: [INTERVIEWER],
  scheduledAt: '2026-10-13T10:00:00+07:00',
  mode: 'online',
  meetingLink: 'https://meet.example.com/room',
};

describe('createInterviewBodyValidator', () => {
  it('accepts a valid online interview and defaults the duration to an hour', () => {
    expect(createInterviewBodyValidator.parse(validCreate)).toMatchObject({ durationMinutes: 60, mode: 'online' });
  });

  it('accepts an onsite interview with a location', () => {
    const body = { ...validCreate, meetingLink: undefined, mode: 'onsite', location: 'Floor 5' };
    expect(createInterviewBodyValidator.safeParse(body).success).toBe(true);
  });

  it.each([
    ['an online interview without a link', { meetingLink: undefined }],
    ['an onsite interview without a location', { mode: 'onsite', meetingLink: undefined }],
    ['a link that is not https', { meetingLink: 'http://meet.example.com' }],
    ['a link that is not a URL', { meetingLink: 'not a link' }],
    ['no interviewer', { interviewerIds: [] }],
    ['a repeated interviewer', { interviewerIds: [INTERVIEWER, INTERVIEWER] }],
    ['more interviewers than allowed', { interviewerIds: Array.from({ length: 11 }, (_v, index) => `a0000000000000000000000${index.toString(16)}`.padEnd(24, '0')) }],
    ['a malformed interviewer id', { interviewerIds: ['nope'] }],
    ['a malformed application id', { applicationId: 'nope' }],
    ['a time without an offset', { scheduledAt: '2026-10-13T10:00:00' }],
    ['a date that is not a date', { scheduledAt: 'tomorrow' }],
    ['a duration below the minimum', { durationMinutes: 5 }],
    ['a duration above the maximum', { durationMinutes: 481 }],
    ['a fractional duration', { durationMinutes: 30.5 }],
    ['an unknown mode', { mode: 'phone' }],
    ['a field the client may not set', { status: 'completed' }],
    ['empty notes', { notes: '   ' }],
  ])('rejects %s', (_label, overrides) => {
    expect(createInterviewBodyValidator.safeParse({ ...validCreate, ...overrides }).success).toBe(false);
  });
});

describe('updateInterviewBodyValidator', () => {
  it('accepts a partial update and null to clear a field', () => {
    expect(updateInterviewBodyValidator.safeParse({ notes: 'x' }).success).toBe(true);
    expect(updateInterviewBodyValidator.safeParse({ meetingLink: null, location: 'Floor 5', mode: 'onsite' }).success).toBe(true);
  });

  it.each([
    ['an empty body', {}],
    ['only undefined values', { notes: undefined }],
    ['the application', { applicationId: APPLICATION }],
    ['the status', { status: 'completed' }],
    ['an http link', { meetingLink: 'http://x.example.com' }],
    ['no interviewer', { interviewerIds: [] }],
  ])('rejects %s', (_label, body) => {
    expect(updateInterviewBodyValidator.safeParse(body).success).toBe(false);
  });
});

describe('updateInterviewStatusBodySchema', () => {
  it.each(['completed', 'cancelled', 'no_show'])('accepts %s', (status) => {
    expect(updateInterviewStatusBodySchema.safeParse({ status }).success).toBe(true);
  });

  it.each(['scheduled', 'done', ''])('rejects %s', (status) => {
    expect(updateInterviewStatusBodySchema.safeParse({ status }).success).toBe(false);
  });

  it('limits the note', () => {
    expect(updateInterviewStatusBodySchema.safeParse({ status: 'cancelled', note: 'x'.repeat(501) }).success).toBe(false);
    expect(updateInterviewStatusBodySchema.safeParse({ status: 'cancelled', note: 'Role closed' }).success).toBe(true);
  });
});

describe('interviewListQueryValidator', () => {
  it('applies the defaults', () => {
    expect(interviewListQueryValidator.parse({})).toEqual({ page: 1, limit: 20, sortBy: 'scheduledAt', sortOrder: 'asc' });
  });

  it('parses the filters from a query string', () => {
    const parsed = interviewListQueryValidator.parse({
      page: '2',
      limit: '5',
      status: 'scheduled,completed',
      mode: 'online',
      search: '  nguyen ',
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-31T00:00:00.000Z',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    expect(parsed).toMatchObject({ page: 2, limit: 5, search: 'nguyen', sortBy: 'createdAt', sortOrder: 'desc' });
    expect(parsed.from).toBeInstanceOf(Date);
    expect(parseInterviewStatusFilter(parsed.status ?? '')).toEqual(['scheduled', 'completed']);
  });

  it.each([
    ['an unsupported status', { status: 'archived' }],
    ['a status list with an unsupported item', { status: 'scheduled,archived' }],
    ['an unsupported sort field', { sortBy: 'company' }],
    ['an unsupported sort order', { sortOrder: 'sideways' }],
    ['page zero', { page: '0' }],
    ['an oversized limit', { limit: '1000' }],
    ['a blank keyword', { search: '   ' }],
    ['a keyword over 100 characters', { search: 'x'.repeat(101) }],
    ['a malformed job id', { jobId: 'abc' }],
    ['an unsupported filter', { company: 'Nova' }],
    ['a date that is not a date', { from: 'soon' }],
    ['from after to', { from: '2026-10-31T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' }],
  ])('rejects %s', (_label, query) => {
    expect(interviewListQueryValidator.safeParse(query).success).toBe(false);
  });
});

describe('interviewCalendarQueryValidator', () => {
  const window = { from: '2026-10-01T00:00:00.000Z', to: '2026-10-31T00:00:00.000Z' };

  it('accepts a window with filters', () => {
    expect(interviewCalendarQueryValidator.safeParse({ ...window, status: 'scheduled', mode: 'onsite' }).success).toBe(true);
  });

  it('accepts a window of exactly 62 days and rejects a longer one', () => {
    expect(interviewCalendarQueryValidator.safeParse({ from: '2026-10-01T00:00:00.000Z', to: '2026-12-02T00:00:00.000Z' }).success).toBe(true);
    expect(interviewCalendarQueryValidator.safeParse({ from: '2026-10-01T00:00:00.000Z', to: '2026-12-02T00:00:00.001Z' }).success).toBe(false);
  });

  it.each([
    ['no window', {}],
    ['no start', { to: window.to }],
    ['no end', { from: window.from }],
    ['from after to', { from: window.to, to: window.from }],
    ['paging, which the calendar does not use', { ...window, page: '1' }],
  ])('rejects %s', (_label, query) => {
    expect(interviewCalendarQueryValidator.safeParse(query).success).toBe(false);
  });
});
