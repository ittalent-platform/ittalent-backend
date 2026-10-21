import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationBus } from '../../../src/modules/notifications/notifications.bus.js';
import { NotificationsController } from '../../../src/modules/notifications/notifications.controller.js';
import type { NotificationItemDto } from '../../../src/modules/notifications/notifications.schemas.js';
import type { NotificationsService } from '../../../src/modules/notifications/notifications.service.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';

describe('NotificationsController.streamNotifications (SSE)', () => {
  let bus: NotificationBus;
  let controller: NotificationsController;
  const userId = '507f1f77bcf86cd799439011';

  beforeEach(() => {
    bus = new NotificationBus();
    controller = new NotificationsController({} as NotificationsService, bus);
  });

  it('sets up SSE stream headers and sends initial connected event', () => {
    const req = Object.assign(new EventEmitter(), {
      user: { id: userId },
    });

    const writeHead = vi.fn();
    const write = vi.fn();
    const res = { writeHead, write } as never;

    controller.streamNotifications(req as never, res);

    expect(writeHead).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    expect(write).toHaveBeenCalledWith('event: connected\ndata: {"status":"connected"}\n\n');
  });

  it('streams incoming notification events to connected client', () => {
    const req = Object.assign(new EventEmitter(), {
      user: { id: userId },
    });

    const writeHead = vi.fn();
    const write = vi.fn();
    const res = { writeHead, write } as never;

    controller.streamNotifications(req as never, res);

    const sampleNotification: NotificationItemDto = {
      id: '507f1f77bcf86cd799439099',
      title: 'New Update',
      message: 'Status changed',
      type: 'application_status_changed',
      category: 'info',
      actionUrl: null,
      data: null,
      isRead: false,
      readAt: null,
      createdAt: new Date().toISOString(),
    };

    bus.emitNotification(userId, sampleNotification);

    expect(write).toHaveBeenCalledWith(
      `event: notification\ndata: ${JSON.stringify(sampleNotification)}\n\n`,
    );
  });

  it('unsubscribes and cleans up resources when client disconnects', () => {
    const req = Object.assign(new EventEmitter(), {
      user: { id: userId },
    });

    const writeHead = vi.fn();
    const write = vi.fn();
    const res = { writeHead, write } as never;

    controller.streamNotifications(req as never, res);
    expect(bus.getUserListenerCount(userId)).toBe(1);

    // Simulate client closing connection
    req.emit('close');

    expect(bus.getUserListenerCount(userId)).toBe(0);
  });
});
