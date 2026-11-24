import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import crypto from 'node:crypto';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new user session linked to an authenticated device.
   */
  async createSession(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ id: string; sessionToken: string; expiresAt: Date }> {
    const rawSessionToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawSessionToken).digest('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30-day session

    const session = await this.prisma.userSession.create({
      data: {
        userId,
        tokenHash,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        expiresAt,
        isRevoked: false,
      },
    });

    return {
      id: session.id,
      sessionToken: rawSessionToken,
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Validates a session by ID and updates lastActiveAt timestamp.
   */
  async validateSession(sessionId: string): Promise<boolean> {
    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.isRevoked || session.expiresAt < new Date()) {
      return false;
    }

    // Update last activity periodically (fire-and-forget)
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { lastActiveAt: new Date() },
    });

    return true;
  }

  /**
   * Lists all active sessions for a user.
   */
  async listUserSessions(userId: string, currentSessionId?: string) {
    const sessions = await this.prisma.userSession.findMany({
      where: {
        userId,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        lastActiveAt: true,
        expiresAt: true,
      },
      orderBy: { lastActiveAt: 'desc' },
    });

    return sessions.map((s) => ({
      ...s,
      isCurrent: s.id === currentSessionId,
    }));
  }

  /**
   * Revokes a specific session owned by the authenticated user.
   */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found.');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('You cannot revoke another user session.');
    }

    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { isRevoked: true },
    });
  }

  /**
   * Revokes all active sessions for a user (logout all devices).
   */
  async revokeAllUserSessions(userId: string): Promise<number> {
    const result = await this.prisma.userSession.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });

    // Also revoke all refresh tokens for this user
    await this.prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });

    return result.count;
  }
}
