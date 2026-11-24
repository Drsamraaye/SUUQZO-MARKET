import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TwoFactorService } from '../../src/two-factor/two-factor.service.js';
import { PasswordService } from '../../src/security/password.service.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { UnauthorizedException } from '@nestjs/common';

const prismaMock = {
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
};

describe('TwoFactorService (unit)', () => {
  let service: TwoFactorService;
  let passwordService: PasswordService;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.TWO_FACTOR_ENCRYPTION_KEY = 'test-32-byte-key-for-unit-tests!!';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        PasswordService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<TwoFactorService>(TwoFactorService);
    passwordService = module.get<PasswordService>(PasswordService);
  });

  describe('enroll()', () => {
    it('should return an otpauthUrl and secret', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: null,
        phone: '+1234567890',
        twoFactorEnabled: false,
        twoFactorSecret: null,
      });
      prismaMock.user.update.mockResolvedValue({});

      const result = await service.enroll('user-1');

      expect(result).toHaveProperty('otpauthUrl');
      expect(result).toHaveProperty('secret');
      expect(result.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
      expect(result.secret.length).toBeGreaterThan(10);
    });
  });

  describe('disable()', () => {
    it('should reject disable with wrong password', async () => {
      const hash = await passwordService.hash('CorrectP@ssw0rd!');
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        twoFactorEnabled: true,
        passwordHash: hash,
      });

      await expect(service.disable('user-1', 'WrongP@ssw0rd!')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should disable 2FA with the correct password', async () => {
      const hash = await passwordService.hash('CorrectP@ssw0rd!');
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        twoFactorEnabled: true,
        passwordHash: hash,
      });
      prismaMock.user.update.mockResolvedValue({});

      const result = await service.disable('user-1', 'CorrectP@ssw0rd!');
      expect(result).toBe(true);
    });
  });
});
