import { Types } from 'mongoose';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/db.js';
import { disconnectRedis } from '../../src/config/redis.js';
import { Enterprise, type CompanySize } from '../../src/models/enterprise.model.js';
import { JobPosting } from '../../src/models/job-posting.model.js';
import { HTTP_STATUS } from '../../src/shared/constants/http-status.js';

interface Card {
  id: string;
  name: string;
  cities: string[];
  openRoleCount: number;
}

interface ListBody {
  items: Card[];
  page: number;
  total: number;
  totalPages: number;
}

let server: Server | undefined;
let baseUrl: string;
let databaseConnected = false;
const owner = new Types.ObjectId();
// Every name and industry carries this tag, so the assertions do not depend on other test files' data.
const tag = `pb${new Types.ObjectId().toHexString().slice(-8)}`;
const createdIds: Types.ObjectId[] = [];

async function company(name: string, industry: string, size: CompanySize, city: string, extra: Record<string, unknown> = {}): Promise<Types.ObjectId> {
  const id = new Types.ObjectId();
  await Enterprise.create({
    _id: id,
    name: `${tag} ${name}`,
    tax_code: `T${id.toHexString().slice(-10)}`,
    email: `${id}@corp.test`,
    phone: '0987654321',
    industry: `${tag}${industry}`,
    company_size: size,
    address: { street: '1 Main St', city, country: 'Vietnam' },
    status: 'active',
    is_deleted: false,
    creator_account_id: owner,
    ...extra,
  });
  createdIds.push(id);
  return id;
}

async function get(path: string): Promise<{ status: number; body: ListBody & Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}/api/v1/enterprises${path}`);
  return { status: response.status, body: (await response.json()) as ListBody & Record<string, unknown> };
}

const names = async (query: string): Promise<string[]> => (await get(`/public?keyword=${tag}&${query}`)).body.items.map((card) => card.name.replace(`${tag} `, ''));

describe('Public company browse (UC-BENT-01 / 03)', () => {
  beforeAll(async () => {
    await connectDatabase();
    databaseConnected = true;
    const nimbus = await company('Nimbus Pay', 'Fintech', '51-200', 'Ha Noi', { branches: [{ street: '2 Side St', city: 'Ho Chi Minh City', district: 'District 1', country: 'Vietnam' }, { street: '3 Side St', city: 'Ha Noi', state_province: 'Red River Delta', country: 'Vietnam' }], short_description: 'Payments' });
    await company('Lumen Labs', 'Software', '11-50', 'Ho Chi Minh City');
    await company('Song Han', 'Software', '501-1000', 'Da Nang', { branches: [{ street: '9 Coast Rd', city: `${tag}Quy Nhon`, country: 'Vietnam' }] });
    await company('Kite Health', 'Healthtech', '201-500', 'Da Nang', { status: 'pending' });
    await company('Orbit Games', 'Gaming', '51-200', 'Da Nang', { status: 'suspended' });
    await company('Gone Co', 'Fintech', '51-200', 'Ha Noi', { status: 'deleted', is_deleted: true });
    const job = (title: string, extra: Record<string, unknown>): Record<string, unknown> => {
      const jobId = new Types.ObjectId();
      return { _id: jobId, enterprise_id: nimbus, posted_by_user_id: owner, title, slug: `${tag}-${jobId.toHexString()}`, status: 'published', ...extra };
    };
    await JobPosting.create([
      job('Open role', { expires_at: new Date(Date.now() + 86_400_000) }),
      job('Expired role', { expires_at: new Date(Date.now() - 86_400_000) }),
      job('Closed role', { status: 'closed' }),
    ]);
    await new Promise<void>((resolve) => {
      const listening = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${(listening.address() as AddressInfo).port}`;
        server = listening;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (databaseConnected) {
      await JobPosting.deleteMany({ slug: new RegExp(`^${tag}-`) });
      await Enterprise.deleteMany({ _id: { $in: createdIds } });
    }
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
    if (databaseConnected) {
      await disconnectRedis();
      await disconnectDatabase();
    }
  });

  it('lists only Active companies, to anyone, as cards with their offices and open roles', async () => {
    const result = await get(`/public?keyword=${tag}`);
    expect(result.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(result.body).toMatchObject({ page: 1, total: 3, totalPages: 1 });
    expect(result.body.items.map((card) => card.name)).toEqual([`${tag} Lumen Labs`, `${tag} Nimbus Pay`, `${tag} Song Han`]);
    const nimbus = result.body.items[1]!;
    expect(nimbus).toMatchObject({ cities: ['Ha Noi', 'Ho Chi Minh City'], openRoleCount: 1 });
    expect(Object.keys(nimbus).sort()).toEqual(['cities', 'companySize', 'id', 'industry', 'logoUrl', 'name', 'openRoleCount', 'shortDescription']);
  });

  it('searches by name or industry and filters by several industries, sizes and a city at once', async () => {
    expect(await names('')).toEqual(['Lumen Labs', 'Nimbus Pay', 'Song Han']);
    expect((await get(`/public?keyword=${tag}%20NIMBUS`)).body.total).toBe(1);
    expect((await get(`/public?keyword=${tag}Software`)).body.total).toBe(2);
    expect(await names(`industry=${tag}fintech,${tag}SOFTWARE`)).toEqual(['Lumen Labs', 'Nimbus Pay', 'Song Han']);
    expect(await names(`industry=${tag}Software`)).toEqual(['Lumen Labs', 'Song Han']);
    expect(await names('company_size=11-50,501-1000')).toEqual(['Lumen Labs', 'Song Han']);
    expect(await names('location=Da Nang')).toEqual(['Song Han']);
    // A branch counts as being in its city.
    expect(await names('location=Ho Chi Minh')).toEqual(['Lumen Labs', 'Nimbus Pay']);
    // A branch's district and province count like the head office's, and its city is found by the keyword too.
    expect(await names('location=District 1')).toEqual(['Nimbus Pay']);
    expect(await names('location=red river')).toEqual(['Nimbus Pay']);
    expect((await get(`/public?keyword=${tag}Quy%20Nhon`)).body.items.map((card) => card.name)).toEqual([`${tag} Song Han`]);
    expect(await names(`industry=${tag}Software&company_size=11-50&location=Ho Chi Minh`)).toEqual(['Lumen Labs']);
    expect(await names('company_size=1-10')).toEqual([]);
    expect((await get(`/public?keyword=${tag}&limit=1&page=2`)).body).toMatchObject({ total: 3, totalPages: 3, items: [{ name: `${tag} Nimbus Pay` }] });
  });

  it('refuses an unsupported size, an empty filter, a status filter and bad paging', async () => {
    for (const query of ['company_size=11-50,huge', 'industry=,', 'status=pending', 'limit=0']) {
      expect((await get(`/public?${query}`)).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    }
  });

  it('lists the industries of Active companies, most companies first', async () => {
    const result = (await get('/public/industries')).body as unknown as { items: { industry: string; count: number }[] };
    const mine = result.items.filter((item) => item.industry.startsWith(tag));
    expect(mine).toEqual([{ industry: `${tag}Software`, count: 2 }, { industry: `${tag}Fintech`, count: 1 }]);
  });
});
