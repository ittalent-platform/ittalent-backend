import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import jwt from 'jsonwebtoken';
import { app } from '../../src/app.js';
import { HTTP_STATUS } from '../../src/shared/constants/http-status.js';

describe('GET /api/v1/me/applications (integration)', () => {
  let server: Server;
  let baseUrl: string;
  let userToken: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    // Create a JWT for a user with role 'user' (matches the authorize('user') guard)
    userToken = jwt.sign(
      { sub: '507f1f77bcf86cd799439011', email: 'user@example.com', role: 'user' },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: '15m' },
    );
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('requires authentication', async () => {
    const response = await fetch(`${baseUrl}/api/v1/me/applications`);
    expect(response.status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
  });

  it('requires candidate role (user)', async () => {
    const adminToken = jwt.sign(
      { sub: 'admin', email: 'admin@example.com', role: 'admin' },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: '15m' },
    );
    const response = await fetch(`${baseUrl}/api/v1/me/applications`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(response.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
  });

  it('rejects malformed application ID parameter', async () => {
    const response = await fetch(`${baseUrl}/api/v1/me/applications/not-an-id`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(response.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
  });

  it('rejects contradictory date range in query', async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/me/applications?submittedFrom=2026-12-31T23:59:59.000Z&submittedTo=2026-01-01T00:00:00.000Z`,
      {
        headers: { Authorization: `Bearer ${userToken}` },
      },
    );
    expect(response.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
  });
});

describe('GET /api/v1/me/applications/:id/history (integration)', () => {
  let server: Server;
  let baseUrl: string;
  let userToken: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    userToken = jwt.sign(
      { sub: '507f1f77bcf86cd799439011', email: 'user@example.com', role: 'user' },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: '15m' },
    );
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('requires authentication', async () => {
    const response = await fetch(`${baseUrl}/api/v1/me/applications/507f1f77bcf86cd799439011/history`);
    expect(response.status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
  });

  it('requires candidate role', async () => {
    const adminToken = jwt.sign(
      { sub: 'admin', email: 'admin@example.com', role: 'admin' },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: '15m' },
    );
    const response = await fetch(`${baseUrl}/api/v1/me/applications/507f1f77bcf86cd799439011/history`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(response.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
  });

  it('rejects malformed application ID', async () => {
    const response = await fetch(`${baseUrl}/api/v1/me/applications/bad-id/history`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(response.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
  });

});

describe('PATCH /api/v1/me/applications/:id/withdraw (integration)', () => {
  let server: Server;
  let baseUrl: string;
  let userToken: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    userToken = jwt.sign(
      { sub: '507f1f77bcf86cd799439011', email: 'user@example.com', role: 'user' },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: '15m' },
    );
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('requires authentication', async () => {
    const response = await fetch(`${baseUrl}/api/v1/me/applications/507f1f77bcf86cd799439011/withdraw`, {
      method: 'PATCH',
    });
    expect(response.status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
  });

  it('requires candidate role', async () => {
    const adminToken = jwt.sign(
      { sub: 'admin', email: 'admin@example.com', role: 'admin' },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: '15m' },
    );
    const response = await fetch(`${baseUrl}/api/v1/me/applications/507f1f77bcf86cd799439011/withdraw`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(response.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
  });

  it('requires expectedVersion in body', async () => {
    const response = await fetch(`${baseUrl}/api/v1/me/applications/507f1f77bcf86cd799439011/withdraw`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ reason: 'test' }), // missing expectedVersion
    });
    expect(response.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
  });

  it('rejects malformed application ID', async () => {
    const response = await fetch(`${baseUrl}/api/v1/me/applications/bad-id/withdraw`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ expectedVersion: 0 }),
    });
    expect(response.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
  });
});

describe('GET /api/v1/me/applications query validation (integration)', () => {
  let server: Server;
  let baseUrl: string;
  let userToken: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
    userToken = jwt.sign({ sub: '507f1f77bcf86cd799439011', email: 'user@example.com', role: 'user' }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
  });
  afterAll(async () => { await new Promise<void>((resolve) => { server.close(() => resolve()); }); });

  // UC-MYAPP-01.EX.3 / UC-MYAPP-05.EX.2 / EX.3: bad input is rejected with 400 before any data is read.
  it.each([
    ['unsupported status', 'status=archived'],
    ['a status list with an unsupported item', 'status=submitted,archived'],
    ['unsupported sort field', 'sortBy=company'],
    ['unsupported sort order', 'sortOrder=sideways'],
    ['zero page', 'page=0'],
    ['oversized limit', 'limit=1000'],
    ['blank keyword', 'search=%20%20'],
    ['keyword over 100 characters', `search=${'x'.repeat(101)}`],
    ['unsupported filter key', 'company=Nova'],
    ['malformed job id', 'jobId=abc'],
  ])('rejects %s', async (_label, queryString) => {
    const response = await fetch(`${baseUrl}/api/v1/me/applications?${queryString}`, { headers: { Authorization: `Bearer ${userToken}` } });
    expect(response.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
  });

  it('documents the list contract in openapi, including sort and multi-status filters', async () => {
    const spec = (await (await fetch(`${baseUrl}/openapi.json`)).json()) as { paths: Record<string, { get?: { parameters?: { name: string }[] } }> };
    const names = spec.paths['/api/v1/me/applications']?.get?.parameters?.map((parameter) => parameter.name) ?? [];
    expect(names).toEqual(expect.arrayContaining(['status', 'sortBy', 'sortOrder', 'search', 'submittedFrom', 'submittedTo', 'jobId', 'reviewStage']));
  });
});
