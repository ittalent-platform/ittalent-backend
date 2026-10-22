import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { app } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { broadcastNotificationsService } from '../../src/modules/broadcast-notifications/broadcast-notifications.service.js';
import { HTTP_STATUS } from '../../src/shared/constants/http-status.js';

describe('Broadcast Notifications API Routes (Integration)', () => {
  let server: Server;
  let baseUrl: string;
  let adminToken: string;
  let recruiterToken: string;
  const adminId = new Types.ObjectId().toString();
  const recruiterId = new Types.ObjectId().toString();

  const mockBroadcastDto = {
    id: new Types.ObjectId().toString(),
    title: 'System Maintenance Window',
    content: 'Scheduled maintenance this Sunday midnight.',
    category: 'System Maintenance' as const,
    targetAudience: 'All Users' as const,
    priority: 'Normal' as const,
    actionUrl: null,
    actionLabel: null,
    channels: ['In-App Inbox' as const],
    status: 'Draft' as const,
    scheduledAt: null,
    sentAt: null,
    deliveryMetrics: { targetedCount: 0, deliveredCount: 0, readCount: 0, readPercentage: 0 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeAll(async () => {
    adminToken = jwt.sign(
      { sub: adminId, email: 'admin@italent.com', role: 'admin' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' },
    );

    recruiterToken = jwt.sign(
      { sub: recruiterId, email: 'recruiter@enterprise.com', role: 'recruiter' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' },
    );

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await fetch(`${baseUrl}/api/v1/broadcast-notifications`);
    expect(res.status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
  });

  it('rejects non-admin requests with 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/api/v1/broadcast-notifications`, {
      headers: { Authorization: `Bearer ${recruiterToken}` },
    });
    expect(res.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
  });

  it('returns 200 for authenticated admin listing broadcast notifications', async () => {
    const mockList = {
      items: [mockBroadcastDto],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
      summary: { total: 1, drafts: 1, scheduled: 0, sent: 0 },
    };
    vi.spyOn(broadcastNotificationsService, 'list').mockResolvedValue(mockList);

    const res = await fetch(`${baseUrl}/api/v1/broadcast-notifications`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const body = (await res.json()) as typeof mockList;
    expect(body.total).toBe(1);
    expect(body.items[0]?.title).toBe('System Maintenance Window');
  });

  it('creates a broadcast notification with 201 Created', async () => {
    vi.spyOn(broadcastNotificationsService, 'create').mockResolvedValue(mockBroadcastDto);

    const res = await fetch(`${baseUrl}/api/v1/broadcast-notifications`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'System Maintenance Window',
        content: 'Scheduled maintenance this Sunday midnight.',
        category: 'System Maintenance',
        target_audience: 'All Users',
        priority: 'Normal',
        channels: ['In-App Inbox'],
        is_draft: true,
      }),
    });

    expect(res.status).toBe(HTTP_STATUS.HTTP_201_CREATED);
    const body = (await res.json()) as { success: boolean; data: typeof mockBroadcastDto };
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('System Maintenance Window');
  });

  it('retrieves single broadcast detail with 200 OK', async () => {
    vi.spyOn(broadcastNotificationsService, 'getById').mockResolvedValue(mockBroadcastDto);

    const res = await fetch(`${baseUrl}/api/v1/broadcast-notifications/${mockBroadcastDto.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const body = (await res.json()) as { success: boolean; data: typeof mockBroadcastDto };
    expect(body.data.id).toBe(mockBroadcastDto.id);
  });

  it('updates broadcast notification with 200 OK', async () => {
    const updated = { ...mockBroadcastDto, title: 'Updated Maintenance Window' };
    vi.spyOn(broadcastNotificationsService, 'update').mockResolvedValue(updated);

    const res = await fetch(`${baseUrl}/api/v1/broadcast-notifications/${mockBroadcastDto.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Updated Maintenance Window' }),
    });

    expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const body = (await res.json()) as { success: boolean; data: typeof mockBroadcastDto };
    expect(body.data.title).toBe('Updated Maintenance Window');
  });

  it('schedules broadcast notification with 200 OK', async () => {
    const future = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const scheduled = { ...mockBroadcastDto, status: 'Scheduled' as const, scheduledAt: future };
    vi.spyOn(broadcastNotificationsService, 'schedule').mockResolvedValue(scheduled);

    const res = await fetch(
      `${baseUrl}/api/v1/broadcast-notifications/${mockBroadcastDto.id}/schedule`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scheduled_at: future }),
      },
    );

    expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const body = (await res.json()) as { success: boolean; data: typeof mockBroadcastDto };
    expect(body.data.status).toBe('Scheduled');
  });

  it('dispatches broadcast notification immediately with 200 OK', async () => {
    const dispatched = { ...mockBroadcastDto, status: 'Sent' as const, sentAt: new Date().toISOString() };
    vi.spyOn(broadcastNotificationsService, 'dispatchNow').mockResolvedValue(dispatched);

    const res = await fetch(
      `${baseUrl}/api/v1/broadcast-notifications/${mockBroadcastDto.id}/dispatch`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );

    expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const body = (await res.json()) as { success: boolean; data: typeof mockBroadcastDto };
    expect(body.data.status).toBe('Sent');
  });

  it('deletes broadcast notification with 200 OK', async () => {
    vi.spyOn(broadcastNotificationsService, 'delete').mockResolvedValue({
      success: true,
      message: 'Broadcast notification deleted successfully',
    });

    const res = await fetch(`${baseUrl}/api/v1/broadcast-notifications/${mockBroadcastDto.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const body = (await res.json()) as { success: boolean; message: string };
    expect(body.success).toBe(true);
  });
});
