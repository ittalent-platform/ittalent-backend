import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { app } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { notificationsService } from '../../src/modules/notifications/notifications.service.js';
import { HTTP_STATUS } from '../../src/shared/constants/http-status.js';

describe('Notifications API Routes (Integration)', () => {
  let server: Server;
  let baseUrl: string;
  let userToken: string;
  const fixtureUserId = new Types.ObjectId().toString();

  beforeAll(async () => {
    userToken = jwt.sign(
      { sub: fixtureUserId, email: 'noti_user@example.com', role: 'applicant' },
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
    const res = await fetch(`${baseUrl}/api/v1/notifications`);
    expect(res.status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
  });

  it('rejects invalid or expired token with 401', async () => {
    const res = await fetch(`${baseUrl}/api/v1/notifications`, {
      headers: { Authorization: 'Bearer invalid.token.payload' },
    });
    expect(res.status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
  });

  it('returns 200 and delegates to service for authenticated listMine (UC-S2-NOTI-01)', async () => {
    const mockList = { items: [], unreadCount: 0, page: 1, limit: 20, total: 0, totalPages: 0 };
    vi.spyOn(notificationsService, 'listMine').mockResolvedValue(mockList);

    const res = await fetch(`${baseUrl}/api/v1/notifications`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const body = (await res.json()) as typeof mockList;
    expect(body).toEqual(mockList);
    expect(notificationsService.listMine).toHaveBeenCalledWith(fixtureUserId, expect.objectContaining({ page: 1, limit: 20 }));
  });

  it('returns 200 on unread-count endpoint', async () => {
    vi.spyOn(notificationsService, 'getUnreadCount').mockResolvedValue({ unreadCount: 5 });

    const res = await fetch(`${baseUrl}/api/v1/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const body = (await res.json()) as { unreadCount: number };
    expect(body.unreadCount).toBe(5);
    expect(notificationsService.getUnreadCount).toHaveBeenCalledWith(fixtureUserId);
  });

  it('returns 200 on mark-all-as-read (UC-S2-NOTI-02)', async () => {
    const mockResult = { updatedCount: 3, unreadCount: 0 as const, message: 'All notifications marked as read' };
    vi.spyOn(notificationsService, 'markAllAsRead').mockResolvedValue(mockResult);

    const res = await fetch(`${baseUrl}/api/v1/notifications/read-all`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const body = (await res.json()) as typeof mockResult;
    expect(body).toEqual(mockResult);
    expect(notificationsService.markAllAsRead).toHaveBeenCalledWith(fixtureUserId);
  });

  it('rejects malformed notification ID with 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/notifications/not-an-id`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
  });

  it('returns 200 on deleteNotification with valid ID (UC-S2-NOTI-03)', async () => {
    const validId = new Types.ObjectId().toString();
    vi.spyOn(notificationsService, 'deleteNotification').mockResolvedValue({
      success: true,
      message: 'Notification deleted successfully',
    });

    const res = await fetch(`${baseUrl}/api/v1/notifications/${validId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(notificationsService.deleteNotification).toHaveBeenCalledWith(fixtureUserId, validId);
  });

  it('returns 200 on deleteAllNotifications (UC-S2-NOTI-04)', async () => {
    vi.spyOn(notificationsService, 'deleteAllNotifications').mockResolvedValue({
      deletedCount: 4,
      message: 'All notifications deleted successfully',
    });

    const res = await fetch(`${baseUrl}/api/v1/notifications`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(notificationsService.deleteAllNotifications).toHaveBeenCalledWith(fixtureUserId);
  });
});
