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
import { Interview } from '../../src/models/interview.model.js';
import { HTTP_STATUS } from '../../src/shared/constants/http-status.js';

const ownerId = new Types.ObjectId();
const otherOwnerId = new Types.ObjectId();
const schedulerId = new Types.ObjectId();
const realFetch = globalThis.fetch;
let server: Server;
let baseUrl: string;

function token(userId: Types.ObjectId): string {
  return jwt.sign(
    {
      sub: String(userId),
      email: `${String(userId)}@integration.test`,
      role: 'user',
    },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: '15m' },
  );
}

function headers(userId: Types.ObjectId): Record<string, string> {
  return {
    Authorization: `Bearer ${token(userId)}`,
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

describe('Document library and interview responses integration', () => {
  beforeAll(async () => {
    await connectDatabase();
    await Promise.all([
      Document.syncIndexes(),
      Application.syncIndexes(),
      Interview.syncIndexes(),
    ]);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
  });

  beforeEach(async () => {
    await Promise.all([
      Interview.deleteMany({}),
      Application.deleteMany({}),
      Document.deleteMany({}),
    ]);
  });

  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await Promise.all([
      Interview.deleteMany({}),
      Application.deleteMany({}),
      Document.deleteMany({}),
    ]);
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

    expect(
      (
        await fetch(
          `${baseUrl}/api/v1/documents/${String(foreign._id)}/download`,
          { headers: headers(ownerId) },
        )
      ).status,
    ).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
  });

  it('searches and filters documents and keeps one default per type', async () => {
    const firstCv = await createDocument(ownerId, 'backend-resume.pdf');
    const secondCv = await createDocument(ownerId, 'frontend-resume.pdf');
    const coverLetter = await createDocument(
      ownerId,
      'backend-letter.pdf',
      'cover_letter',
    );

    expect(
      (
        await fetch(
          `${baseUrl}/api/v1/documents/${String(firstCv._id)}/default`,
          { method: 'PATCH', headers: headers(ownerId) },
        )
      ).status,
    ).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(
      (
        await fetch(
          `${baseUrl}/api/v1/documents/${String(secondCv._id)}/default`,
          { method: 'PATCH', headers: headers(ownerId) },
        )
      ).status,
    ).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(
      (
        await fetch(
          `${baseUrl}/api/v1/documents/${String(coverLetter._id)}/default`,
          { method: 'PATCH', headers: headers(ownerId) },
        )
      ).status,
    ).toBe(HTTP_STATUS.HTTP_200_OK);

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

  it('soft-deletes an unreferenced document and blocks deletion of an application attachment', async () => {
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

    expect(
      (
        await fetch(`${baseUrl}/api/v1/documents/${String(removable._id)}`, {
          method: 'DELETE',
          headers: headers(ownerId),
        })
      ).status,
    ).toBe(HTTP_STATUS.HTTP_204_NO_CONTENT);
    expect(
      (await Document.findById(removable._id).lean())?.deleted_at,
    ).toBeTruthy();
    expect(
      (
        await fetch(
          `${baseUrl}/api/v1/documents/${String(protectedDocument._id)}`,
          { method: 'DELETE', headers: headers(ownerId) },
        )
      ).status,
    ).toBe(HTTP_STATUS.HTTP_409_CONFLICT);
  });

  it('allows only the owning candidate to respond once to a scheduled interview', async () => {
    const cv = await createDocument(ownerId, 'interview-resume.pdf');
    const application = await Application.create({
      job_id: new Types.ObjectId(),
      applicant_id: ownerId,
      cv_id: cv._id,
      status: 'interviewing',
      status_history: [],
    });
    const interview = await Interview.create({
      application_id: application._id,
      scheduled_by_user_id: schedulerId,
      date_time: new Date('2099-01-01T01:00:00.000Z'),
      duration_minutes: 60,
      timezone: 'Asia/Ho_Chi_Minh',
      mode: 'online',
      meeting_link: 'https://meet.example.test/interview',
      status: 'scheduled',
      applicant_response: 'pending',
      response_history: [],
    });

    expect(
      (
        await fetch(
          `${baseUrl}/api/v1/interviews/${String(interview._id)}/respond`,
          {
            method: 'PATCH',
            headers: headers(otherOwnerId),
            body: JSON.stringify({ response: 'accepted' }),
          },
        )
      ).status,
    ).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
    const accepted = await fetch(
      `${baseUrl}/api/v1/interviews/${String(interview._id)}/respond`,
      {
        method: 'PATCH',
        headers: headers(ownerId),
        body: JSON.stringify({ response: 'accepted' }),
      },
    );
    expect(accepted.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(
      ((await accepted.json()) as { applicantResponse: string })
        .applicantResponse,
    ).toBe('accepted');
    expect(
      (
        await fetch(
          `${baseUrl}/api/v1/interviews/${String(interview._id)}/respond`,
          {
            method: 'PATCH',
            headers: headers(ownerId),
            body: JSON.stringify({ response: 'declined' }),
          },
        )
      ).status,
    ).toBe(HTTP_STATUS.HTTP_409_CONFLICT);
  });
});
