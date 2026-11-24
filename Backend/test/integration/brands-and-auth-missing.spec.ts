import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../src/database/prisma.module.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { BrandsModule } from '../../src/brands/brands.module.js';
import { BrandsController } from '../../src/brands/brands.controller.js';
import { BrandsService } from '../../src/brands/brands.service.js';
import { AuthModule } from '../../src/auth/auth.module.js';
import { AuthController } from '../../src/auth/auth.controller.js';
import { AuthService } from '../../src/auth/auth.service.js';
import { UsersModule } from '../../src/users/users.module.js';
import { SecurityModule } from '../../src/security/security.module.js';
import { SessionsModule } from '../../src/sessions/sessions.module.js';
import { OtpModule } from '../../src/otp/otp.module.js';
import { TwoFactorModule } from '../../src/two-factor/two-factor.module.js';
import { PasswordRecoveryModule } from '../../src/password-recovery/password-recovery.module.js';
import { AuditLogsModule } from '../../src/audit-logs/audit-logs.module.js';
import { NotificationsModule } from '../../src/notifications/notifications.module.js';
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RegisterRole } from '../../src/auth/dto/register.dto.js';

describe('Phase 02–05: Missing Endpoints Verification Suite (Brands & Auth)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let brandsController: BrandsController;
  let brandsService: BrandsService;
  let authController: AuthController;
  let authService: AuthService;

  const testSuffix = Date.now().toString().slice(-6);
  let createdBrandId: string;
  let testUserId: string;
  let initialPassword = 'InitialP@ss1!';
  let newPassword = 'UpdatedP@ssw0rd99!';
  let userPhone = `+25261${Math.floor(1000000 + Math.random() * 9000000)}`;
  let userEmail = `auth_test_${testSuffix}@suuqzo.test`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        PrismaModule,
        AuditLogsModule,
        NotificationsModule,
        SecurityModule,
        SessionsModule,
        UsersModule,
        OtpModule,
        TwoFactorModule,
        PasswordRecoveryModule,
        AuthModule,
        BrandsModule,
      ],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    brandsController = moduleRef.get<BrandsController>(BrandsController);
    brandsService = moduleRef.get<BrandsService>(BrandsService);
    authController = moduleRef.get<AuthController>(AuthController);
    authService = moduleRef.get<AuthService>(AuthService);

    await moduleRef.init();

    // Register test user for Auth tests
    const regRes = await authService.register({
      phone: userPhone,
      email: userEmail,
      password: initialPassword,
      role: RegisterRole.CUSTOMER,
      firstName: 'BrandAuth',
      lastName: 'Tester',
    });
    testUserId = regRes.userId;

    // Activate user
    await prisma.user.update({
      where: { id: testUserId },
      data: { status: 'ACTIVE', isPhoneVerified: true },
    });
  }, 40000);

  afterAll(async () => {
    if (prisma) {
      if (createdBrandId) {
        await prisma.brand.deleteMany({ where: { id: createdBrandId } });
      }
      if (testUserId) {
        await prisma.userSession.deleteMany({ where: { userId: testUserId } });
        await prisma.refreshToken.deleteMany({ where: { userId: testUserId } });
        await prisma.passwordResetToken.deleteMany({ where: { userId: testUserId } });
        await prisma.customerProfile.deleteMany({ where: { userId: testUserId } });
        await prisma.user.deleteMany({ where: { id: testUserId } });
      }
    }
    if (moduleRef) {
      await moduleRef.close();
    }
  }, 30000);

  // =========================================================================
  // BRANDS ENDPOINTS (4 Endpoints)
  // =========================================================================
  describe('Brands Endpoints Verification', () => {
    it('1. POST /api/v1/brands — should create a new brand with generated or custom slug', async () => {
      const created = await brandsController.createBrand({
        name: `Brand Alpha ${testSuffix}`,
        slug: `brand-alpha-${testSuffix}`,
        logoUrl: 'https://example.com/logo-alpha.png',
      });

      expect(created).toBeDefined();
      expect(created.name).toBe(`Brand Alpha ${testSuffix}`);
      expect(created.slug).toBe(`brand-alpha-${testSuffix}`);
      expect(created.logoUrl).toBe('https://example.com/logo-alpha.png');
      createdBrandId = created.id;

      // Persistence check in DB
      const dbRecord = await prisma.brand.findUnique({ where: { id: created.id } });
      expect(dbRecord).not.toBeNull();
      expect(dbRecord?.slug).toBe(`brand-alpha-${testSuffix}`);
    });

    it('2. POST /api/v1/brands — should reject duplicate custom slug with ConflictException', async () => {
      await expect(
        brandsController.createBrand({
          name: `Duplicate Brand ${testSuffix}`,
          slug: `brand-alpha-${testSuffix}`,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('3. GET /api/v1/brands — should list brands with product count', async () => {
      const brands = await brandsController.getBrands();
      expect(Array.isArray(brands)).toBe(true);
      const found = brands.find((b) => b.id === createdBrandId);
      expect(found).toBeDefined();
      expect(found?._count).toBeDefined();
    });

    it('4. GET /api/v1/brands/:id — should retrieve brand by ID', async () => {
      const brand = await brandsController.getBrandById(createdBrandId);
      expect(brand).toBeDefined();
      expect(brand.id).toBe(createdBrandId);
      expect(brand.name).toBe(`Brand Alpha ${testSuffix}`);
    });

    it('5. GET /api/v1/brands/:id — should throw NotFoundException for non-existent brand ID', async () => {
      await expect(
        brandsController.getBrandById('non-existent-brand-id-12345'),
      ).rejects.toThrow(NotFoundException);
    });

    it('6. PATCH /api/v1/brands/:id — should update brand fields', async () => {
      const updated = await brandsController.updateBrand(createdBrandId, {
        name: `Brand Alpha Updated ${testSuffix}`,
        logoUrl: 'https://example.com/logo-updated.png',
      });

      expect(updated).toBeDefined();
      expect(updated.name).toBe(`Brand Alpha Updated ${testSuffix}`);
      expect(updated.logoUrl).toBe('https://example.com/logo-updated.png');

      const dbRecord = await prisma.brand.findUnique({ where: { id: createdBrandId } });
      expect(dbRecord?.name).toBe(`Brand Alpha Updated ${testSuffix}`);
    });

    it('7. PATCH /api/v1/brands/:id — should throw NotFoundException when updating non-existent brand', async () => {
      await expect(
        brandsController.updateBrand('non-existent-brand-id-99999', { name: 'Ghost Brand' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // AUTH ENDPOINTS (3 Endpoints: me, logout-all, change-password)
  // =========================================================================
  describe('Auth Missing Endpoints Verification', () => {
    it('8. GET /api/v1/auth/me — should return authenticated user profile without passwordHash', async () => {
      const profile = await authController.me({ id: testUserId });
      expect(profile).toBeDefined();
      expect(profile.id).toBe(testUserId);
      expect(profile.phone).toBe(userPhone);
      expect(profile.email).toBe(userEmail);
      expect((profile as any).passwordHash).toBeUndefined();
    });

    it('9. GET /api/v1/auth/me — should throw NotFoundException for invalid user id', async () => {
      await expect(
        authController.me({ id: 'non-existent-user-id-54321' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('10. POST /api/v1/auth/change-password — should reject change-password with incorrect current password', async () => {
      await expect(
        authController.changePassword(
          { id: testUserId },
          {
            currentPassword: 'WrongOldPassword123!',
            newPassword: newPassword,
          },
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('11. POST /api/v1/auth/change-password — should reject weak new password', async () => {
      await expect(
        authController.changePassword(
          { id: testUserId },
          {
            currentPassword: initialPassword,
            newPassword: 'weak',
          },
        ),
      ).rejects.toThrow();
    });

    it('12. POST /api/v1/auth/change-password — should successfully change password with valid credentials', async () => {
      const result = await authController.changePassword(
        { id: testUserId },
        {
          currentPassword: initialPassword,
          newPassword: newPassword,
        },
      );
      expect(result).toBe(true);

      // Verify that login with OLD password now fails
      await expect(
        authService.login({ identifier: userPhone, password: initialPassword }),
      ).rejects.toThrow(UnauthorizedException);

      // Verify that login with NEW password succeeds
      const newLogin = await authService.login({ identifier: userPhone, password: newPassword });
      expect(newLogin).toHaveProperty('accessToken');
      expect(newLogin).toHaveProperty('refreshToken');
    });

    it('13. POST /api/v1/auth/logout-all — should revoke all user sessions and refresh tokens', async () => {
      // Create two active logins to verify multi-device logout
      const login1 = await authService.login({ identifier: userPhone, password: newPassword });
      const login2 = await authService.login({ identifier: userPhone, password: newPassword });

      expect(login1).toBeDefined();
      expect(login2).toBeDefined();

      // Check active sessions in DB
      const activeSessionsBefore = await prisma.userSession.findMany({
        where: { userId: testUserId, isRevoked: false },
      });
      expect(activeSessionsBefore.length).toBeGreaterThanOrEqual(2);

      // Invoke logout-all
      await authController.logoutAll({ id: testUserId });

      // Verify all sessions are revoked in DB
      const activeSessionsAfter = await prisma.userSession.findMany({
        where: { userId: testUserId, isRevoked: false },
      });
      expect(activeSessionsAfter.length).toBe(0);

      // Verify old refresh token can no longer be used (triggers CompromisedTokenFamilyException)
      await expect(
        authService.refreshTokens(login1.refreshToken),
      ).rejects.toThrow('Security violation: Refresh token reuse detected');
    });
  });
});
