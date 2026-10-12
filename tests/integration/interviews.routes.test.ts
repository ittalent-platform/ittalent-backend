import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../../src/app.js';
import { HTTP_STATUS } from '../../src/shared/constants/http-status.js';

const ID = '507f1f77bcf86cd799439011';
const APPLICATION = '507f1f77bcf86cd799439012';
const INTERVIEWER = '507f1f77bcf86cd799439013';

// Only requests that are decided before any data is read (auth, role, validation), so no database is needed.
describe('interviews routes (integration)', () => {
  let server: Server;
  let baseUrl: string;
  const token = (role: string): string =>
    jwt.sign({ sub: ID, email: `${role}@example.com`, role }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
  const as = (role: string): Record<string, string> => ({ Authorization: `Bearer ${token(role)}`, 'Content-Type': 'application/json' });

  const validCreate = {
    applicationId: APPLICATION,
    interviewerIds: [INTERVIEWER],
    scheduledAt: '2030-01-15T03:00:00.000Z',
    mode: 'online',
    meetingLink: 'https://meet.example.com/room',
  };

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  const send = (method: string, path: string, role?: string, body?: unknown): Promise<Response> =>
    fetch(`${baseUrl}/api/v1/interviews${path}`, {
      method,
      headers: role ? as(role) : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  describe('authentication and roles', () => {
    it.each([
      ['POST', '', validCreate],
      ['GET', '', undefined],
      ['GET', '/calendar?from=2030-01-01T00:00:00Z&to=2030-01-08T00:00:00Z', undefined],
      ['GET', '/applications', undefined],
      ['GET', '/interviewers', undefined],
      ['GET', `/${ID}`, undefined],
      ['PATCH', `/${ID}`, { notes: 'x' }],
      ['PATCH', `/${ID}/status`, { status: 'cancelled' }],
      ['PATCH', `/${ID}/reschedule-request`, { proposedDateTime: '2030-01-16T03:00:00.000Z', reason: 'Medical appointment' }],
      ['DELETE', `/${ID}`, undefined],
    ])('%s %s requires authentication', async (method, path, body) => {
      expect((await send(method, path, undefined, body)).status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
    });

    it.each([
      ['POST', '', validCreate, ['user', 'applicant', 'admin']],
      ['GET', '', undefined, ['user', 'applicant', 'admin']],
      ['GET', '/calendar?from=2030-01-01T00:00:00Z&to=2030-01-08T00:00:00Z', undefined, ['user', 'applicant', 'admin']],
      ['GET', '/applications', undefined, ['user', 'applicant', 'admin']],
      ['GET', '/interviewers', undefined, ['user', 'applicant', 'admin']],
      ['GET', `/${ID}`, undefined, ['user', 'applicant', 'admin']],
      ['PATCH', `/${ID}`, { notes: 'x' }, ['user', 'applicant', 'admin']],
      ['PATCH', `/${ID}/status`, { status: 'cancelled' }, ['user', 'applicant', 'admin']],
      ['DELETE', `/${ID}`, undefined, ['user', 'applicant', 'admin']],
    ])('%s %s is closed to the wrong roles', async (method, path, body, roles) => {
      for (const role of roles) {
        expect((await send(method, path, role, body)).status, `${method} ${path} as ${role}`).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
      }
    });

    it.each(['recruiter', 'admin', 'applicant'])('PATCH reschedule-request is closed to %s', async (role) => {
      const response = await send('PATCH', `/${ID}/reschedule-request`, role, {
        proposedDateTime: '2030-01-16T03:00:00.000Z',
        reason: 'Medical appointment',
      });
      expect(response.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    });
  });

  describe('validation', () => {
    it.each([
      ['an online interview without a link', { ...validCreate, meetingLink: undefined }],
      ['an onsite interview without a location', { ...validCreate, mode: 'onsite', meetingLink: undefined }],
      ['no interviewer', { ...validCreate, interviewerIds: [] }],
      ['a time without an offset', { ...validCreate, scheduledAt: '2030-01-15T03:00:00' }],
      ['a field the client may not set', { ...validCreate, status: 'completed' }],
    ])('POST rejects %s', async (_label, body) => {
      expect((await send('POST', '', 'recruiter', body)).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    });

    it.each([
      ['an empty update', {}],
      ['the application', { applicationId: APPLICATION }],
    ])('PATCH rejects %s', async (_label, body) => {
      expect((await send('PATCH', `/${ID}`, 'recruiter', body)).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    });

    it.each([['scheduled'], ['done']])('PATCH status rejects %s', async (status) => {
      expect((await send('PATCH', `/${ID}/status`, 'recruiter', { status })).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    });

    it.each([
      ['a missing time', { reason: 'Medical appointment' }],
      ['a time without an offset', { proposedDateTime: '2030-01-16T03:00:00', reason: 'Medical appointment' }],
      ['an empty reason', { proposedDateTime: '2030-01-16T03:00:00.000Z', reason: '  ' }],
      ['an unsupported response field', { proposedDateTime: '2030-01-16T03:00:00.000Z', reason: 'Medical appointment', response: 'accept' }],
    ])('PATCH reschedule request rejects %s', async (_label, body) => {
      expect((await send('PATCH', `/${ID}/reschedule-request`, 'user', body)).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    });

    it.each([
      ['GET', '/not-an-id'],
      ['PATCH', '/not-an-id'],
      ['PATCH', '/not-an-id/status'],
      ['PATCH', '/not-an-id/reschedule-request'],
      ['DELETE', '/not-an-id'],
    ])('%s %s rejects a malformed interview id', async (method, path) => {
      const body = path.endsWith('/status')
        ? { status: 'cancelled' }
        : path.endsWith('/reschedule-request')
          ? { proposedDateTime: '2030-01-16T03:00:00.000Z', reason: 'Medical appointment' }
          : method === 'PATCH'
            ? { notes: 'x' }
            : undefined;
      const role = path.endsWith('/reschedule-request') ? 'user' : 'recruiter';
      expect((await send(method, path, role, body)).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    });

    it.each([
      ['an unsupported status', 'status=archived'],
      ['an unsupported sort field', 'sortBy=company'],
      ['an oversized limit', 'limit=1000'],
      ['a blank keyword', 'search=%20%20'],
      ['an unsupported filter', 'company=Nova'],
      ['from after to', 'from=2030-02-01T00:00:00Z&to=2030-01-01T00:00:00Z'],
    ])('GET list rejects %s', async (_label, queryString) => {
      expect((await send('GET', `?${queryString}`, 'recruiter')).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    });

    it('serves the calendar from its own route and checks the window (it is not read as an interview id)', async () => {
      const missing = await send('GET', '/calendar', 'recruiter');
      expect(missing.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
      const tooLong = await send('GET', '/calendar?from=2030-01-01T00:00:00Z&to=2030-06-01T00:00:00Z', 'recruiter');
      expect(tooLong.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
      expect(JSON.stringify(await tooLong.json())).toContain('calendar window');
    });
  });

  describe('lookups for the Schedule dialog', () => {
    it.each([
      ['/applications', 'a limit of zero', 'limit=0'],
      ['/applications', 'an oversized limit', 'limit=1000'],
      ['/applications', 'a blank keyword', 'search=%20%20'],
      ['/applications', 'a parameter that is not supported', 'page=2'],
      ['/interviewers', 'a limit of zero', 'limit=0'],
      ['/interviewers', 'an oversized limit', 'limit=1000'],
      ['/interviewers', 'a blank keyword', 'search=%20%20'],
      ['/interviewers', 'a parameter that is not supported', 'page=2'],
    ])('GET %s rejects %s', async (path, _label, queryString) => {
      const response = await send('GET', `${path}?${queryString}`, 'recruiter');
      expect(response.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
      // Validated as a lookup query, so the path was not mistaken for an interview id.
      expect(JSON.stringify(await response.json())).not.toContain('interview ID');
    });
  });

  it('documents the interview endpoints in openapi', async () => {
    const spec = (await (await fetch(`${baseUrl}/openapi.json`)).json()) as { paths: Record<string, Record<string, unknown>> };
    expect(Object.keys(spec.paths['/api/v1/interviews'] ?? {}).sort()).toEqual(['get', 'post']);
    expect(Object.keys(spec.paths['/api/v1/interviews/calendar'] ?? {})).toEqual(['get']);
    expect(Object.keys(spec.paths['/api/v1/interviews/applications'] ?? {})).toEqual(['get']);
    expect(Object.keys(spec.paths['/api/v1/interviews/interviewers'] ?? {})).toEqual(['get']);
    expect(Object.keys(spec.paths['/api/v1/interviews/{id}'] ?? {}).sort()).toEqual(['delete', 'get', 'patch']);
    expect(Object.keys(spec.paths['/api/v1/interviews/{id}/status'] ?? {})).toEqual(['patch']);
    expect(Object.keys(spec.paths['/api/v1/interviews/{id}/reschedule-request'] ?? {})).toEqual(['patch']);
  });
});
