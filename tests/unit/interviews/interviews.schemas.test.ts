import { describe, expect, it } from 'vitest';

import {
  createInterviewBodyValidator,
  updateInterviewBodyValidator,
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

