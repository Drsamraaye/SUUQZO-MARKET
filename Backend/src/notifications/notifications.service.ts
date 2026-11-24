import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { NotificationChannel } from '@prisma/client';

export interface SendNotificationParams {
  userId: string;
  title: string;
  body: string;
  channel?: NotificationChannel;
  data?: Record<string, any> | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persists an in-app notification and dispatches to development/external channel adapter.
   */
  async send(params: SendNotificationParams) {
    const channel = params.channel || NotificationChannel.IN_APP;

    const notification = await this.prisma.notification.create({
      data: {
        userId: params.userId,
        title: params.title,
        body: params.body,
        channel,
        data: params.data ?? undefined,
      },
    });

    // Development adapter dispatch log
    this.logger.log(
      `[Notification Dispatched] [${channel}] To User: ${params.userId} - "${params.title}" - ${params.body}`,
    );

    return notification;
  }

  /**
   * Lists notifications for a given user.
   */
  async listForUser(userId: string, page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const [total, unreadCount, items] = await Promise.all([
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
      this.prisma.notification.findMany({
        where: { userId },
        skip,
        take: safeLimit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      items,
      unreadCount,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  /**
   * Marks a notification as read.
   */
  async markAsRead(notificationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Marks all notifications as read for a user.
   */
  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }
}
