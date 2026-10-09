import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { app } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/db.js';
import { disconnectRedis } from '../../src/config/redis.js';
import { Application } from '../../src/models/application.model.js';
import { Document } from '../../src/models/document.model.js';
import { HTTP_STATUS } from '../../src/shared/constants/http-status.js';

const ownerId = new Types.ObjectId();
const otherOwnerId = new Types.ObjectId();
const adminId = new Types.ObjectId();
const realFetch = globalThis.fetch;
let server: Server;
let baseUrl: string;

function token(
  userId: Types.ObjectId,
  role: 'user' | 'admin' = 'user',
): string {
  return jwt.sign(
    {
      sub: String(userId),
      email: `${String(userId)}@integration.test`,
      role,
    },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: '15m' },
  );
}

function headers(
  userId: Types.ObjectId,
  role: 'user' | 'admin' = 'user',
): Record<string, string> {
  return {
    Authorization: `Bearer ${token(userId, role)}`,
    'Content-Type': 'application/json',
  };
}

async function createDocument(
  owner: Types.ObjectId,
  fileName: string,
  type: 'cv' | 'cover_letter' = 'cv',
) {
  return Document.create({
    owner_id: owner,
    type,
    file_url: `https://storage.integration.test/${fileName}`,
    storage_key: `documents/${fileName}`,
    file_name: fileName,
    mime_type: fileName.endsWith('.pdf')
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 128,
    is_default: false,
    deleted_at: null,
  });
}

describe('Document management integration', () => {
  beforeAll(async () => {
    await connectDatabase();
    await Promise.all([Document.syncIndexes(), Application.syncIndexes()]);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
  });

  beforeEach(async () => {
    await Promise.all([Application.deleteMany({}), Document.deleteMany({})]);
  });

  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await Promise.all([Application.deleteMany({}), Document.deleteMany({})]);
    await disconnectRedis();
    await disconnectDatabase();
  });

  it('downloads and previews only owned active documents', async () => {
    const mine = await createDocument(ownerId, 'resume.pdf');
    const foreign = await createDocument(otherOwnerId, 'private.pdf');
    vi.stubGlobal(
      'fetch',
      (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith('https://storage.integration.test/')) {
          return Promise.resolve(
            new Response('pdf-bytes', {
              status: 200,
              headers: { 'Content-Type': 'application/pdf' },
            }),
          );
        }
        return realFetch(input, init);
      },
    );

    const download = await fetch(
      `${baseUrl}/api/v1/documents/${String(mine._id)}/download`,
      { headers: headers(ownerId) },
    );
    expect(download.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(download.headers.get('content-disposition')).toContain('attachment');
    expect(await download.text()).toBe('pdf-bytes');

    const preview = await fetch(
      `${baseUrl}/api/v1/documents/${String(mine._id)}/preview`,
      { headers: headers(ownerId) },
    );
    expect(preview.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(preview.headers.get('content-disposition')).toContain('inline');

    const foreignDownload = await fetch(
      `${baseUrl}/api/v1/documents/${String(foreign._id)}/download`,
      { headers: headers(ownerId) },
    );
    expect(foreignDownload.status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);

    const adminUsingOwnerRoute = await fetch(
      `${baseUrl}/api/v1/documents/${String(mine._id)}/download`,
      { headers: headers(adminId, 'admin') },
    );
    expect(adminUsingOwnerRoute.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);

    const adminUsingOwnerPreview = await fetch(
      `${baseUrl}/api/v1/documents/${String(mine._id)}/preview`,
      { headers: headers(adminId, 'admin') },
    );
    expect(adminUsingOwnerPreview.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);

    const removedAdminRoute = await fetch(
      `${baseUrl}/api/v1/admin/documents/${String(mine._id)}/download`,
      { headers: headers(adminId, 'admin') },
    );
    expect(removedAdminRoute.status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);

    const removedAdminPreviewRoute = await fetch(
      `${baseUrl}/api/v1/admin/documents/${String(mine._id)}/preview`,
      { headers: headers(adminId, 'admin') },
    );
    expect(removedAdminPreviewRoute.status).toBe(
      HTTP_STATUS.HTTP_404_NOT_FOUND,
    );
  });

  it('searches and filters documents and keeps one default per type', async () => {
    const firstCv = await createDocument(ownerId, 'backend-resume.pdf');
    const secondCv = await createDocument(ownerId, 'frontend-resume.pdf');
    const coverLetter = await createDocument(
      ownerId,
      'backend-letter.pdf',
      'cover_letter',
    );

    for (const document of [firstCv, secondCv, coverLetter]) {
      const response = await fetch(
        `${baseUrl}/api/v1/documents/${String(document._id)}/default`,
        { method: 'PATCH', headers: headers(ownerId) },
      );
      expect(response.status).toBe(HTTP_STATUS.HTTP_200_OK);
    }

    const defaults = await Document.find({
      owner_id: ownerId,
      is_default: true,
    })
      .sort({ type: 1 })
      .lean();
    expect(defaults).toHaveLength(2);
    expect(defaults.find((item) => item.type === 'cv')?._id.toString()).toBe(
      String(secondCv._id),
    );
    expect(
      defaults.find((item) => item.type === 'cover_letter')?._id.toString(),
    ).toBe(String(coverLetter._id));

    const list = await fetch(
      `${baseUrl}/api/v1/documents?search=backend&type=cv`,
      { headers: headers(ownerId) },
    );
    expect(list.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const body = (await list.json()) as {
      items: Array<{ id: string; fileName: string }>;
    };
    expect(body.items.map((item) => item.fileName)).toEqual([
      'backend-resume.pdf',
    ]);
  });

  it('soft-deletes an unreferenced document and blocks an application attachment', async () => {
    const removable = await createDocument(ownerId, 'old-resume.pdf');
    const protectedDocument = await createDocument(
      ownerId,
      'submitted-resume.pdf',
    );
    await Application.create({
      job_id: new Types.ObjectId(),
      applicant_id: ownerId,
      cv_id: protectedDocument._id,
      status: 'submitted',
      status_history: [],
    });

    const removed = await fetch(
      `${baseUrl}/api/v1/documents/${String(removable._id)}`,
      { method: 'DELETE', headers: headers(ownerId) },
    );
    expect(removed.status).toBe(HTTP_STATUS.HTTP_204_NO_CONTENT);
    expect(
      (await Document.findById(removable._id).lean())?.deleted_at,
    ).toBeTruthy();

    const blocked = await fetch(
      `${baseUrl}/api/v1/documents/${String(protectedDocument._id)}`,
      { method: 'DELETE', headers: headers(ownerId) },
    );
    expect(blocked.status).toBe(HTTP_STATUS.HTTP_409_CONFLICT);
  });
});
