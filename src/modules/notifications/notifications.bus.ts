import { EventEmitter } from 'node:events';

import type { NotificationItemDto } from './notifications.schemas.js';

export class NotificationBus extends EventEmitter {
  private static getChannel(userId: string): string {
    return `notification:${userId}`;
  }

  emitNotification(userId: string, notification: NotificationItemDto): boolean {
    return this.emit(NotificationBus.getChannel(userId), notification);
  }

  subscribeUser(userId: string, listener: (notification: NotificationItemDto) => void): () => void {
    const channel = NotificationBus.getChannel(userId);
    this.on(channel, listener);
    return () => {
      this.off(channel, listener);
    };
  }

  getUserListenerCount(userId: string): number {
    return this.listenerCount(NotificationBus.getChannel(userId));
  }
}

export const notificationBus = new NotificationBus();
