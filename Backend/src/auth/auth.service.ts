import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { PasswordService } from '../security/password.service.js';
import { TokenService } from '../security/token.service.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { OtpService } from '../otp/otp.service.js';
import { TwoFactorService } from '../two-factor/two-factor.service.js';
import { UsersService } from '../users/users.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../common/interfaces/request-context.interface.js';
import {
  AccountSuspendedException,
  AccountLockedException,
  CompromisedTokenFamilyException,
} from '../common/exceptions/security.exception.js';
import crypto from 'node:crypto';

const FORBIDDEN_REGISTRATION_ROLES: string[] = ['ADMIN', 'SUPER_ADMIN'];
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly sessionsService: SessionsService,
    private readonly otpService: OtpService,
    private readonly twoFactorService: TwoFactorService,
    private readonly usersService: UsersService,
  ) {}

  // ─────────────────────────────────────────────
  // REGISTER
  // ─────────────────────────────────────────────
  async register(dto: RegisterDto, ipAddress?: string, _userAgent?: string) {
    if (FORBIDDEN_REGISTRATION_ROLES.includes(dto.role)) {
      throw new ForbiddenException('Cannot register with this role.');
    }

    const existingPhone = await this.usersService.findByPhone(dto.phone);
    if (existingPhone) {
      throw new ConflictException('An account with this phone number already exists.');
    }

    if (dto.email) {
      const existingEmail = await this.usersService.findByEmail(dto.email);
      if (existingEmail) {
        throw new ConflictException('An account with this email already exists.');
      }
    }

    this.passwordService.validateStrengthOrThrow(dto.password);
    const passwordHash = await this.passwordService.hash(dto.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          phone: dto.phone,
          email: dto.email ?? null,
          passwordHash,
          role: dto.role as UserRole,
          status: 'PENDING_VERIFICATION',
          isPhoneVerified: false,
          isEmailVerified: false,
        },
      });

      if (dto.role === 'CUSTOMER') {
        await tx.customerProfile.create({
          data: {
            userId: newUser.id,
            firstName: dto.firstName,
            lastName: dto.lastName,
          },
        });
      } else if (dto.role === 'SELLER') {
        await tx.sellerProfile.create({
          data: {
            userId: newUser.id,
            businessName: `${dto.firstName} ${dto.lastName}`,
            payoutAccountIdentifier: dto.phone,
          },
        });
      } else if (dto.role === 'RIDER') {
        await tx.riderProfile.create({
          data: {
            userId: newUser.id,
            firstName: dto.firstName,
            lastName: dto.lastName,
          },
        });
      }

      return newUser;
    }, { timeout: 30000, maxWait: 10000 });

    try {
      await this.otpService.sendOtp({ target: dto.phone, purpose: 'PHONE_VERIFICATION' as any });
    } catch {
      // OTP send failure must not break registration
    }

    return {
      message: 'Registration successful. Please verify your phone number.',
      userId: user.id,
    };
  }

  // ─────────────────────────────────────────────
  // LOGIN
  // ─────────────────────────────────────────────
  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await this.usersService.findByIdentifier(dto.identifier);

    if (!user) {
      await this.passwordService.hash('dummy-password-to-burn-time');
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (['SUSPENDED', 'BANNED'].includes(user.status as string)) {
      throw new AccountSuspendedException(`Account is ${(user.status as string).toLowerCase()}.`);
    }

    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      throw new AccountLockedException(user.lockoutUntil);
    }

    const passwordValid = await this.passwordService.verify(user.passwordHash ?? '', dto.password);
    if (!passwordValid) {
      await this.recordFailedLogin(user.id, user.failedLoginAttempts ?? 0);
      throw new UnauthorizedException('Invalid credentials.');
    }

    // AUDIT FIX: Verify 2FA code if 2FA is enabled
    if (user.twoFactorEnabled) {
      if (!dto.twoFactorCode) {
        throw new UnauthorizedException('Two-factor authentication code required.');
      }
      const is2FaValid = await this.twoFactorService.verifyLogin2Fa(user.id, dto.twoFactorCode);
      if (!is2FaValid) {
        await this.recordFailedLogin(user.id, user.failedLoginAttempts ?? 0);
        throw new UnauthorizedException('Invalid two-factor authentication code.');
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockoutUntil: null, lastLoginAt: new Date() },
    });

    const session = await this.sessionsService.createSession(user.id, ipAddress, userAgent);
    const { raw: rawRefreshToken } = await this.createRefreshToken(user.id, session.id);

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role as UserRole,
      assignedRoles: user.assignedRoles as UserRole[],
      status: user.status as any,
      isPhoneVerified: user.isPhoneVerified,
      isEmailVerified: user.isEmailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
    };

    const { token: accessToken, expiresIn } = this.tokenService.generateAccessToken(
      authenticatedUser,
      user.role as UserRole,
      session.id,
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn,
      user: this.sanitizeUser(user),
    };
  }

  // ─────────────────────────────────────────────
  // REFRESH TOKENS
  // ─────────────────────────────────────────────
  async refreshTokens(rawToken: string) {
    const tokenHash = this.tokenService.hashToken(rawToken);

    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!existing) throw new UnauthorizedException('Invalid refresh token.');
    if (existing.expiresAt < new Date()) throw new UnauthorizedException('Refresh token has expired.');

    // AUDIT FIX: Invalidate ALL user sessions in database when reuse is detected
    if (existing.isRevoked) {
      await this.prisma.refreshToken.updateMany({
        where: { family: existing.family, userId: existing.userId },
        data: { isRevoked: true },
      });
      await this.sessionsService.revokeAllUserSessions(existing.userId);
      throw new CompromisedTokenFamilyException();
    }

    await this.prisma.refreshToken.update({ where: { id: existing.id }, data: { isRevoked: true } });

    const { raw: newRawToken } = await this.createRefreshToken(
      existing.userId,
      existing.sessionId,
      existing.family,
    );

    const authUser: AuthenticatedUser = {
      id: existing.user.id,
      email: existing.user.email,
      phone: existing.user.phone,
      role: existing.user.role as UserRole,
      assignedRoles: existing.user.assignedRoles as UserRole[],
      status: existing.user.status as any,
      isPhoneVerified: existing.user.isPhoneVerified,
      isEmailVerified: existing.user.isEmailVerified,
      twoFactorEnabled: existing.user.twoFactorEnabled,
    };

    const { token: accessToken, expiresIn } = this.tokenService.generateAccessToken(
      authUser,
      existing.user.role as UserRole,
      existing.sessionId,
    );

    return { accessToken, refreshToken: newRawToken, expiresIn };
  }

  // ─────────────────────────────────────────────
  // LOGOUT
  // ─────────────────────────────────────────────
  async logout(userId: string, sessionId: string, rawRefreshToken?: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { id: sessionId, userId },
      data: { isRevoked: true },
    });

    if (rawRefreshToken) {
      const tokenHash = this.tokenService.hashToken(rawRefreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, userId },
        data: { isRevoked: true },
      });
    }
  }

  async logoutAllDevices(userId: string): Promise<void> {
    await this.sessionsService.revokeAllUserSessions(userId);
  }

  // ─────────────────────────────────────────────
  // VERIFY PHONE
  // ─────────────────────────────────────────────
  async verifyPhone(phone: string, code: string): Promise<{ message: string }> {
    await this.otpService.verifyOtp({
      target: phone,
      purpose: 'PHONE_VERIFICATION' as any,
      code,
    });

    // AUDIT FIX: Only activate if status is PENDING_VERIFICATION (prevent unbanning suspended/banned users)
    await this.prisma.user.updateMany({
      where: { phone, status: 'PENDING_VERIFICATION' },
      data: { isPhoneVerified: true, status: 'ACTIVE' },
    });

    return { message: 'Phone number verified successfully.' };
  }

  // ─────────────────────────────────────────────
  // ME
  // ─────────────────────────────────────────────
  async me(userId: string) {
    const user = await this.usersService.findProfileById(userId);
    if (!user) throw new UnauthorizedException('User not found.');
    return user;
  }

  // ─────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────
  private async recordFailedLogin(userId: string, currentAttempts: number): Promise<void> {
    const newCount = currentAttempts + 1;
    const shouldLock = newCount >= MAX_FAILED_ATTEMPTS;
    const lockoutUntil = shouldLock
      ? new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000)
      : undefined;

    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: newCount, ...(lockoutUntil ? { lockoutUntil } : {}) },
    });
  }

  private async createRefreshToken(
    userId: string,
    sessionId: string,
    family?: string,
  ): Promise<{ raw: string; hash: string; expiresAt: Date }> {
    const rawToken = this.tokenService.generateRawRefreshToken();
    const hash = this.tokenService.hashToken(rawToken);
    const expiresAt = this.tokenService.getRefreshTokenExpiry();
    const tokenFamily = family ?? crypto.randomUUID();

    await this.prisma.refreshToken.create({
      data: { userId, sessionId, tokenHash: hash, family: tokenFamily, expiresAt, isRevoked: false },
    });

    return { raw: rawToken, hash, expiresAt };
  }

  private sanitizeUser(user: any) {
    const { passwordHash, twoFactorSecret, twoFactorRecoveryCodes, ...safe } = user;
    return safe;
  }
}
