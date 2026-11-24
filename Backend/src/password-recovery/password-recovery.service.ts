import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { PasswordService } from '../security/password.service.js';
import { SessionsService } from '../sessions/sessions.service.js';
import crypto from 'node:crypto';

@Injectable()
export class PasswordRecoveryService {
  private readonly tokenExpiryMinutes = 15;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly sessionsService: SessionsService,
  ) {}

  /**
   * Generates a single-use password reset token for a user.
   */
  async createPasswordResetToken(
    identifier: string,
  ): Promise<{ token: string; expiresAt: Date } | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: identifier }],
      },
    });

    // Enumeration-resistant: return null if user does not exist
    if (!user) {
      return null;
    }

    // Invalidate existing unused reset tokens for this user
    await this.prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        isConsumed: false,
      },
      data: { isConsumed: true },
    });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + this.tokenExpiryMinutes * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        isConsumed: false,
      },
    });

    return { token: rawToken, expiresAt };
  }

  /**
   * Resets a forgotten password using a single-use token.
   */
  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = new Date();

    const resetRecord = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        isConsumed: false,
        expiresAt: { gt: now },
      },
      include: { user: true },
    });

    if (!resetRecord) {
      throw new BadRequestException('Password reset token is invalid or has expired.');
    }

    // Validate new password strength and hash with Argon2id
    this.passwordService.validateStrengthOrThrow(newPassword);
    const passwordHash = await this.passwordService.hash(newPassword);

    await this.prisma.$transaction(async (tx) => {
      // 1. Consume token
      await tx.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: {
          isConsumed: true,
          consumedAt: now,
        },
      });

      // 2. Update user password and reset lockout/failed attempts
      await tx.user.update({
        where: { id: resetRecord.userId },
        data: {
          passwordHash,
          failedLoginAttempts: 0,
          lockoutUntil: null,
        },
      });
    }, { timeout: 30000, maxWait: 10000 });

    // 3. Security: Invalidate all sessions on password reset
    await this.sessionsService.revokeAllUserSessions(resetRecord.userId);

    return true;
  }

  /**
   * Changes the password for an authenticated user verifying the old password.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.passwordHash) {
      throw new NotFoundException('User credentials not configured.');
    }

    const isMatch = await this.passwordService.verify(user.passwordHash, currentPassword);
    if (!isMatch) {
      throw new UnauthorizedException('Current password does not match.');
    }

    this.passwordService.validateStrengthOrThrow(newPassword);
    const newPasswordHash = await this.passwordService.hash(newPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    return true;
  }
}
