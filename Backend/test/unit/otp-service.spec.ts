import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { OtpService } from '../../src/otp/otp.service.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { BadRequestException } from '@nestjs/common';

// ─── Prisma Mock ─────────────────────────────────────────────────────────────
const mockOtpRecord = {
  id: 'otp-1',
  target: '+1234567890',
  purpose: 'PHONE_VERIFICATION',
  codeHash: '',
  attempts: 0,
  maxAttempts: 5,
  expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  isConsumed: false,
  consumedAt: null,
  resendAfter: new Date(Date.now() - 1000),
  createdAt: new Date(),
};

const prismaMock = {
  otpVerification: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
};

describe('OtpService (unit, mocked prisma)', () => {
  let service: OtpService;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<OtpService>(OtpService);
  });

  describe('sendOtp()', () => {
    it('should create an OTP record and return success', async () => {
      prismaMock.otpVerification.findFirst.mockResolvedValue(null);
      prismaMock.otpVerification.create.mockResolvedValue({
        ...mockOtpRecord,
        resendAfter: new Date(Date.now() + 60_000),
      });

      const result = await service.sendOtp({
        target: '+1234567890',
        purpose: 'PHONE_VERIFICATION' as any,
      });

      expect(result.success).toBe(true);
      expect(typeof result.resendAfterSeconds).toBe('number');
      expect(prismaMock.otpVerification.create).toHaveBeenCalled();
    });

    it('should respect resend cooldown (throws HTTP 429)', async () => {
      const futureResend = new Date(Date.now() + 50_000);
      prismaMock.otpVerification.findFirst.mockResolvedValue({
        ...mockOtpRecord,
        isConsumed: false,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        resendAfter: futureResend,
      });

      await expect(
        service.sendOtp({ target: '+1234567890', purpose: 'PHONE_VERIFICATION' as any }),
      ).rejects.toMatchObject({ status: 429, response: { error: 'OTP_COOLDOWN' } });
    });
  });

  describe('verifyOtp()', () => {
    it('should verify a correct OTP code', async () => {
      const { createHash } = await import('node:crypto');
      const code = '123456';
      const codeHash = createHash('sha256')
        .update(`+1234567890:PHONE_VERIFICATION:${code}`)
        .digest('hex');

      prismaMock.otpVerification.findFirst.mockResolvedValue({
        ...mockOtpRecord,
        codeHash,
        attempts: 0,
        maxAttempts: 5,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        isConsumed: false,
      });
      prismaMock.otpVerification.update.mockResolvedValue({});

      const result = await service.verifyOtp({
        target: '+1234567890',
        purpose: 'PHONE_VERIFICATION' as any,
        code,
      });

      expect(result).toBe(true);
    });

    it('should reject a wrong OTP code and increment attempts', async () => {
      const { createHash } = await import('node:crypto');
      const realCode = '654321';
      const codeHash = createHash('sha256')
        .update(`+1234567890:PHONE_VERIFICATION:${realCode}`)
        .digest('hex');

      prismaMock.otpVerification.findFirst.mockResolvedValue({
        ...mockOtpRecord,
        codeHash,
        attempts: 0,
        maxAttempts: 5,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        isConsumed: false,
      });
      prismaMock.otpVerification.update.mockResolvedValue({});

      await expect(
        service.verifyOtp({
          target: '+1234567890',
          purpose: 'PHONE_VERIFICATION' as any,
          code: '000000',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.otpVerification.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ attempts: 1 }) }),
      );
    });

    it('should reject an expired OTP', async () => {
      prismaMock.otpVerification.findFirst.mockResolvedValue({
        ...mockOtpRecord,
        expiresAt: new Date(Date.now() - 1000),
        isConsumed: false,
      });

      await expect(
        service.verifyOtp({
          target: '+1234567890',
          purpose: 'PHONE_VERIFICATION' as any,
          code: '111111',
        }),
      ).rejects.toThrow();
    });

    it('should reject when no active OTP record exists (consumed or never sent)', async () => {
      prismaMock.otpVerification.findFirst.mockResolvedValue(null);

      await expect(
        service.verifyOtp({
          target: '+1234567890',
          purpose: 'PHONE_VERIFICATION' as any,
          code: '111111',
        }),
      ).rejects.toThrow();
    });
  });
});
