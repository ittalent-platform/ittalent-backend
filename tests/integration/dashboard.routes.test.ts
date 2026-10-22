import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../../src/app.js';
import { HTTP_STATUS } from '../../src/shared/constants/http-status.js';

const ID = '507f1f77bcf86cd799439011';

// Only requests that are decided before any data is read (auth, role, validation), so no database is needed.
describe('dashboard routes (integration)', () => {
  let server: Server;
  let baseUrl: string;
  const token = (role: string): string =>
    jwt.sign({ sub: ID, email: `${role}@example.com`, role }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });

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

  const get = (path: string, role?: string): Promise<Response> =>
    fetch(`${baseUrl}/api/v1/dashboard${path}`, { headers: role ? { Authorization: `Bearer ${token(role)}` } : {} });

  describe('authentication and roles', () => {
    it.each(['/company', '/company?range=last_7_days', '/platform'])('GET %s requires authentication', async (path) => {
      expect((await get(path)).status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
    });

    it.each(['user', 'applicant', 'admin'])('the company dashboard is closed to %s', async (role) => {
      expect((await get('/company', role)).status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    });

    it.each(['user', 'applicant', 'recruiter', 'enterprise_admin'])('the platform overview is closed to %s', async (role) => {
      expect((await get('/platform', role)).status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    });
  });

  describe('company query validation', () => {
    it.each([
      ['an unknown range', '?range=last_year'],
      ['a custom range without dates', '?range=custom'],
      ['a custom range with only a start', '?range=custom&from=2026-09-01'],
      ['dates on a preset', '?range=last_7_days&from=2026-09-01&to=2026-09-07'],
      ['an end before the start', '?range=custom&from=2026-09-10&to=2026-09-01'],
      ['a day that does not exist', '?range=custom&from=2026-02-30&to=2026-03-05'],
      ['a time instead of a day', '?range=custom&from=2026-09-01T00:00:00Z&to=2026-09-07T00:00:00Z'],
      ['more than 366 days', '?range=custom&from=2025-01-01&to=2026-06-01'],
      ['a company id', `?range=last_30_days&enterpriseId=${ID}`],
    ])('refuses %s', async (_name, query) => {
      expect((await get(`/company${query}`, 'recruiter')).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
      expect((await get(`/company${query}`, 'enterprise_admin')).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    });
  });
});
