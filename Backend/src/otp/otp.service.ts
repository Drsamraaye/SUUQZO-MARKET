import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { OtpPurpose } from '@prisma/client';
import crypto from 'node:crypto';

export interface SendOtpOptions {
  target: string; // phone or email
  purpose: OtpPurpose;
}

export interface VerifyOtpOptions {
  target: string;
  purpose: OtpPurpose;
  code: string;
}

export interface SmsProvider {
  sendSms(to: string, message: string): Promise<boolean>;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly otpTtlMinutes = 5;
  private readonly resendCooldownSeconds = 60;
  private readonly maxAttempts = 5;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Hashes an OTP code for safe storage in the database.
   */
  private hashOtp(target: string, code: string, purpose: string): string {
    return crypto
      .createHash('sha256')
      .update(`${target}:${purpose}:${code}`)
      .digest('hex');
  }

  /**
   * Generates and dispatches a cryptographically secure 6-digit numeric OTP.
   */
  async sendOtp(options: SendOtpOptions): Promise<{ success: boolean; resendAfterSeconds: number }> {
    const { target, purpose } = options;
    const now = new Date();

    // Check existing active OTP for cooldown
    const activeOtp = await this.prisma.otpVerification.findFirst({
      where: {
        target,
        purpose,
        isConsumed: false,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (activeOtp && activeOtp.resendAfter > now) {
      const waitTime = Math.ceil((activeOtp.resendAfter.getTime() - now.getTime()) / 1000);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'OTP_COOLDOWN',
          message: `Please wait ${waitTime} seconds before requesting a new OTP.`,
          retryAfter: waitTime,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Invalidate any prior active OTPs for this target & purpose
    await this.prisma.otpVerification.updateMany({
      where: {
        target,
        purpose,
        isConsumed: false,
      },
      data: { isConsumed: true },
    });

    // Generate cryptographically secure 6-digit numeric code: 100000 - 999999
    const rawOtp = crypto.randomInt(100000, 1000000).toString();
    const codeHash = this.hashOtp(target, rawOtp, purpose);

    const expiresAt = new Date(now.getTime() + this.otpTtlMinutes * 60 * 1000);
    const resendAfter = new Date(now.getTime() + this.resendCooldownSeconds * 1000);

    await this.prisma.otpVerification.create({
      data: {
        target,
        purpose,
        codeHash,
        attempts: 0,
        maxAttempts: this.maxAttempts,
        expiresAt,
        resendAfter,
        isConsumed: false,
      },
    });

    // Development / mock SMS & Email logging (Never expose OTP in client responses)
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`[DEV OTP DISPATCH] Target: ${target} | Purpose: ${purpose} | Code: ${rawOtp}`);
    }

    return {
      success: true,
      resendAfterSeconds: this.resendCooldownSeconds,
    };
  }

  /**
   * Verifies an OTP code with single-use guarantee and attempt limits.
   */
  async verifyOtp(options: VerifyOtpOptions): Promise<boolean> {
    const { target, purpose, code } = options;
    const now = new Date();

    const otpRecord = await this.prisma.otpVerification.findFirst({
      where: {
        target,
        purpose,
        isConsumed: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new BadRequestException('No active OTP found. Please request a new code.');
    }

    if (otpRecord.expiresAt < now) {
      await this.prisma.otpVerification.update({
        where: { id: otpRecord.id },
        data: { isConsumed: true },
      });
      throw new BadRequestException('OTP code has expired. Please request a new one.');
    }

    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      await this.prisma.otpVerification.update({
        where: { id: otpRecord.id },
        data: { isConsumed: true },
      });
      throw new BadRequestException('Maximum verification attempts exceeded. Please request a new OTP.');
    }

    const calculatedHash = this.hashOtp(target, code, purpose);
    const isMatch = crypto.timingSafeEqual(
      Buffer.from(calculatedHash, 'utf-8'),
      Buffer.from(otpRecord.codeHash, 'utf-8'),
    );

    if (!isMatch) {
      const updatedAttempts = otpRecord.attempts + 1;
      await this.prisma.otpVerification.update({
        where: { id: otpRecord.id },
        data: { attempts: updatedAttempts },
      });
      const remaining = otpRecord.maxAttempts - updatedAttempts;
      throw new BadRequestException(
        remaining > 0
          ? `Invalid OTP code. ${remaining} attempts remaining.`
          : 'Invalid OTP code. Maximum attempts reached.',
      );
    }

    // Single-use: consume successfully verified OTP
    await this.prisma.otpVerification.update({
      where: { id: otpRecord.id },
      data: {
        isConsumed: true,
        consumedAt: now,
      },
    });

    return true;
  }
}
