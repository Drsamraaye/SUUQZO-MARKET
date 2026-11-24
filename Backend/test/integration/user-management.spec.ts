import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../src/database/prisma.module.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { UsersModule } from '../../src/users/users.module.js';
import { UsersService } from '../../src/users/users.service.js';
import { AuditLogsModule } from '../../src/audit-logs/audit-logs.module.js';
import { AuditLogsService } from '../../src/audit-logs/audit-logs.service.js';
import { NotificationsModule } from '../../src/notifications/notifications.module.js';
import { UserRole, UserStatus } from '@prisma/client';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

describe('Phase 04: User Management Integration & Security Tests', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let usersService: UsersService;
  let auditLogsService: AuditLogsService;

  const testSuffix = Date.now().toString().slice(-6);
  let superAdminId: string;
  let adminId: string;
  let regularUserId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuditLogsModule, NotificationsModule, UsersModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    usersService = moduleRef.get<UsersService>(UsersService);
    auditLogsService = moduleRef.get<AuditLogsService>(AuditLogsService);
    await moduleRef.init();

    // Create super admin test user
    const superAdmin = await prisma.user.create({
      data: {
        phone: `+25261900${testSuffix}`,
        email: `superadmin_${testSuffix}@suuqzo.test`,
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhashsuperadmin',
      },
    });
    superAdminId = superAdmin.id;

    // Create admin test user
    const admin = await prisma.user.create({
      data: {
        phone: `+25261901${testSuffix}`,
        email: `admin_${testSuffix}@suuqzo.test`,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.ADMIN],
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhashadmin',
      },
    });
    adminId = admin.id;

    // Create customer/regular test user
    const regularUser = await prisma.user.create({
      data: {
        phone: `+25261902${testSuffix}`,
        email: `user_${testSuffix}@suuqzo.test`,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.CUSTOMER],
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhashuser',
        customerProfile: {
          create: {
            firstName: 'Ahmed',
            lastName: 'Hassan',
          },
        },
      },
    });
    regularUserId = regularUser.id;
  }, 30000);

  afterAll(async () => {
    // Clean up created test accounts and cascade relations
    if (prisma) {
      const userIds = [superAdminId, adminId, regularUserId].filter(Boolean);
      if (userIds.length > 0) {
        await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.customerProfile.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    }
    if (moduleRef) {
      await moduleRef.close();
    }
  }, 30000);

  describe('1. User Listing & Multi-field Search', () => {
    it('should list users with pagination metadata', async () => {
      const result = await usersService.listUsers({ page: 1, limit: 10 });
      expect(result).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.total).toBeGreaterThanOrEqual(3);
    });

    it('should filter users by role and status', async () => {
      const result = await usersService.listUsers({
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
      });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.items.some((u) => u.id === superAdminId)).toBe(true);
    });

    it('should search across phone, email, and name', async () => {
      const result = await usersService.listUsers({ search: `user_${testSuffix}` });
      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe(regularUserId);
    });
  });

  describe('2. User Profiles & Safe Projections', () => {
    it('should return safe user profile without passwordHash or tokens', async () => {
      const profile = await usersService.findProfileById(regularUserId);
      expect(profile).toBeDefined();
      expect(profile.id).toBe(regularUserId);
      expect(profile.customerProfile?.firstName).toBe('Ahmed');
      expect((profile as any).passwordHash).toBeUndefined();
      expect((profile as any).twoFactorSecret).toBeUndefined();
    });

    it('should throw NotFoundException for non-existent user profile', async () => {
      await expect(
        usersService.findProfileById('non-existent-cuid-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow user to update their own profile', async () => {
      const updated = await usersService.updateProfile(
        regularUserId,
        regularUserId,
        UserRole.CUSTOMER,
        { firstName: 'Ahmed-Updated', preferredLanguage: 'en' },
      );
      expect(updated).toBeDefined();

      const profile = await usersService.findProfileById(regularUserId);
      expect(profile.customerProfile?.firstName).toBe('Ahmed-Updated');
      expect(profile.customerProfile?.preferredLanguage).toBe('en');
    });

    it('should forbid non-admin from updating another users profile', async () => {
      await expect(
        usersService.updateProfile(
          adminId,
          regularUserId,
          UserRole.CUSTOMER,
          { firstName: 'Hacked' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('3. Account Status Lifecycle & Session Revocation', () => {
    it('should prevent administrators from modifying their own account status', async () => {
      await expect(
        usersService.updateStatus(adminId, adminId, UserRole.ADMIN, {
          status: UserStatus.SUSPENDED,
          reason: 'Self suspend test',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should prevent regular ADMIN from suspending SUPER_ADMIN', async () => {
      await expect(
        usersService.updateStatus(superAdminId, adminId, UserRole.ADMIN, {
          status: UserStatus.SUSPENDED,
          reason: 'Attempted takeover',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should suspend user, revoke all active sessions and refresh tokens, and write audit log', async () => {
      // Create a dummy session & refresh token for target user
      const session = await prisma.userSession.create({
        data: {
          userId: regularUserId,
          tokenHash: `test_token_hash_${Date.now()}`,
          expiresAt: new Date(Date.now() + 86400000),
          isRevoked: false,
        },
      });

      const refreshToken = await prisma.refreshToken.create({
        data: {
          userId: regularUserId,
          sessionId: session.id,
          tokenHash: `test_rt_hash_${Date.now()}`,
          family: 'family-1',
          expiresAt: new Date(Date.now() + 86400000),
          isRevoked: false,
        },
      });

      // Execute suspension
      const result = await usersService.updateStatus(
        regularUserId,
        adminId,
        UserRole.ADMIN,
        {
          status: UserStatus.SUSPENDED,
          reason: 'Terms of service violation',
        },
      );

      expect(result.newStatus).toBe(UserStatus.SUSPENDED);

      // Verify sessions and tokens are revoked in DB
      const updatedSession = await prisma.userSession.findUnique({
        where: { id: session.id },
      });
      expect(updatedSession?.isRevoked).toBe(true);

      const updatedToken = await prisma.refreshToken.findUnique({
        where: { id: refreshToken.id },
      });
      expect(updatedToken?.isRevoked).toBe(true);

      // Verify AuditLog exists
      const auditLogs = await auditLogsService.findByEntity('User', regularUserId);
      expect(auditLogs.some((l) => l.action === 'USER_STATUS_SUSPENDED')).toBe(true);

      // Reinstate user
      await usersService.updateStatus(
        regularUserId,
        adminId,
        UserRole.ADMIN,
        {
          status: UserStatus.ACTIVE,
          reason: 'Reinstated after verification',
        },
      );

      const reinstated = await prisma.user.findUnique({ where: { id: regularUserId } });
      expect(reinstated?.status).toBe(UserStatus.ACTIVE);
    });
  });

  describe('4. Role Assignment & Escalation Protection', () => {
    it('should forbid users from modifying their own roles', async () => {
      await expect(
        usersService.assignRole(adminId, adminId, UserRole.ADMIN, {
          role: UserRole.SUPER_ADMIN,
          action: 'ADD',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should forbid non-SUPER_ADMIN from assigning ADMIN role', async () => {
      await expect(
        usersService.assignRole(regularUserId, adminId, UserRole.ADMIN, {
          role: UserRole.ADMIN,
          action: 'ADD',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow SUPER_ADMIN to assign and revoke roles', async () => {
      const assigned = await usersService.assignRole(
        regularUserId,
        superAdminId,
        UserRole.SUPER_ADMIN,
        {
          role: UserRole.SELLER,
          action: 'ADD',
        },
      );

      expect(assigned.assignedRoles).toContain(UserRole.SELLER);

      // Revoke role
      const revoked = await usersService.assignRole(
        regularUserId,
        superAdminId,
        UserRole.SUPER_ADMIN,
        {
          role: UserRole.SELLER,
          action: 'REMOVE',
        },
      );

      expect(revoked.assignedRoles).not.toContain(UserRole.SELLER);
    });

    it('should prevent removing the only remaining role from a user', async () => {
      await expect(
        usersService.assignRole(
          regularUserId,
          superAdminId,
          UserRole.SUPER_ADMIN,
          {
            role: UserRole.CUSTOMER,
            action: 'REMOVE',
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
