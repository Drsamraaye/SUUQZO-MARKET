import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../src/database/prisma.module.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { InventoryModule } from '../../src/inventory/inventory.module.js';
import { InventoryService } from '../../src/inventory/inventory.service.js';
import { AuditLogsModule } from '../../src/audit-logs/audit-logs.module.js';
import { NotificationsModule } from '../../src/notifications/notifications.module.js';
import {
  UserRole,
  UserStatus,
  SellerVerificationStatus,
  StoreStatus,
  StockMovementType,
} from '@prisma/client';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('Phase 05: Inventory Management & Stock Transactions Integration Tests', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let inventoryService: InventoryService;

  const testSuffix = Date.now().toString().slice(-6);
  let sellerUserId: string;
  let competitorUserId: string;
  let storeId: string;
  let variantId: string;
  let categoryId: string;
  let productId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuditLogsModule, NotificationsModule, InventoryModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    inventoryService = moduleRef.get<InventoryService>(InventoryService);
    await moduleRef.init();

    // 1. Seller with Store
    const seller = await prisma.user.create({
      data: {
        phone: `+25261401${testSuffix}`,
        email: `inv_seller_${testSuffix}@suuqzo.test`,
        role: UserRole.SELLER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.SELLER],
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
        sellerProfile: {
          create: {
            businessName: `Warehouse Direct ${testSuffix}`,
            payoutAccountIdentifier: '+252614000000',
            verificationStatus: SellerVerificationStatus.VERIFIED,
            stores: {
              create: {
                name: `Warehouse Mogadishu ${testSuffix}`,
                slug: `warehouse-mgd-${testSuffix}`,
                city: 'Mogadishu',
                address: 'Industrial Zone',
                status: StoreStatus.ACTIVE,
              },
            },
          },
        },
      },
      include: { sellerProfile: { include: { stores: true } } },
    });
    sellerUserId = seller.id;
    storeId = seller.sellerProfile!.stores[0].id;

    // 2. Competitor
    const competitor = await prisma.user.create({
      data: {
        phone: `+25261402${testSuffix}`,
        email: `inv_competitor_${testSuffix}@suuqzo.test`,
        role: UserRole.SELLER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.SELLER],
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
      },
    });
    competitorUserId = competitor.id;

    // 3. Category & Product & Variant
    const category = await prisma.category.create({
      data: {
        name: `Hardware Tools ${testSuffix}`,
        slug: `hardware-tools-${testSuffix}`,
      },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        storeId,
        categoryId,
        title: `Industrial Power Drill ${testSuffix}`,
        slug: `power-drill-${testSuffix}`,
        description: 'Heavy duty drill',
        basePrice: 89.99,
        variants: {
          create: {
            title: 'Cordless 20V',
            sku: `DRILL-20V-${testSuffix}`,
            price: 89.99,
            attributes: { voltage: '20V' },
          },
        },
      },
      include: { variants: true },
    });
    productId = product.id;
    variantId = product.variants[0].id;
  }, 30000);

  afterAll(async () => {
    if (prisma) {
      const userIds = [sellerUserId, competitorUserId].filter(Boolean);
      if (userIds.length > 0) {
        await prisma.stockMovement.deleteMany({
          where: { inventoryItem: { storeId } },
        });
        await prisma.inventoryItem.deleteMany({ where: { storeId } });
        await prisma.productVariant.deleteMany({ where: { productId } });
        await prisma.product.deleteMany({ where: { id: productId } });
        await prisma.category.deleteMany({ where: { id: categoryId } });
        await prisma.store.deleteMany({ where: { id: storeId } });
        await prisma.sellerProfile.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    }
    if (moduleRef) {
      await moduleRef.close();
    }
  }, 30000);

  describe('1. Stock Movements & Transactions', () => {
    it('should restock inventory and record atomic movement', async () => {
      const result = await inventoryService.adjustStock(sellerUserId, UserRole.SELLER, {
        variantId,
        storeId,
        quantityChange: 50,
        type: StockMovementType.RESTOCK,
        notes: 'Initial bulk shipment from supplier',
        lowStockThreshold: 10,
      });

      expect(result.inventoryItem.quantityOnHand).toBe(50);
      expect(result.movement.quantityBefore).toBe(0);
      expect(result.movement.quantityAfter).toBe(50);
      expect(result.movement.quantityChange).toBe(50);
      expect(result.movement.type).toBe(StockMovementType.RESTOCK);
    });

    it('should reduce stock on sale or adjustment', async () => {
      const result = await inventoryService.adjustStock(sellerUserId, UserRole.SELLER, {
        variantId,
        storeId,
        quantityChange: -10,
        type: StockMovementType.PURCHASE_FULFILL,
        notes: 'Fulfillment deduction',
      });

      expect(result.inventoryItem.quantityOnHand).toBe(40);
      expect(result.movement.quantityBefore).toBe(50);
      expect(result.movement.quantityAfter).toBe(40);
      expect(result.movement.quantityChange).toBe(-10);
    });

    it('should prevent negative inventory (insufficient stock rejection)', async () => {
      await expect(
        inventoryService.adjustStock(sellerUserId, UserRole.SELLER, {
          variantId,
          storeId,
          quantityChange: -100, // Current on-hand is 40
          type: StockMovementType.PURCHASE_FULFILL,
          notes: 'Excessive deduction attempt',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should trigger low stock alert notification when stock falls below threshold', async () => {
      // Reduce stock down to 5 (threshold is 10)
      const result = await inventoryService.adjustStock(sellerUserId, UserRole.SELLER, {
        variantId,
        storeId,
        quantityChange: -35, // 40 - 35 = 5 <= threshold 10
        type: StockMovementType.PURCHASE_FULFILL,
        notes: 'Depleting stock',
      });

      expect(result.inventoryItem.quantityOnHand).toBe(5);

      const notification = await prisma.notification.findFirst({
        where: { userId: sellerUserId },
        orderBy: { createdAt: 'desc' },
      });
      expect(notification?.title).toBe('Low Stock Alert');
      expect(notification?.body).toContain('remaining');
    });
  });

  describe('2. Real-Time Availability & Multi-Tenant Isolation', () => {
    it('should return real-time stock availability', async () => {
      const availability = await inventoryService.getAvailability(variantId, storeId);
      expect(availability.quantityOnHand).toBe(5);
      expect(availability.reservedQuantity).toBe(0);
      expect(availability.availableQuantity).toBe(5);
      expect(availability.isInStock).toBe(true);
    });

    it('should forbid competitor from adjusting store inventory', async () => {
      await expect(
        inventoryService.adjustStock(competitorUserId, UserRole.SELLER, {
          variantId,
          storeId,
          quantityChange: 100,
          type: StockMovementType.RESTOCK,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
