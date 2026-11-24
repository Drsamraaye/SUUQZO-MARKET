import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../src/database/prisma.module.js';
import { PrismaService } from '../../src/database/prisma.service.js';
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
import { ForbiddenException, ConflictException } from '@nestjs/common';

describe('Phase 04: Store Management & Tenant Isolation Integration Tests', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let storesService: StoresService;

  const testSuffix = Date.now().toString().slice(-6);
  let adminId: string;
  let verifiedSellerUserId: string;
  let unverifiedSellerUserId: string;
  let competitorSellerUserId: string;
  let createdStoreId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuditLogsModule, NotificationsModule, StoresModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    storesService = moduleRef.get<StoresService>(StoresService);
    await moduleRef.init();

    // 1. Admin
    const admin = await prisma.user.create({
      data: {
        phone: `+25261700${testSuffix}`,
        email: `store_admin_${testSuffix}@suuqzo.test`,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.ADMIN],
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
      },
    });
    adminId = admin.id;

    // 2. Verified Seller
    const verifiedSellerUser = await prisma.user.create({
      data: {
        phone: `+25261701${testSuffix}`,
        email: `verified_seller_${testSuffix}@suuqzo.test`,
        role: UserRole.SELLER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.SELLER],
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
        sellerProfile: {
          create: {
            businessName: `Mogadishu Mega Electronics ${testSuffix}`,
            payoutAccountIdentifier: '+252615111111',
            verificationStatus: SellerVerificationStatus.VERIFIED,
          },
        },
      },
    });
    verifiedSellerUserId = verifiedSellerUser.id;

    // 3. Unverified Seller (Pending Review)
    const unverifiedSellerUser = await prisma.user.create({
      data: {
        phone: `+25261702${testSuffix}`,
        email: `unverified_${testSuffix}@suuqzo.test`,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.CUSTOMER],
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
        sellerProfile: {
          create: {
            businessName: `Pending Shop ${testSuffix}`,
            payoutAccountIdentifier: '+252615222222',
            verificationStatus: SellerVerificationStatus.PENDING_REVIEW,
          },
        },
      },
    });
    unverifiedSellerUserId = unverifiedSellerUser.id;

    // 4. Competitor Seller (Verified)
    const competitor = await prisma.user.create({
      data: {
        phone: `+25261703${testSuffix}`,
        email: `competitor_${testSuffix}@suuqzo.test`,
        role: UserRole.SELLER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.SELLER],
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
        sellerProfile: {
          create: {
            businessName: `Competitor Boutique ${testSuffix}`,
            payoutAccountIdentifier: '+252615333333',
            verificationStatus: SellerVerificationStatus.VERIFIED,
          },
        },
      },
    });
    competitorSellerUserId = competitor.id;
  }, 30000);

  afterAll(async () => {
    if (prisma) {
      const userIds = [
        adminId,
        verifiedSellerUserId,
        unverifiedSellerUserId,
        competitorSellerUserId,
      ].filter(Boolean);

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

  describe('1. Store Creation Eligibility & Verification Gates', () => {
    it('should reject store creation if seller profile is not VERIFIED', async () => {
      await expect(
        storesService.createStore(unverifiedSellerUserId, {
          name: 'Unauthorized Store',
          city: 'Mogadishu',
          address: 'KM4',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should create store successfully for verified seller', async () => {
      const store = await storesService.createStore(verifiedSellerUserId, {
        name: `Mogadishu Hub ${testSuffix}`,
        city: 'Mogadishu',
        district: 'Hodan',
        address: 'KM4 Maka Al Mukarama Road',
        phone: '+252615998877',
      });

      expect(store).toBeDefined();
      expect(store.status).toBe(StoreStatus.ACTIVE);
      expect(store.slug).toBeDefined();
      expect(store.city).toBe('Mogadishu');
      createdStoreId = store.id;

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: { entityName: 'Store', entityId: store.id },
      });
      expect(auditLog?.action).toBe('STORE_CREATED');
    });

    it('should reject duplicate explicit custom slug', async () => {
      const customSlug = `unique-tech-${testSuffix}`;
      await storesService.createStore(verifiedSellerUserId, {
        name: 'Tech Store 1',
        slug: customSlug,
        city: 'Mogadishu',
        address: 'Bakaara',
      });

      await expect(
        storesService.createStore(verifiedSellerUserId, {
          name: 'Tech Store 2',
          slug: customSlug,
          city: 'Mogadishu',
          address: 'Bakaara',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('2. Multi-Tenant Ownership Isolation', () => {
    it('should forbid competitor seller from updating another sellers store', async () => {
      await expect(
        storesService.updateStore(
          createdStoreId,
          competitorSellerUserId,
          UserRole.SELLER,
          { name: 'Malicious Store Hijack' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow the rightful store owner to update their store', async () => {
      const updated = await storesService.updateStore(
        createdStoreId,
        verifiedSellerUserId,
        UserRole.SELLER,
        { description: 'Premium Somali Electronics & Gadgets' },
      );

      expect(updated.description).toBe('Premium Somali Electronics & Gadgets');
    });

    it('should allow platform admin to update or configure store', async () => {
      const updated = await storesService.updateStore(
        createdStoreId,
        adminId,
        UserRole.ADMIN,
        { district: 'Wadajir' },
      );

      expect(updated.district).toBe('Wadajir');
    });
  });

  describe('3. Store Suspension & Reinstatement Protection', () => {
    it('should allow admin to suspend a store and record audit log', async () => {
      const suspended = await storesService.adminReviewStore(
        createdStoreId,
        adminId,
        {
          status: StoreStatus.SUSPENDED,
          reason: 'Counterfeit product investigation',
        },
      );

      expect(suspended.status).toBe(StoreStatus.SUSPENDED);

      const log = await prisma.auditLog.findFirst({
        where: { entityName: 'Store', entityId: createdStoreId },
        orderBy: { createdAt: 'desc' },
      });
      expect(log?.action).toBe('STORE_STATUS_SUSPENDED');
    });

    it('should forbid seller from self-reinstating a suspended store', async () => {
      await expect(
        storesService.updateStore(
          createdStoreId,
          verifiedSellerUserId,
          UserRole.SELLER,
          { status: StoreStatus.ACTIVE },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin to reinstate suspended store', async () => {
      const reinstated = await storesService.adminReviewStore(
        createdStoreId,
        adminId,
        {
          status: StoreStatus.ACTIVE,
          reason: 'Cleared of all allegations',
          isFeatured: true,
        },
      );

      expect(reinstated.status).toBe(StoreStatus.ACTIVE);
      expect(reinstated.isFeatured).toBe(true);
    });
  });

  describe('4. Store Catalog & Public Discovery', () => {
    it('should retrieve store by slug', async () => {
      const store = await prisma.store.findUnique({ where: { id: createdStoreId } });
      const found = await storesService.getBySlug(store!.slug);
      expect(found.id).toBe(createdStoreId);
      expect(found.seller).toBeDefined();
    });

    it('should list only active stores for public view', async () => {
      const list = await storesService.listStores({ limit: 10 }, true);
      expect(list.items.every((s) => s.status === StoreStatus.ACTIVE)).toBe(true);
    });
  });
});
