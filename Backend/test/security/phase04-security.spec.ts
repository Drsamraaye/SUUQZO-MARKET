import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../src/database/prisma.module.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { UsersModule } from '../../src/users/users.module.js';
import { UsersService } from '../../src/users/users.service.js';
import { SellersModule } from '../../src/sellers/sellers.module.js';
import { SellersService } from '../../src/sellers/sellers.service.js';
import { StoresModule } from '../../src/stores/stores.module.js';
import { StoresService } from '../../src/stores/stores.service.js';
import { AuditLogsModule } from '../../src/audit-logs/audit-logs.module.js';
import { NotificationsModule } from '../../src/notifications/notifications.module.js';
import {
  UserRole,
  UserStatus,
  SellerVerificationStatus,
  StoreStatus,
} from '@prisma/client';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

describe('Phase 04: Security & Privilege Boundary Verification', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let usersService: UsersService;
  let sellersService: SellersService;
  let storesService: StoresService;

  const testSuffix = Date.now().toString().slice(-6);
  let superAdminId: string;
  let regularAdminId: string;
  let sellerUserId: string;
  let customerUserId: string;
  let victimStoreId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        PrismaModule,
        AuditLogsModule,
        NotificationsModule,
        UsersModule,
        SellersModule,
        StoresModule,
      ],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    usersService = moduleRef.get<UsersService>(UsersService);
    sellersService = moduleRef.get<SellersService>(SellersService);
    storesService = moduleRef.get<StoresService>(StoresService);
    await moduleRef.init();

    // 1. Super Admin
    const superAdmin = await prisma.user.create({
      data: {
        phone: `+25261600${testSuffix}`,
        email: `sec_superadmin_${testSuffix}@suuqzo.test`,
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.SUPER_ADMIN],
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
      },
    });
    superAdminId = superAdmin.id;

    // 2. Regular Admin
    const regularAdmin = await prisma.user.create({
      data: {
        phone: `+25261601${testSuffix}`,
        email: `sec_admin_${testSuffix}@suuqzo.test`,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.ADMIN],
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
      },
    });
    regularAdminId = regularAdmin.id;

    // 3. Legitimate Seller
    const seller = await prisma.user.create({
      data: {
        phone: `+25261602${testSuffix}`,
        email: `sec_seller_${testSuffix}@suuqzo.test`,
        role: UserRole.SELLER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.SELLER],
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
        sellerProfile: {
          create: {
            businessName: `Secured Seller ${testSuffix}`,
            payoutAccountIdentifier: '+252615444444',
            verificationStatus: SellerVerificationStatus.VERIFIED,
          },
        },
      },
    });
    sellerUserId = seller.id;

    // 4. Standard Customer
    const customer = await prisma.user.create({
      data: {
        phone: `+25261603${testSuffix}`,
        email: `sec_customer_${testSuffix}@suuqzo.test`,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.CUSTOMER],
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
      },
    });
    customerUserId = customer.id;

    // Create a store for the legitimate seller
    const store = await storesService.createStore(sellerUserId, {
      name: `Secured Flagship Store ${testSuffix}`,
      city: 'Mogadishu',
      address: 'Hodan District',
    });
    victimStoreId = store.id;
  }, 30000);

  afterAll(async () => {
    if (prisma) {
      const userIds = [superAdminId, regularAdminId, sellerUserId, customerUserId].filter(
        Boolean,
      );
      if (userIds.length > 0) {
        await prisma.store.deleteMany({
          where: { seller: { userId: { in: userIds } } },
        });
        await prisma.sellerProfile.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.notification.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.auditLog.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: userIds } },
        });
      }
    }
    if (moduleRef) {
      await moduleRef.close();
    }
  }, 30000);

  describe('SECURITY 1: Role Escalation Defense', () => {
    it('customer cannot self-elevate to ADMIN or SUPER_ADMIN', async () => {
      await expect(
        usersService.assignRole(customerUserId, customerUserId, UserRole.CUSTOMER, {
          role: UserRole.ADMIN,
          action: 'ADD',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('seller cannot self-elevate to ADMIN', async () => {
      await expect(
        usersService.assignRole(sellerUserId, sellerUserId, UserRole.SELLER, {
          role: UserRole.ADMIN,
          action: 'ADD',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('regular admin cannot assign or revoke SUPER_ADMIN role', async () => {
      await expect(
        usersService.assignRole(customerUserId, regularAdminId, UserRole.ADMIN, {
          role: UserRole.SUPER_ADMIN,
          action: 'ADD',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('SECURITY 2: Administrative Account Protection', () => {
    it('regular admin cannot ban or suspend a SUPER_ADMIN account', async () => {
      await expect(
        usersService.updateStatus(superAdminId, regularAdminId, UserRole.ADMIN, {
          status: UserStatus.BANNED,
          reason: 'Unauthorized ban attempt',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('administrator cannot ban or suspend themselves', async () => {
      await expect(
        usersService.updateStatus(regularAdminId, regularAdminId, UserRole.ADMIN, {
          status: UserStatus.SUSPENDED,
          reason: 'Self lock test',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('SECURITY 3: Onboarding & KYC Conflict of Interest Defense', () => {
    it('administrator cannot approve their own seller application', async () => {
      const adminApp = await sellersService.submitApplication(regularAdminId, {
        businessName: `Conflict Shop ${testSuffix}`,
        payoutAccountIdentifier: '+252615777777',
      });

      await expect(
        sellersService.reviewApplication(adminApp.id, regularAdminId, {
          decision: 'APPROVE',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('SECURITY 4: Multi-Tenant Store & Asset Isolation', () => {
    it('customer cannot modify any store', async () => {
      await expect(
        storesService.updateStore(
          victimStoreId,
          customerUserId,
          UserRole.CUSTOMER,
          { name: 'Defaced Name' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('seller cannot update a store they do not own', async () => {
      // Create another seller
      const evilSeller = await prisma.user.create({
        data: {
          phone: `+25261609${testSuffix}`,
          email: `evil_seller_${testSuffix}@suuqzo.test`,
          role: UserRole.SELLER,
          status: UserStatus.ACTIVE,
          assignedRoles: [UserRole.SELLER],
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
          sellerProfile: {
            create: {
              businessName: `Evil Shop ${testSuffix}`,
              payoutAccountIdentifier: '+252615888888',
              verificationStatus: SellerVerificationStatus.VERIFIED,
            },
          },
        },
      });

      try {
        await expect(
          storesService.updateStore(
            victimStoreId,
            evilSeller.id,
            UserRole.SELLER,
            { name: 'Hijacked Store' },
          ),
        ).rejects.toThrow(ForbiddenException);
      } finally {
        await prisma.sellerProfile.deleteMany({ where: { userId: evilSeller.id } });
        await prisma.user.delete({ where: { id: evilSeller.id } });
      }
    });

    it('seller cannot bypass admin suspension of their store', async () => {
      // Suspend store by admin
      await storesService.adminReviewStore(victimStoreId, regularAdminId, {
        status: StoreStatus.SUSPENDED,
        reason: 'Fraud Investigation',
      });

      // Seller attempts to reactivate
      await expect(
        storesService.updateStore(
          victimStoreId,
          sellerUserId,
          UserRole.SELLER,
          { status: StoreStatus.ACTIVE },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
