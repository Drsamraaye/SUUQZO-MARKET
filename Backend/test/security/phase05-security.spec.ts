import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../src/database/prisma.module.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { ProductsModule } from '../../src/products/products.module.js';
import { ProductsService } from '../../src/products/products.service.js';
import { StoresModule } from '../../src/stores/stores.module.js';
import { StoresService } from '../../src/stores/stores.service.js';
import { AuditLogsModule } from '../../src/audit-logs/audit-logs.module.js';
import { NotificationsModule } from '../../src/notifications/notifications.module.js';
import {
  UserRole,
  UserStatus,
  SellerVerificationStatus,
  StoreStatus,
  ProductStatus,
} from '@prisma/client';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('Phase 05: Moderation Workflow & Public Isolation Security Tests', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let productsService: ProductsService;
  let storesService: StoresService;

  const testSuffix = Date.now().toString().slice(-6);
  let adminUserId: string;
  let sellerUserId: string;
  let storeId: string;
  let categoryId: string;
  let testProductId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        PrismaModule,
        AuditLogsModule,
        NotificationsModule,
        StoresModule,
        ProductsModule,
      ],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    productsService = moduleRef.get<ProductsService>(ProductsService);
    storesService = moduleRef.get<StoresService>(StoresService);
    await moduleRef.init();

    // 1. Admin User
    const admin = await prisma.user.create({
      data: {
        phone: `+25261300${testSuffix}`,
        email: `mod_admin_${testSuffix}@suuqzo.test`,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.ADMIN],
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
      },
    });
    adminUserId = admin.id;

    // 2. Verified Seller with Store
    const seller = await prisma.user.create({
      data: {
        phone: `+25261301${testSuffix}`,
        email: `mod_seller_${testSuffix}@suuqzo.test`,
        role: UserRole.SELLER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.SELLER],
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
        sellerProfile: {
          create: {
            businessName: `Somali Apparel Hub ${testSuffix}`,
            payoutAccountIdentifier: '+252613111111',
            verificationStatus: SellerVerificationStatus.VERIFIED,
            stores: {
              create: {
                name: `Apparel Store ${testSuffix}`,
                slug: `apparel-store-${testSuffix}`,
                city: 'Mogadishu',
                address: 'Waberi District',
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

    // 3. Category
    const category = await prisma.category.create({
      data: {
        name: `Clothing & Fashion ${testSuffix}`,
        slug: `clothing-fashion-${testSuffix}`,
        isActive: true,
      },
    });
    categoryId = category.id;

    // 4. Create a draft product with variant and image
    const product = await productsService.create(sellerUserId, UserRole.SELLER, {
      storeId,
      categoryId,
      title: `Traditional Somali Macawiis ${testSuffix}`,
      slug: `macawiis-${testSuffix}`,
      description: 'Handwoven cotton Macawiis',
      basePrice: 25.0,
      variants: [
        {
          title: 'Standard Size - Blue Plaid',
          sku: `MAC-BLU-${testSuffix}`,
          price: 25.0,
        },
      ],
      images: [
        {
          url: 'https://storage.suuqzo.test/products/macawiis-1.jpg',
          isPrimary: true,
        },
      ],
    });
    testProductId = product!.id;
  }, 30000);

  afterAll(async () => {
    if (prisma) {
      const userIds = [adminUserId, sellerUserId].filter(Boolean);
      if (userIds.length > 0) {
        await prisma.stockMovement.deleteMany({
          where: { inventoryItem: { storeId } },
        });
        await prisma.inventoryItem.deleteMany({ where: { storeId } });
        await prisma.productImage.deleteMany({ where: { productId: testProductId } });
        await prisma.productVariant.deleteMany({ where: { productId: testProductId } });
        await prisma.product.deleteMany({ where: { id: testProductId } });
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

  describe('1. Product Moderation Lifecycle', () => {
    it('draft product should be hidden from public catalog', async () => {
      await expect(productsService.findById(testProductId, true)).rejects.toThrow(
        NotFoundException,
      );

      const publicList = await productsService.queryProducts(
        { search: `Traditional Somali Macawiis ${testSuffix}` },
        true,
      );
      expect(publicList.items.length).toBe(0);
    });

    it('seller submits product for review -> status transitions to PENDING_REVIEW', async () => {
      const submitted = await productsService.submitForReview(testProductId, sellerUserId);
      expect(submitted.status).toBe(ProductStatus.PENDING_REVIEW);
    });

    it('pending review product remains hidden from public catalog', async () => {
      await expect(productsService.findById(testProductId, true)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('admin approves product -> status transitions to PUBLISHED', async () => {
      const approved = await productsService.moderateProduct(testProductId, adminUserId, {
        action: 'APPROVE',
      });

      expect(approved.status).toBe(ProductStatus.PUBLISHED);

      // Verify notification sent to seller
      const notification = await prisma.notification.findFirst({
        where: { userId: sellerUserId, title: 'Product Moderation: APPROVE' },
      });
      expect(notification).toBeDefined();
    });

    it('published product now appears in public catalog and search', async () => {
      const publicProduct = await productsService.findById(testProductId, true);
      expect(publicProduct.id).toBe(testProductId);
      expect(publicProduct.status).toBe(ProductStatus.PUBLISHED);

      const publicSearch = await productsService.queryProducts(
        { search: `Macawiis ${testSuffix}` },
        true,
      );
      expect(publicSearch.items.length).toBe(1);
      expect(publicSearch.items[0].id).toBe(testProductId);
    });
  });

  describe('2. Anti-Conflict: Self-Approval Prevention', () => {
    it('administrator cannot approve or moderate products from their own store', async () => {
      // 1. Give admin an approved seller profile & store
      const adminSeller = await prisma.sellerProfile.create({
        data: {
          userId: adminUserId,
          businessName: `Admin Personal Shop ${testSuffix}`,
          payoutAccountIdentifier: '+252613999999',
          verificationStatus: SellerVerificationStatus.VERIFIED,
          stores: {
            create: {
              name: `Admin Store ${testSuffix}`,
              slug: `admin-store-${testSuffix}`,
              city: 'Mogadishu',
              address: 'KM4',
              status: StoreStatus.ACTIVE,
            },
          },
        },
        include: { stores: true },
      });

      const adminStoreId = adminSeller.stores[0].id;

      // 2. Create product in admin's store
      const adminProduct = await productsService.create(adminUserId, UserRole.ADMIN, {
        storeId: adminStoreId,
        categoryId,
        title: `Admin Conflict Watch ${testSuffix}`,
        description: 'Testing self-approval defense',
        basePrice: 199.0,
      });

      try {
        // 3. Admin attempts to approve their own product
        await expect(
          productsService.moderateProduct(adminProduct!.id, adminUserId, {
            action: 'APPROVE',
          }),
        ).rejects.toThrow(ForbiddenException);
      } finally {
        await prisma.inventoryItem.deleteMany({ where: { storeId: adminStoreId } });
        await prisma.productVariant.deleteMany({ where: { productId: adminProduct!.id } });
        await prisma.product.deleteMany({ where: { id: adminProduct!.id } });
        await prisma.store.deleteMany({ where: { id: adminStoreId } });
        await prisma.sellerProfile.deleteMany({ where: { id: adminSeller.id } });
      }
    });
  });

  describe('3. Store Suspension Product Masking', () => {
    it('when a store is suspended, all its published products become invisible to public', async () => {
      // Suspend store
      await storesService.adminReviewStore(storeId, adminUserId, {
        status: StoreStatus.SUSPENDED,
        reason: 'Investigation into vendor policy breach',
      });

      // Product query must now return 404 for public
      await expect(productsService.findById(testProductId, true)).rejects.toThrow(
        NotFoundException,
      );

      // Public catalog search must exclude products from suspended store
      const publicSearch = await productsService.queryProducts(
        { search: `Macawiis ${testSuffix}` },
        true,
      );
      expect(publicSearch.items.length).toBe(0);

      // Reinstate store
      await storesService.adminReviewStore(storeId, adminUserId, {
        status: StoreStatus.ACTIVE,
        reason: 'Reinstated',
      });

      // Visible again
      const restored = await productsService.findById(testProductId, true);
      expect(restored.id).toBe(testProductId);
    });
  });
});
