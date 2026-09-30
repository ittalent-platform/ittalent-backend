import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/db.js';
import { disconnectRedis } from '../../src/config/redis.js';
import { Account } from '../../src/models/account.model.js';
import { User } from '../../src/models/user.model.js';
import { HTTP_STATUS } from '../../src/shared/constants/http-status.js';

const ALLOWED_FIELDS = ['createdAt', 'email', 'emailVerified', 'enterpriseId', 'fullName', 'id', 'phone', 'role', 'status', 'updatedAt', 'username'];
const PASSWORD_HASH = 'bcrypt-hash-must-never-leave-the-server';

let server: Server;
let baseUrl: string;
let adminToken: string;
let userToken: string;
let ownId: Types.ObjectId;
const marker = `ulist${new Types.ObjectId().toHexString().slice(-8)}`;
const caseMarker = `ucase${new Types.ObjectId().toHexString().slice(-8)}`;
const seeded: Types.ObjectId[] = [];

const sign = (role: string, sub: string, options: jwt.SignOptions = { expiresIn: '15m' }) =>
  jwt.sign({ sub, email: `${sub}@example.test`, role }, process.env.JWT_ACCESS_SECRET!, options);
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

interface UserBody {
  id: string;
  username: string;
  fullName: string | null;
  phone: string | null;
  email: string;
  createdAt: string;
  status: string;
  emailVerified: boolean;
}
interface Body extends Partial<UserBody> {
  items: UserBody[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

async function get(path: string, token?: string): Promise<{ status: number; body: Body }> {
  const response = await fetch(`${baseUrl}/api/v1/users${path}`, token ? { headers: auth(token) } : {});
  return { status: response.status, body: (await response.json()) as Body };
}

async function patch(id: string, body: unknown, token: string): Promise<{ status: number; body: Body }> {
  const response = await fetch(`${baseUrl}/api/v1/users/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...auth(token) },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Body };
}

async function seed(name: string, extra: Record<string, unknown> = {}): Promise<Types.ObjectId> {
  const _id = new Types.ObjectId();
  await User.collection.insertOne({
    _id,
    email: `${name}@example.test`,
    username: name,
    role: 'user',
    status: 'active',
    enterprise_id: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...extra,
  });
  seeded.push(_id);
  return _id;
}

describe('User accounts for administrators (UC-USER-01 / UC-USER-02, integration)', () => {
  let oldest: Types.ObjectId;

  beforeAll(async () => {
    await connectDatabase();
    ownId = new Types.ObjectId();
    adminToken = sign('admin', String(new Types.ObjectId()));
    userToken = sign('user', String(ownId));

    oldest = await seed(`${marker}-a`, { createdAt: new Date('2026-01-01T00:00:00.000Z'), email_verified: true });
    await seed(`${marker}-b`, { createdAt: new Date('2026-02-01T00:00:00.000Z'), role: 'recruiter', status: 'inactive', email_verified: false });
    await seed(`${marker}-c`, { createdAt: new Date('2026-03-01T00:00:00.000Z'), status: 'blocked', email_verified: false });
    await seed(`${marker}-d.e`, { createdAt: new Date('2026-04-01T00:00:00.000Z'), email_verified: true });
    // A legacy account created before the field existed: no email_verified value at all.
    await seed(`${marker}-dxe`, { createdAt: new Date('2026-04-01T00:00:00.000Z') });
    // Mixed-case names to prove sorting ignores case.
    await seed(`${caseMarker}-x1`, { createdAt: new Date('2026-05-01T00:00:00.000Z') });
    await seed(`${caseMarker}-X2`, { createdAt: new Date('2026-05-02T00:00:00.000Z') });
    await seed(`${caseMarker}-y3`, { createdAt: new Date('2026-05-03T00:00:00.000Z') });
    await Account.create({ user_id: oldest, provider: 'local', password_hash: PASSWORD_HASH });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await Account.deleteMany({ user_id: { $in: seeded } });
    await User.deleteMany({ _id: { $in: seeded } });
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await disconnectRedis();
    await disconnectDatabase();
  });

  describe('list', () => {
    it('lists newest first, then by id, with page metadata and only the allowed fields', async () => {
      const { status, body } = await get(`?search=${marker}`, adminToken);

      expect(status).toBe(HTTP_STATUS.HTTP_200_OK);
      expect(body).toMatchObject({ page: 1, limit: 20, total: 5, totalPages: 1 });
      expect(body.items).toHaveLength(5);
      const times = body.items.map((item: { createdAt: string }) => item.createdAt);
      expect([...times].sort().reverse()).toEqual(times);
      // The two accounts created at the same instant are ordered by id descending.
      const sameInstant = body.items.filter((item: { createdAt: string }) => item.createdAt.startsWith('2026-04-01'));
      expect(sameInstant.map((item: { id: string }) => item.id)).toEqual([...sameInstant.map((item: { id: string }) => item.id)].sort().reverse());
      for (const item of body.items) {
        expect(Object.keys(item).sort()).toEqual(ALLOWED_FIELDS);
      }
      expect(body.items.at(-1)?.id).toBe(String(oldest));
    });

    it('never returns a password hash or token, even for a user that has a credential', async () => {
      const { body } = await get(`?search=${marker}`, adminToken);
      const text = JSON.stringify(body);

      expect(text).not.toContain(PASSWORD_HASH);
      expect(text).not.toMatch(/password|token|secret/i);
    });

    it('includes accounts of every status', async () => {
      const { body } = await get(`?search=${marker}`, adminToken);

      expect(new Set(body.items.map((item: { status: string }) => item.status))).toEqual(new Set(['active', 'inactive', 'blocked']));
    });

    it('returns only the requested bounded page (AC.2)', async () => {
      const first = await get(`?search=${marker}&limit=2&page=1`, adminToken);
      const last = await get(`?search=${marker}&limit=2&page=3`, adminToken);
      const beyond = await get(`?search=${marker}&limit=2&page=4`, adminToken);

      expect(first.body).toMatchObject({ page: 1, limit: 2, total: 5, totalPages: 3 });
      expect(first.body.items).toHaveLength(2);
      expect(last.body.items).toHaveLength(1);
      expect(beyond.body.items).toHaveLength(0);
      expect(beyond.body.total).toBe(5);
    });

    it('filters by role and status together with search', async () => {
      const recruiter = await get(`?search=${marker}&role=recruiter`, adminToken);
      const blocked = await get(`?search=${marker}&status=blocked`, adminToken);
      const none = await get(`?search=${marker}&role=recruiter&status=blocked`, adminToken);

      expect(recruiter.body.items.map((item: { username: string }) => item.username)).toEqual([`${marker}-b`]);
      expect(blocked.body.items.map((item: { username: string }) => item.username)).toEqual([`${marker}-c`]);
      expect(none.body).toMatchObject({ items: [], total: 0, totalPages: 0 });
    });

    it('matches email as well as username, case-insensitively', async () => {
      const { body } = await get(`?search=${marker.toUpperCase()}-C%40EXAMPLE`, adminToken);

      expect(body.items.map((item: { username: string }) => item.username)).toEqual([`${marker}-c`]);
    });

    it('treats search text literally, not as a pattern', async () => {
      const literal = await get(`?search=${encodeURIComponent(`${marker}-d.e`)}`, adminToken);
      const pattern = await get(`?search=${encodeURIComponent('.*')}`, adminToken);

      expect(literal.body.items.map((item: { username: string }) => item.username)).toEqual([`${marker}-d.e`]);
      // ".*" as a pattern would match everything; as literal text it only matches names containing ".*".
      expect(pattern.body.items.every((item: { username: string; email: string }) => `${item.username}${item.email}`.includes('.*'))).toBe(true);
    });

    it('reports the email verification state; a legacy account without the field counts as not verified', async () => {
      const { body } = await get(`?search=${marker}`, adminToken);
      const byName = Object.fromEntries(body.items.map((item) => [item.username, item.emailVerified]));

      expect(byName).toEqual({
        [`${marker}-a`]: true,
        [`${marker}-b`]: false,
        [`${marker}-c`]: false,
        [`${marker}-d.e`]: true,
        [`${marker}-dxe`]: false,
      });
    });

    it('filters by email verification state', async () => {
      const verified = await get(`?search=${marker}&emailVerified=true`, adminToken);
      const unverified = await get(`?search=${marker}&emailVerified=false`, adminToken);

      expect(verified.body.items.map((item) => item.username).sort()).toEqual([`${marker}-a`, `${marker}-d.e`]);
      expect(unverified.body.items.map((item) => item.username).sort()).toEqual([`${marker}-b`, `${marker}-c`, `${marker}-dxe`]);
      expect(verified.body.total + unverified.body.total).toBe(5);
    });

    it.each([
      ['username', 'asc', [`${marker}-a`, `${marker}-b`, `${marker}-c`, `${marker}-d.e`, `${marker}-dxe`]],
      ['username', 'desc', [`${marker}-dxe`, `${marker}-d.e`, `${marker}-c`, `${marker}-b`, `${marker}-a`]],
      ['email', 'asc', [`${marker}-a`, `${marker}-b`, `${marker}-c`, `${marker}-d.e`, `${marker}-dxe`]],
      ['createdAt', 'asc', [`${marker}-a`, `${marker}-b`, `${marker}-c`, `${marker}-d.e`, `${marker}-dxe`]],
    ])('sorts by %s %s', async (sortBy, sortOrder, expected) => {
      const { body } = await get(`?search=${marker}&sortBy=${sortBy}&sortOrder=${sortOrder}`, adminToken);

      expect(body.items.map((item) => item.username)).toEqual(expected);
    });

    it('sorts by account id in both directions', async () => {
      const asc = await get(`?search=${marker}&sortBy=id&sortOrder=asc`, adminToken);
      const desc = await get(`?search=${marker}&sortBy=id&sortOrder=desc`, adminToken);
      const ids = asc.body.items.map((item) => item.id);

      expect(ids).toEqual([...ids].sort());
      expect(desc.body.items.map((item) => item.id)).toEqual([...ids].reverse());
    });

    it('ignores letter case when sorting text columns', async () => {
      const asc = await get(`?search=${caseMarker}&sortBy=username&sortOrder=asc`, adminToken);

      expect(asc.body.items.map((item) => item.username)).toEqual([`${caseMarker}-x1`, `${caseMarker}-X2`, `${caseMarker}-y3`]);
    });

    it('keeps the order stable across pages when sorting', async () => {
      const first = await get(`?search=${marker}&sortBy=username&sortOrder=asc&limit=2&page=1`, adminToken);
      const second = await get(`?search=${marker}&sortBy=username&sortOrder=asc&limit=2&page=2`, adminToken);

      expect([...first.body.items, ...second.body.items].map((item) => item.username)).toEqual([`${marker}-a`, `${marker}-b`, `${marker}-c`, `${marker}-d.e`]);
    });

    it('returns an empty page when nothing matches (AC.1)', async () => {
      const { status, body } = await get(`?search=${marker}-does-not-exist`, adminToken);

      expect(status).toBe(HTTP_STATUS.HTTP_200_OK);
      expect(body).toMatchObject({ items: [], total: 0, totalPages: 0 });
    });

    it.each([
      ['page 0', '?page=0'],
      ['limit 0', '?limit=0'],
      ['limit above 100', '?limit=101'],
      ['non-numeric limit', '?limit=abc'],
      ['blank search', '?search=%20%20'],
      ['search over 100 characters', `?search=${'a'.repeat(101)}`],
      ['unsupported role', '?role=owner'],
      ['unsupported status', '?status=deleted'],
      ['unsupported sort column', '?sortBy=password_hash'],
      ['unsupported sort order', '?sortOrder=sideways'],
      ['non-boolean emailVerified', '?emailVerified=yes'],
      ['unknown key', '?colour=red'],
    ])('rejects an invalid request: %s (EX.2)', async (_label, query) => {
      const { status, body } = await get(query, adminToken);

      expect(status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
      expect(body).not.toHaveProperty('items');
    });

    it('rejects a caller without a session with 401 (EX.5)', async () => {
      for (const token of [undefined, 'not-a-jwt', sign('admin', String(new Types.ObjectId()), { expiresIn: -60 })]) {
        const { status, body } = await get('', token);
        expect(status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
        expect(body).not.toHaveProperty('items');
      }
    });

    it('rejects a non-administrator with 403 and returns no data (EX.1)', async () => {
      for (const role of ['user', 'applicant', 'recruiter', 'interviewer']) {
        const { status, body } = await get('', sign(role, String(new Types.ObjectId())));
        expect(status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
        expect(body).not.toHaveProperty('items');
      }
    });

    it('checks the permission before validating the input', async () => {
      const { status } = await get('?limit=9999', userToken);

      expect(status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    });
  });

  describe('OpenAPI', () => {
    it('documents the user shape, including emailVerified, once for every endpoint that returns a user', async () => {
      const response = await fetch(`${baseUrl}/openapi.json`);
      const spec = (await response.json()) as {
        components: { schemas: Record<string, { properties?: Record<string, unknown>; required?: string[] }> };
        paths: Record<string, { get?: { parameters?: { name: string }[] }; patch?: { operationId?: string; requestBody?: { content?: Record<string, unknown> } } }>;
      };
      const user = spec.components.schemas['UserDTO'];

      expect(Object.keys(user?.properties ?? {}).sort()).toEqual(ALLOWED_FIELDS);
      expect(user?.properties).toHaveProperty('fullName');
      expect(user?.properties).toHaveProperty('phone');
      expect(user?.required).toContain('emailVerified');
      const parameters = spec.paths['/api/v1/users']?.get?.parameters?.map((parameter) => parameter.name) ?? [];
      expect(parameters).toEqual(expect.arrayContaining(['search', 'role', 'status', 'emailVerified', 'sortBy', 'sortOrder']));
      expect(spec.paths['/api/v1/users/{id}']?.patch?.requestBody?.content?.['application/json']).toBeDefined();
      expect(spec.paths['/api/v1/users/{id}']?.patch?.operationId).toBe('patchApiV1UsersById');
      expect(spec.components.schemas).toHaveProperty('UpdateUserRequest');
    });
  });

  describe('edit', () => {
    it('updates fullName and phone through the administrator PATCH endpoint', async () => {
      const result = await patch(String(oldest), { fullName: 'Mai Dương', phone: '0901 234 567' }, adminToken);

      expect(result.status).toBe(HTTP_STATUS.HTTP_200_OK);
      expect(result.body).toMatchObject({ id: String(oldest), fullName: 'Mai Dương', phone: '0901234567' });
    });
  });

  describe('detail', () => {
    it('returns the allowed fields only, without credentials', async () => {
      const { status, body } = await get(`/${oldest}`, adminToken);

      expect(status).toBe(HTTP_STATUS.HTTP_200_OK);
      expect(Object.keys(body).sort()).toEqual(ALLOWED_FIELDS);
      expect(body).toMatchObject({ id: String(oldest), username: `${marker}-a`, email: `${marker}-a@example.test`, role: 'user', status: 'active', enterpriseId: null });
      expect(JSON.stringify(body)).not.toContain(PASSWORD_HASH);
    });

    it('is read-only: the record is unchanged afterwards', async () => {
      const before = await User.collection.findOne({ _id: oldest });
      await get(`/${oldest}`, adminToken);

      expect(await User.collection.findOne({ _id: oldest })).toEqual(before);
    });

    it('returns 404 for a well-formed identifier that does not exist (EX.3)', async () => {
      const { status, body } = await get(`/${new Types.ObjectId()}`, adminToken);

      expect(status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
      expect(body).not.toHaveProperty('email');
    });

    it('returns 400 for a malformed identifier (EX.2)', async () => {
      const { status } = await get('/not-an-id', adminToken);

      expect(status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    });

    it('rejects a missing or expired session with 401 (EX.6)', async () => {
      expect((await get(`/${oldest}`)).status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
      expect((await get(`/${oldest}`, sign('admin', 'x', { expiresIn: -60 }))).status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
    });

    it('rejects every non-administrator with 403, including the account owner (EX.1)', async () => {
      const own = await User.collection.insertOne({
        email: `${marker}-own@example.test`,
        username: `${marker}-own`,
        role: 'user',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      seeded.push(own.insertedId);
      const ownerToken = sign('user', String(own.insertedId));

      for (const [id, token] of [[oldest, userToken], [own.insertedId, ownerToken]] as const) {
        const { status, body } = await get(`/${id}`, token);
        expect(status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
        expect(body).not.toHaveProperty('email');
      }
    });
  });
});
