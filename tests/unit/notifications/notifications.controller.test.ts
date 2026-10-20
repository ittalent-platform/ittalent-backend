import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationsController } from '../../../src/modules/notifications/notifications.controller.js';
import type { NotificationsService } from '../../../src/modules/notifications/notifications.service.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';

describe('NotificationsController', () => {
  let mockService: Partial<NotificationsService>;
  let controller: NotificationsController;

  const userId = '507f1f77bcf86cd799439011';
  const notificationId = '507f1f77bcf86cd799439022';

  beforeEach(() => {
    mockService = {
      listMine: vi.fn(),
      getUnreadCount: vi.fn(),
      markAllAsRead: vi.fn(),
      markOneAsRead: vi.fn(),
      deleteNotification: vi.fn(),
      deleteAllNotifications: vi.fn(),
      registerDeviceToken: vi.fn(),
      unregisterDeviceToken: vi.fn(),
    };
    controller = new NotificationsController(mockService as NotificationsService);
  });

  it('listMine delegates to service and returns 200 with JSON', async () => {
    const mockList = { items: [], unreadCount: 0, page: 1, limit: 20, total: 0, totalPages: 0 };
    (mockService.listMine as any).mockResolvedValue(mockList);

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const next = vi.fn();

    await controller.listMine(
      { user: { id: userId }, query: {} } as any,
      { status, locals: { validated: { query: { page: 1, limit: 20 } } } } as any,
      next,
    );

    expect(mockService.listMine).toHaveBeenCalledWith(userId, { page: 1, limit: 20 });
    expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
    expect(json).toHaveBeenCalledWith(mockList);
    expect(next).not.toHaveBeenCalled();
  });

  it('getUnreadCount delegates to service and returns 200', async () => {
    (mockService.getUnreadCount as any).mockResolvedValue({ unreadCount: 3 });

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const next = vi.fn();

    await controller.getUnreadCount(
      { user: { id: userId } } as any,
      { status, locals: {} } as any,
      next,
    );

    expect(mockService.getUnreadCount).toHaveBeenCalledWith(userId);
    expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
    expect(json).toHaveBeenCalledWith({ unreadCount: 3 });
  });

  it('markAllAsRead delegates to service and returns 200', async () => {
    const mockRes = { updatedCount: 2, unreadCount: 0, message: 'All notifications marked as read' };
    (mockService.markAllAsRead as any).mockResolvedValue(mockRes);

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const next = vi.fn();

    await controller.markAllAsRead(
      { user: { id: userId } } as any,
      { status, locals: {} } as any,
      next,
    );

    expect(mockService.markAllAsRead).toHaveBeenCalledWith(userId);
    expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
    expect(json).toHaveBeenCalledWith(mockRes);
  });

  it('markOneAsRead delegates to service and returns 200', async () => {
    const mockItem = { id: notificationId, isRead: true };
    (mockService.markOneAsRead as any).mockResolvedValue(mockItem);

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const next = vi.fn();

    await controller.markOneAsRead(
      { user: { id: userId }, params: { id: notificationId } } as any,
      { status, locals: { validated: { params: { id: notificationId } } } } as any,
      next,
    );

    expect(mockService.markOneAsRead).toHaveBeenCalledWith(userId, notificationId);
    expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
    expect(json).toHaveBeenCalledWith(mockItem);
  });

  it('deleteNotification delegates to service and returns 200', async () => {
    const mockRes = { success: true, message: 'Notification deleted successfully' };
    (mockService.deleteNotification as any).mockResolvedValue(mockRes);

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const next = vi.fn();

    await controller.deleteNotification(
      { user: { id: userId }, params: { id: notificationId } } as any,
      { status, locals: { validated: { params: { id: notificationId } } } } as any,
      next,
    );

    expect(mockService.deleteNotification).toHaveBeenCalledWith(userId, notificationId);
    expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
    expect(json).toHaveBeenCalledWith(mockRes);
  });

  it('deleteAllNotifications delegates to service and returns 200', async () => {
    const mockRes = { deletedCount: 5, message: 'All notifications deleted successfully' };
    (mockService.deleteAllNotifications as any).mockResolvedValue(mockRes);

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const next = vi.fn();

    await controller.deleteAllNotifications(
      { user: { id: userId } } as any,
      { status, locals: {} } as any,
      next,
    );

    expect(mockService.deleteAllNotifications).toHaveBeenCalledWith(userId);
    expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
    expect(json).toHaveBeenCalledWith(mockRes);
  });

  it('registerDeviceToken delegates to service and returns 204', async () => {
    (mockService.registerDeviceToken as any).mockResolvedValue(undefined);

    const send = vi.fn();
    const status = vi.fn().mockReturnValue({ send });
    const next = vi.fn();

    await controller.registerDeviceToken(
      { user: { id: userId }, body: { token: 't1', platform: 'ios' } } as any,
      { status, locals: { validated: { body: { token: 't1', platform: 'ios' } } } } as any,
      next,
    );

    expect(mockService.registerDeviceToken).toHaveBeenCalledWith(userId, { token: 't1', platform: 'ios' });
    expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_204_NO_CONTENT);
    expect(send).toHaveBeenCalled();
  });

  it('unregisterDeviceToken delegates to service and returns 204', async () => {
    (mockService.unregisterDeviceToken as any).mockResolvedValue(true);

    const send = vi.fn();
    const status = vi.fn().mockReturnValue({ send });
    const next = vi.fn();

    await controller.unregisterDeviceToken(
      { user: { id: userId }, params: { token: 't1' } } as any,
      { status, locals: { validated: { params: { token: 't1' } } } } as any,
      next,
    );

    expect(mockService.unregisterDeviceToken).toHaveBeenCalledWith(userId, 't1');
    expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_204_NO_CONTENT);
    expect(send).toHaveBeenCalled();
  });

  it('forwards exceptions to next', async () => {
    const error = new Error('Database failure');
    (mockService.listMine as any).mockRejectedValue(error);

    const next = vi.fn();

    await controller.listMine(
      { user: { id: userId }, query: {} } as any,
      { status: vi.fn(), locals: {} } as any,
      next,
    );

    expect(next).toHaveBeenCalledWith(error);
  });
});
