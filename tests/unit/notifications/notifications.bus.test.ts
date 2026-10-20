import { describe, expect, it, vi } from 'vitest';

import { NotificationBus } from '../../../src/modules/notifications/notifications.bus.js';
import type { NotificationItemDto } from '../../../src/modules/notifications/notifications.schemas.js';

describe('NotificationBus (In-Memory Real-Time Event Bus)', () => {
  const sampleNotification: NotificationItemDto = {
    id: '507f1f77bcf86cd799439011',
    title: 'Test Notification',
    message: 'Hello World',
    type: 'account_alert',
    category: 'info',
    actionUrl: null,
    data: null,
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString(),
  };

  it('delivers notification to subscribed user listener', () => {
    const bus = new NotificationBus();
    const userId = 'user-123';
    const listener = vi.fn();

    const unsubscribe = bus.subscribeUser(userId, listener);
    expect(bus.getUserListenerCount(userId)).toBe(1);

    bus.emitNotification(userId, sampleNotification);

    expect(listener).toHaveBeenCalledWith(sampleNotification);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(bus.getUserListenerCount(userId)).toBe(0);
  });

  it('isolates user channels so user B does not receive user A notifications', () => {
    const bus = new NotificationBus();
    const userA = 'user-alice';
    const userB = 'user-bob';

    const listenerA = vi.fn();
    const listenerB = vi.fn();

    bus.subscribeUser(userA, listenerA);
    bus.subscribeUser(userB, listenerB);

    bus.emitNotification(userA, sampleNotification);

    expect(listenerA).toHaveBeenCalledWith(sampleNotification);
    expect(listenerB).not.toHaveBeenCalled();
  });

  it('detaches listener when unsubscribe function is called', () => {
    const bus = new NotificationBus();
    const userId = 'user-unsubscribe-test';
    const listener = vi.fn();

    const unsubscribe = bus.subscribeUser(userId, listener);
    unsubscribe();

    bus.emitNotification(userId, sampleNotification);

    expect(listener).not.toHaveBeenCalled();
  });
});
