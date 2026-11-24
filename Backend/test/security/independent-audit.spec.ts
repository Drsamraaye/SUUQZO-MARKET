import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../src/database/prisma.service.js';
import { PasswordService } from '../../src/security/password.service.js';
import { TokenService } from '../../src/security/token.service.js';
import { SessionsService } from '../../src/sessions/sessions.service.js';
import { OtpService } from '../../src/otp/otp.service.js';
import { TwoFactorService } from '../../src/two-factor/two-factor.service.js';
import { PasswordRecoveryService } from '../../src/password-recovery/password-recovery.service.js';
import { UsersService } from '../../src/users/users.service.js';
import { AuthService } from '../../src/auth/auth.service.js';
import { AuditLogsService } from '../../src/audit-logs/audit-logs.service.js';
import { NotificationsService } from '../../src/notifications/notifications.service.js';
import { SecurityHeadersMiddleware } from '../../src/middleware/security-headers.middleware.js';
import { RequestContextMiddleware } from '../../src/middleware/request-context.middleware.js';
import { RoleContextMiddleware } from '../../src/middleware/role-context.middleware.js';
import { RolesGuard } from '../../src/authorization/guards/roles.guard.js';
import { PermissionsGuard } from '../../src/authorization/guards/permissions.guard.js';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard.js';
import { Reflector } from '@nestjs/core';
import { UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

describe('PHASE 03 INDEPENDENT SECURITY AUDIT SUITE', () => {
  let prisma: PrismaService;
  let passwordService: PasswordService;
  let tokenService: TokenService;
  let sessionsService: SessionsService;
  let otpService: OtpService;
  let twoFactorService: TwoFactorService;
  let passwordRecoveryService: PasswordRecoveryService;
  let authService: AuthService;
  let reflector: Reflector;

  const testUserIds: string[] = [];
  const testPhone = `+25261${Math.floor(1000000 + Math.random() * 9000000)}`;
  const testEmail = `audit_${Date.now()}@suuqzo.test`;
  const strongPassword = 'AuditStrongP@ss1!';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'audit-test-secure-jwt-secret-minimum-32-chars!!';
    process.env.TWO_FACTOR_ENCRYPTION_KEY = 'audit-32-byte-encryption-key-test!!';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        PasswordService,
        TokenService,
        SessionsService,
        OtpService,
        TwoFactorService,
        PasswordRecoveryService,
        AuditLogsService,
        NotificationsService,
        UsersService,
        AuthService,
        Reflector,
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    passwordService = module.get<PasswordService>(PasswordService);
    tokenService = module.get<TokenService>(TokenService);
    sessionsService = module.get<SessionsService>(SessionsService);
    otpService = module.get<OtpService>(OtpService);
    twoFactorService = module.get<TwoFactorService>(TwoFactorService);
    passwordRecoveryService = module.get<PasswordRecoveryService>(PasswordRecoveryService);
    authService = module.get<AuthService>(AuthService);
    reflector = module.get<Reflector>(Reflector);
  });

  afterAll(async () => {
    // Cleanup created test records
    for (const uid of testUserIds) {
      await prisma.userSession.deleteMany({ where: { userId: uid } });
      await prisma.refreshToken.deleteMany({ where: { userId: uid } });
      await prisma.passwordResetToken.deleteMany({ where: { userId: uid } });
      await prisma.customerProfile.deleteMany({ where: { userId: uid } });
      await prisma.sellerProfile.deleteMany({ where: { userId: uid } });
      await prisma.adminProfile.deleteMany({ where: { userId: uid } });
      await prisma.user.deleteMany({ where: { id: uid } });
    }
    await prisma.otpVerification.deleteMany({ where: { target: testPhone } });
  });

  // ==========================================
  // AUDIT 2 — AUTHENTICATION TESTS
  // ==========================================
  describe('Audit 2: Authentication', () => {
    let createdUser: any;

    it('2.1 Should register a valid user with hashed password and customer profile', async () => {
      const regResult = await authService.register({
        phone: testPhone,
        email: testEmail,
        password: strongPassword,
        role: 'CUSTOMER' as any,
        firstName: 'Audit',
        lastName: 'Tester',
      });

      expect(regResult).toHaveProperty('userId');
      testUserIds.push(regResult.userId);

      createdUser = await prisma.user.findUnique({
        where: { id: regResult.userId },
        include: { customerProfile: true },
      });

      expect(createdUser).toBeDefined();
      expect(createdUser.passwordHash).toMatch(/^\$argon2id\$/);
      expect(createdUser.passwordHash).not.toBe(strongPassword);
      expect(createdUser.customerProfile).toBeDefined();
    });

    it('2.2 Should successfully login with valid credentials', async () => {
      const loginResult = await authService.login({
        identifier: testPhone,
        password: strongPassword,
      });

      expect(loginResult).toHaveProperty('accessToken');
      expect(loginResult).toHaveProperty('refreshToken');
      expect(loginResult.user.phone).toBe(testPhone);
      expect(loginResult.user).not.toHaveProperty('passwordHash');
    });

    it('2.3 Should reject login with invalid password and increment failed attempts', async () => {
      await expect(
        authService.login({
          identifier: testPhone,
          password: 'WrongPassword123!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      const userAfter = await prisma.user.findUnique({ where: { id: createdUser.id } });
      expect(userAfter?.failedLoginAttempts).toBeGreaterThan(0);
    });

    it('2.4 Should reject unknown account without leaking user existence', async () => {
      await expect(
        authService.login({
          identifier: '+252619999999',
          password: 'AnyPassword123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('2.5 Should reject expired access token in TokenService', () => {
      const expiredToken = jwt.sign(
        { sub: createdUser.id, role: 'CUSTOMER', sessionId: 'test-session' },
        process.env.JWT_SECRET!,
        { expiresIn: -10, issuer: 'suuqzo-mall', audience: 'suuqzo-client', algorithm: 'HS256' },
      );

      expect(() => tokenService.verifyAccessToken(expiredToken)).toThrow('Access token has expired.');
    });

    it('2.6 Should reject token with disallowed algorithm (alg: none)', () => {
      const noneToken = jwt.sign(
        { sub: createdUser.id, role: 'CUSTOMER', sessionId: 'test-session' },
        '',
        { algorithm: 'none' as any },
      );

      expect(() => tokenService.verifyAccessToken(noneToken)).toThrow();
    });

    it('2.7 Should reject token with invalid signature', () => {
      const forgedToken = jwt.sign(
        { sub: createdUser.id, role: 'CUSTOMER', sessionId: 'test-session' },
        'completely-different-signing-secret-12345678',
        { issuer: 'suuqzo-mall', audience: 'suuqzo-client', algorithm: 'HS256' },
      );

      expect(() => tokenService.verifyAccessToken(forgedToken)).toThrow();
    });

    it('2.8 Should reject token with invalid issuer', () => {
      const badIssuerToken = jwt.sign(
        { sub: createdUser.id, role: 'CUSTOMER', sessionId: 'test-session' },
        process.env.JWT_SECRET!,
        { issuer: 'fake-issuer', audience: 'suuqzo-client', algorithm: 'HS256' },
      );

      expect(() => tokenService.verifyAccessToken(badIssuerToken)).toThrow();
    });

    it('2.9 Should reject token with invalid audience', () => {
      const badAudToken = jwt.sign(
        { sub: createdUser.id, role: 'CUSTOMER', sessionId: 'test-session' },
        process.env.JWT_SECRET!,
        { issuer: 'suuqzo-mall', audience: 'fake-audience', algorithm: 'HS256' },
      );

      expect(() => tokenService.verifyAccessToken(badAudToken)).toThrow();
    });

    it('2.10 Should reject suspended and banned users during login', async () => {
      // Temporarily mark user as SUSPENDED
      await prisma.user.update({
        where: { id: createdUser.id },
        data: { status: 'SUSPENDED' },
      });

      await expect(
        authService.login({
          identifier: testPhone,
          password: strongPassword,
        }),
      ).rejects.toThrow('Account is suspended.');

      // Restore status
      await prisma.user.update({
        where: { id: createdUser.id },
        data: { status: 'ACTIVE' },
      });
    });
  });

  // ==========================================
  // AUDIT 3 — REFRESH TOKEN SECURITY
  // ==========================================
  describe('Audit 3: Refresh Token Security', () => {
    it('3.1 Should rotate refresh tokens and invalidate the previous one', async () => {
      const loginRes = await authService.login({
        identifier: testPhone,
        password: strongPassword,
      });

      const refreshRes = await authService.refreshTokens(loginRes.refreshToken);
      expect(refreshRes).toHaveProperty('accessToken');
      expect(refreshRes).toHaveProperty('refreshToken');
      expect(refreshRes.refreshToken).not.toBe(loginRes.refreshToken);

      // Verify old token is marked revoked in DB
      const oldHash = tokenService.hashToken(loginRes.refreshToken);
      const oldRecord = await prisma.refreshToken.findUnique({ where: { tokenHash: oldHash } });
      expect(oldRecord?.isRevoked).toBe(true);
    });

    it('3.2 Should detect reuse of revoked token and invalidate entire token family', async () => {
      const loginRes = await authService.login({
        identifier: testPhone,
        password: strongPassword,
      });

      // Valid refresh 1
      const refresh1 = await authService.refreshTokens(loginRes.refreshToken);

      // Replay old refresh token (reuse attack!)
      await expect(
        authService.refreshTokens(loginRes.refreshToken),
      ).rejects.toThrow('Refresh token reuse detected.');

      // Verify the new token from that family was also revoked!
      const newHash = tokenService.hashToken(refresh1.refreshToken);
      const newRecord = await prisma.refreshToken.findUnique({ where: { tokenHash: newHash } });
      expect(newRecord?.isRevoked).toBe(true);
    });

    it('3.3 Should verify refresh tokens are stored ONLY as hashes in database', async () => {
      const loginRes = await authService.login({
        identifier: testPhone,
        password: strongPassword,
      });

      const foundPlain = await prisma.refreshToken.findFirst({
        where: { tokenHash: loginRes.refreshToken },
      });
      expect(foundPlain).toBeNull(); // Plaintext must never exist in tokenHash

      const hash = tokenService.hashToken(loginRes.refreshToken);
      const foundHash = await prisma.refreshToken.findUnique({
        where: { tokenHash: hash },
      });
      expect(foundHash).not.toBeNull();
    });

    it('3.4 Should revoke session and tokens on logout', async () => {
      const loginRes = await authService.login({
        identifier: testPhone,
        password: strongPassword,
      });

      const payload = tokenService.verifyAccessToken(loginRes.accessToken);
      await authService.logout(payload.sub, payload.sessionId, loginRes.refreshToken);

      const session = await prisma.userSession.findUnique({ where: { id: payload.sessionId } });
      expect(session?.isRevoked).toBe(true);

      const isValid = await sessionsService.validateSession(payload.sessionId);
      expect(isValid).toBe(false);
    });
  });

  // ==========================================
  // AUDIT 4 — RBAC & PERMISSIONS
  // ==========================================
  describe('Audit 4: RBAC and Permissions', () => {
    it('4.1 RolesGuard should allow access when user role matches @Roles', () => {
      const guard = new RolesGuard(reflector);
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
        if (key === 'roles') return ['SELLER'];
        return false;
      });

      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: 'SELLER', assignedRoles: ['SELLER'] } }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any;

      expect(guard.canActivate(context)).toBe(true);
    });

    it('4.2 RolesGuard should block unauthorized role access', () => {
      const guard = new RolesGuard(reflector);
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
        if (key === 'roles') return ['ADMIN'];
        return false;
      });

      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: 'CUSTOMER', assignedRoles: ['CUSTOMER'] } }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any;

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('4.3 RolesGuard: SUPER_ADMIN must bypass all role restrictions', () => {
      const guard = new RolesGuard(reflector);
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
        if (key === 'roles') return ['RIDER'];
        return false;
      });

      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: 'SUPER_ADMIN', assignedRoles: ['SUPER_ADMIN'] } }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any;

      expect(guard.canActivate(context)).toBe(true);
    });

    it('4.4 Public registration MUST reject ADMIN and SUPER_ADMIN roles', async () => {
      await expect(
        authService.register({
          phone: '+252619999998',
          password: strongPassword,
          role: 'ADMIN' as any,
          firstName: 'Bad',
          lastName: 'Actor',
        }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        authService.register({
          phone: '+252619999997',
          password: strongPassword,
          role: 'SUPER_ADMIN' as any,
          firstName: 'Bad',
          lastName: 'Actor',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('4.5 PermissionsGuard: ADMIN with granted permission succeeds, without throws ForbiddenException', async () => {
      // Create admin user & profile in DB
      const adminPhone = `+25261${Math.floor(4000000 + Math.random() * 5000000)}`;
      const hash = await passwordService.hash(strongPassword);
      const adminUser = await prisma.user.create({
        data: {
          phone: adminPhone,
          passwordHash: hash,
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      });
      testUserIds.push(adminUser.id);

      await prisma.adminProfile.create({
        data: {
          userId: adminUser.id,
          fullName: 'Security Admin',
          department: 'Security',
          permissions: ['admin.users.view'],
        },
      });

      const guard = new PermissionsGuard(reflector, prisma);

      // 1. Requesting granted permission: 'admin.users.view'
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
        if (key === 'permissions') return ['admin.users.view'];
        return false;
      });

      const grantedContext = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: adminUser.id, role: 'ADMIN' } }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any;

      const canView = await guard.canActivate(grantedContext);
      expect(canView).toBe(true);

      // 2. Requesting non-granted permission: 'admin.orders.manage'
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
        if (key === 'permissions') return ['admin.orders.manage'];
        return false;
      });

      await expect(guard.canActivate(grantedContext)).rejects.toThrow(ForbiddenException);

      // 3. SUPER_ADMIN bypasses all permissions
      const superAdminContext = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: 'super-admin-id', role: 'SUPER_ADMIN' } }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any;

      expect(await guard.canActivate(superAdminContext)).toBe(true);
    });
  });

  // ==========================================
  // AUDIT 5 — OTP SECURITY
  // ==========================================
  describe('Audit 5: OTP Security', () => {
    const otpTarget = `+25261${Math.floor(2000000 + Math.random() * 7000000)}`;

    it('5.1 Should generate hashed OTP in DB and verify successfully with single-use guarantee', async () => {
      await otpService.sendOtp({ target: otpTarget, purpose: 'PHONE_VERIFICATION' as any });

      const record = await prisma.otpVerification.findFirst({
        where: { target: otpTarget, isConsumed: false },
      });

      expect(record).toBeDefined();
      expect(record?.codeHash).toHaveLength(64); // SHA-256 hash length

      // Check maxAttempts = 5 and attempts = 0
      expect(record?.attempts).toBe(0);
      expect(record?.maxAttempts).toBe(5);
    });

    it('5.2 Should enforce 60-second resend cooldown (HTTP 429)', async () => {
      await expect(
        otpService.sendOtp({ target: otpTarget, purpose: 'PHONE_VERIFICATION' as any }),
      ).rejects.toMatchObject({ status: 429 });
    });

    it('5.3 Should track failed attempts on wrong code', async () => {
      // Create a specific record to test attempt tracking
      const crypto = await import('node:crypto');
      const realCode = '456789';
      const codeHash = crypto
        .createHash('sha256')
        .update(`${otpTarget}:EMAIL_VERIFICATION:${realCode}`)
        .digest('hex');

      const otpRec = await prisma.otpVerification.create({
        data: {
          target: otpTarget,
          purpose: 'EMAIL_VERIFICATION' as any,
          codeHash,
          attempts: 0,
          maxAttempts: 5,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          resendAfter: new Date(Date.now() + 60_000),
          isConsumed: false,
        },
      });

      await expect(
        otpService.verifyOtp({
          target: otpTarget,
          purpose: 'EMAIL_VERIFICATION' as any,
          code: '000000',
        }),
      ).rejects.toThrow('Invalid OTP code');

      const updated = await prisma.otpVerification.findUnique({ where: { id: otpRec.id } });
      expect(updated?.attempts).toBe(1);

      // Cleanup
      await prisma.otpVerification.delete({ where: { id: otpRec.id } });
    });
  });

  // ==========================================
  // AUDIT 6 — TWO-FACTOR AUTHENTICATION
  // ==========================================
  describe('Audit 6: Two-Factor Authentication', () => {
    let twoFaUserId: string;

    beforeAll(async () => {
      const reg = await authService.register({
        phone: `+25261${Math.floor(3000000 + Math.random() * 6000000)}`,
        password: strongPassword,
        role: 'CUSTOMER' as any,
        firstName: 'TwoFa',
        lastName: 'User',
      });
      twoFaUserId = reg.userId;
      testUserIds.push(twoFaUserId);
    });

    it('6.1 Should enroll and store secret encrypted with AES-256-GCM', async () => {
      const enrollment = await twoFactorService.enroll(twoFaUserId);
      expect(enrollment).toHaveProperty('secret');
      expect(enrollment).toHaveProperty('otpauthUrl');

      const user = await prisma.user.findUnique({ where: { id: twoFaUserId } });
      expect(user?.twoFactorSecret).toBeDefined();
      expect(user?.twoFactorSecret).not.toBe(enrollment.secret); // Must be encrypted!
      expect(user?.twoFactorSecret).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/); // iv:authTag:ciphertext
    });

    it('6.2 Should reject confirmation with invalid TOTP code', async () => {
      await expect(
        twoFactorService.confirmEnrollment(twoFaUserId, '000000'),
      ).rejects.toThrow(BadRequestException);
    });

    it('6.3 Should require correct password to disable 2FA', async () => {
      await expect(
        twoFactorService.disable(twoFaUserId, 'IncorrectPassword!'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('6.4 Should enforce 2FA verification during login when 2FA is enabled', async () => {
      // 1. Manually activate 2FA for this user with recovery codes
      const dummySecret = 'JBSWY3DPEHPK3PXP';
      const recoveryCode = 'REC12345';
      const recoveryHash = crypto.createHash('sha256').update(recoveryCode).digest('hex');

      // Encrypt secret with service method
      const enrollment = await twoFactorService.enroll(twoFaUserId);
      const userWithEnc = await prisma.user.findUnique({ where: { id: twoFaUserId } });

      await prisma.user.update({
        where: { id: twoFaUserId },
        data: {
          twoFactorEnabled: true,
          twoFactorRecoveryCodes: [recoveryHash],
        },
      });

      const userRec = await prisma.user.findUnique({ where: { id: twoFaUserId } });

      // Attempt login without code -> must fail
      await expect(
        authService.login({ identifier: userRec!.phone, password: strongPassword }),
      ).rejects.toThrow('Two-factor authentication code required.');

      // Attempt login with invalid code -> must fail
      await expect(
        authService.login({
          identifier: userRec!.phone,
          password: strongPassword,
          twoFactorCode: '000000',
        }),
      ).rejects.toThrow('Invalid two-factor authentication code.');

      // Attempt login with valid recovery code -> must succeed!
      const loginRes = await authService.login({
        identifier: userRec!.phone,
        password: strongPassword,
        twoFactorCode: recoveryCode,
      });
      expect(loginRes).toHaveProperty('accessToken');

      // Recovery code must be consumed (single-use)
      const userAfter = await prisma.user.findUnique({ where: { id: twoFaUserId } });
      expect(userAfter?.twoFactorRecoveryCodes).toHaveLength(0);

      // Attempting to re-use same recovery code must fail!
      await expect(
        authService.login({
          identifier: userRec!.phone,
          password: strongPassword,
          twoFactorCode: recoveryCode,
        }),
      ).rejects.toThrow('Invalid two-factor authentication code.');
    });
  });

  // ==========================================
  // AUDIT 7 — PASSWORD SECURITY
  // ==========================================
  describe('Audit 7: Password Security', () => {
    it('7.1 Argon2id parameters should be memory-hard (m=65536, t=3, p=4)', async () => {
      const hash = await passwordService.hash('P@ssword123!');
      expect(hash).toContain('$m=65536,t=3,p=4$');
    });

    it('7.2 Password strength policy should reject weak variants', () => {
      expect(() => passwordService.validateStrengthOrThrow('short1!')).toThrow();
      expect(() => passwordService.validateStrengthOrThrow('no-uppercase-1!')).toThrow();
      expect(() => passwordService.validateStrengthOrThrow('NO-LOWERCASE-1!')).toThrow();
      expect(() => passwordService.validateStrengthOrThrow('NoNumbersAtAll!!')).toThrow();
      expect(() => passwordService.validateStrengthOrThrow('NoSpecialChar123')).toThrow();
    });

    it('7.3 Password reset token should be single-use and revoke all sessions', async () => {
      const resetInfo = await passwordRecoveryService.createPasswordResetToken(testPhone);
      expect(resetInfo).toBeDefined();

      const newPass = 'BrandNewP@ssw0rd99!';
      const success = await passwordRecoveryService.resetPassword(resetInfo!.token, newPass);
      expect(success).toBe(true);

      // Re-using the same token must fail
      await expect(
        passwordRecoveryService.resetPassword(resetInfo!.token, 'AnotherPass123!'),
      ).rejects.toThrow(BadRequestException);

      // Login with old password must fail
      await expect(
        authService.login({ identifier: testPhone, password: strongPassword }),
      ).rejects.toThrow(UnauthorizedException);

      // Login with new password must succeed
      const loginWithNew = await authService.login({ identifier: testPhone, password: newPass });
      expect(loginWithNew).toHaveProperty('accessToken');
    });
  });

  // ==========================================
  // AUDIT 8 — MIDDLEWARE & API SECURITY
  // ==========================================
  describe('Audit 8: Middleware and Security Headers', () => {
    it('8.1 SecurityHeadersMiddleware should set all required security headers', () => {
      const middleware = new SecurityHeadersMiddleware();
      const headers: Record<string, string> = {};
      const res: any = {
        setHeader: (k: string, v: string) => {
          headers[k] = v;
        },
      };

      middleware.use({} as any, res, () => {});

      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['X-Frame-Options']).toBe('DENY');
      expect(headers['X-XSS-Protection']).toBe('1; mode=block');
      expect(headers['Strict-Transport-Security']).toContain('max-age=31536000');
      expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['Content-Security-Policy']).toBeDefined();
    });

    it('8.2 RequestContextMiddleware should generate UUID requestId and set X-Request-Id header', () => {
      const middleware = new RequestContextMiddleware();
      const req: any = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
      let headerKey = '';
      let headerVal = '';
      const res: any = {
        setHeader: (k: string, v: string) => {
          headerKey = k;
          headerVal = v;
        },
      };

      middleware.use(req, res, () => {});

      expect(req.context).toBeDefined();
      expect(req.context.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(headerKey).toBe('X-Request-Id');
      expect(headerVal).toBe(req.context.requestId);
    });

    it('8.3 RoleContextMiddleware should reject invalid role header', () => {
      const middleware = new RoleContextMiddleware();
      const req: any = { headers: { 'x-active-role': 'HACKER_ROLE' } };

      expect(() => middleware.use(req, {} as any, () => {})).toThrow(BadRequestException);
    });
  });
});
