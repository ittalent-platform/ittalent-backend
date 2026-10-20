import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationsController } from '../../../src/modules/notifications/notifications.controller.js';
import type { NotificationsService } from '../../../src/modules/notifications/notifications.service.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';

describe('NotificationsController', () => {
  let mockService: {
    listMine: ReturnType<typeof vi.fn>;
    getUnreadCount: ReturnType<typeof vi.fn>;
    markAllAsRead: ReturnType<typeof vi.fn>;
    markOneAsRead: ReturnType<typeof vi.fn>;
    deleteNotification: ReturnType<typeof vi.fn>;
    deleteAllNotifications: ReturnType<typeof vi.fn>;
    registerDeviceToken: ReturnType<typeof vi.fn>;
    unregisterDeviceToken: ReturnType<typeof vi.fn>;
  };
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
    controller = new NotificationsController(mockService as unknown as NotificationsService);
  });

  it('listMine delegates to service and returns 200 with JSON', async () => {
    const mockList = { items: [], unreadCount: 0, page: 1, limit: 20, total: 0, totalPages: 0 };
    mockService.listMine.mockResolvedValue(mockList);

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const next = vi.fn();

    await controller.listMine(
      { user: { id: userId }, query: {} } as never,
      { status, locals: { validated: { query: { page: 1, limit: 20 } } } } as never,
      next,
    );

    expect(mockService.listMine).toHaveBeenCalledWith(userId, { page: 1, limit: 20 });
    expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
    expect(json).toHaveBeenCalledWith(mockList);
    expect(next).not.toHaveBeenCalled();
  });

  it('getUnreadCount delegates to service and returns 200', async () => {
    mockService.getUnreadCount.mockResolvedValue({ unreadCount: 3 });

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const next = vi.fn();

    await controller.getUnreadCount(
      { user: { id: userId } } as never,
      { status, locals: {} } as never,
      next,
    );

    expect(mockService.getUnreadCount).toHaveBeenCalledWith(userId);
    expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
    expect(json).toHaveBeenCalledWith({ unreadCount: 3 });
  });

  it('markAllAsRead delegates to service and returns 200', async () => {
    const mockRes = { updatedCount: 2, unreadCount: 0, message: 'All notifications marked as read' };
    mockService.markAllAsRead.mockResolvedValue(mockRes);

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const next = vi.fn();

    await controller.markAllAsRead(
      { user: { id: userId } } as never,
      { status, locals: {} } as never,
      next,
    );

    expect(mockService.markAllAsRead).toHaveBeenCalledWith(userId);
    expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
    expect(json).toHaveBeenCalledWith(mockRes);
  });

  it('markOneAsRead delegates to service and returns 200', async () => {
    const mockItem = { id: notificationId, isRead: true };
    mockService.markOneAsRead.mockResolvedValue(mockItem);

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const next = vi.fn();

    await controller.markOneAsRead(
      { user: { id: userId }, params: { id: notificationId } } as never,
      { status, locals: { validated: { params: { id: notificationId } } } } as never,
      next,
    );

    expect(mockService.markOneAsRead).toHaveBeenCalledWith(userId, notificationId);
    expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
    expect(json).toHaveBeenCalledWith(mockItem);
  });

  it('deleteNotification delegates to service and returns 200', async () => {
    const mockRes = { success: true, message: 'Notification deleted successfully' };
    mockService.deleteNotification.mockResolvedValue(mockRes);

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const next = vi.fn();

    await controller.deleteNotification(
      { user: { id: userId }, params: { id: notificationId } } as never,
      { status, locals: { validated: { params: { id: notificationId } } } } as never,
      next,
    );

    expect(mockService.deleteNotification).toHaveBeenCalledWith(userId, notificationId);
    expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
    expect(json).toHaveBeenCalledWith(mockRes);
  });

  it('deleteAllNotifications delegates to service and returns 200', async () => {
    const mockRes = { deletedCount: 5, message: 'All notifications deleted successfully' };
    mockService.deleteAllNotifications.mockResolvedValue(mockRes);

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const next = vi.fn();

    await controller.deleteAllNotifications(
      { user: { id: userId } } as never,
      { status, locals: {} } as never,
      next,
    );

    expect(mockService.deleteAllNotifications).toHaveBeenCalledWith(userId);
    expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
    expect(json).toHaveBeenCalledWith(mockRes);
  });

  it('registerDeviceToken delegates to service and returns 204', async () => {
    mockService.registerDeviceToken.mockResolvedValue(undefined);

    const send = vi.fn();
    const status = vi.fn().mockReturnValue({ send });
    const next = vi.fn();

    await controller.registerDeviceToken(
      { user: { id: userId }, body: { token: 't1', platform: 'ios' } } as never,
      { status, locals: { validated: { body: { token: 't1', platform: 'ios' } } } } as never,
      next,
    );

    expect(mockService.registerDeviceToken).toHaveBeenCalledWith(userId, { token: 't1', platform: 'ios' });
    expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_204_NO_CONTENT);
    expect(send).toHaveBeenCalled();
  });

  it('unregisterDeviceToken delegates to service and returns 204', async () => {
    mockService.unregisterDeviceToken.mockResolvedValue(true);

    const send = vi.fn();
    const status = vi.fn().mockReturnValue({ send });
    const next = vi.fn();

    await controller.unregisterDeviceToken(
      { user: { id: userId }, params: { token: 't1' } } as never,
      { status, locals: { validated: { params: { token: 't1' } } } } as never,
      next,
    );

    expect(mockService.unregisterDeviceToken).toHaveBeenCalledWith(userId, 't1');
    expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_204_NO_CONTENT);
    expect(send).toHaveBeenCalled();
  });

  it('forwards exceptions to next', async () => {
    const error = new Error('Database failure');
    mockService.listMine.mockRejectedValue(error);

    const next = vi.fn();

    await controller.listMine(
      { user: { id: userId }, query: {} } as never,
      { status: vi.fn(), locals: {} } as never,
      next,
    );

    expect(next).toHaveBeenCalledWith(error);
  });
});
