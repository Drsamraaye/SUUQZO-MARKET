import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../src/database/prisma.module.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { ProductsModule } from '../../src/products/products.module.js';
import { ProductsService } from '../../src/products/products.service.js';
import { AuditLogsModule } from '../../src/audit-logs/audit-logs.module.js';
import { NotificationsModule } from '../../src/notifications/notifications.module.js';
import {
  UserRole,
  UserStatus,
  SellerVerificationStatus,
  StoreStatus,
  ProductStatus,
} from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

describe('Phase 05: Product & Variant Management Integration Tests', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let productsService: ProductsService;

  const testSuffix = Date.now().toString().slice(-6);
  let sellerUserId: string;
  let competitorUserId: string;
  let storeId: string;
  let categoryId: string;
  let createdProductId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuditLogsModule, NotificationsModule, ProductsModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    productsService = moduleRef.get<ProductsService>(ProductsService);
    await moduleRef.init();

    // 1. Legitimate verified seller with store
    const seller = await prisma.user.create({
      data: {
        phone: `+25261501${testSuffix}`,
        email: `seller_prod_${testSuffix}@suuqzo.test`,
        role: UserRole.SELLER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.SELLER],
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
        sellerProfile: {
          create: {
            businessName: `Mogadishu Digital Hub ${testSuffix}`,
            payoutAccountIdentifier: '+252615011111',
            verificationStatus: SellerVerificationStatus.VERIFIED,
            stores: {
              create: {
                name: `Digital Hub Flagship ${testSuffix}`,
                slug: `digital-hub-${testSuffix}`,
                city: 'Mogadishu',
                address: 'KM5 Maka Al Mukarama',
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

    // 2. Competitor seller
    const competitor = await prisma.user.create({
      data: {
        phone: `+25261502${testSuffix}`,
        email: `competitor_prod_${testSuffix}@suuqzo.test`,
        role: UserRole.SELLER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.SELLER],
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
      },
    });
    competitorUserId = competitor.id;

    // 3. Category
    const category = await prisma.category.create({
      data: {
        name: `Laptops & Computers ${testSuffix}`,
        slug: `laptops-computers-${testSuffix}`,
        isActive: true,
      },
    });
    categoryId = category.id;
  }, 30000);

  afterAll(async () => {
    if (prisma) {
      const userIds = [sellerUserId, competitorUserId].filter(Boolean);
      if (userIds.length > 0) {
        // Cascade delete products and inventory items
        await prisma.stockMovement.deleteMany({
          where: { inventoryItem: { storeId } },
        });
        await prisma.inventoryItem.deleteMany({ where: { storeId } });
        await prisma.productImage.deleteMany({
          where: { product: { storeId } },
        });
        await prisma.productVariant.deleteMany({
          where: { product: { storeId } },
        });
        await prisma.product.deleteMany({ where: { storeId } });
        await prisma.store.deleteMany({ where: { id: storeId } });
        await prisma.sellerProfile.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
      if (categoryId) {
        await prisma.category.deleteMany({ where: { id: categoryId } });
      }
    }
    if (moduleRef) {
      await moduleRef.close();
    }
  }, 30000);

  describe('1. Product Creation & Store Ownership Gates', () => {
    it('should forbid competitor from creating a product in another sellers store', async () => {
      await expect(
        productsService.create(competitorUserId, UserRole.SELLER, {
          storeId,
          categoryId,
          title: 'Unauthorized Laptop',
          description: 'Hacking attempt',
          basePrice: 500,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject invalid pricing (negative base price)', async () => {
      await expect(
        productsService.create(sellerUserId, UserRole.SELLER, {
          storeId,
          categoryId,
          title: 'Negative Price Item',
          description: 'Test',
          basePrice: -50,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject compareAtPrice lower than basePrice', async () => {
      await expect(
        productsService.create(sellerUserId, UserRole.SELLER, {
          storeId,
          categoryId,
          title: 'Invalid Discount',
          description: 'Test',
          basePrice: 100,
          compareAtPrice: 80,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create product with variants, initial inventory, and images successfully', async () => {
      const product = await productsService.create(sellerUserId, UserRole.SELLER, {
        storeId,
        categoryId,
        title: `MacBook Pro M3 ${testSuffix}`,
        slug: `macbook-pro-m3-${testSuffix}`,
        description: 'High performance laptop with Apple M3 chip',
        basePrice: 1599.99,
        compareAtPrice: 1799.99,
        variants: [
          {
            title: '16GB RAM / 512GB SSD - Space Gray',
            sku: `MBP-M3-16-512-${testSuffix}`,
            price: 1599.99,
            attributes: { ram: '16GB', storage: '512GB', color: 'Space Gray' },
            initialStock: 10,
          },
          {
            title: '32GB RAM / 1TB SSD - Silver',
            sku: `MBP-M3-32-1TB-${testSuffix}`,
            price: 1999.99,
            attributes: { ram: '32GB', storage: '1TB', color: 'Silver' },
            initialStock: 5,
          },
        ],
        images: [
          {
            url: 'https://storage.suuqzo.test/products/mbp-front.jpg',
            altText: 'MacBook Pro Front View',
            isPrimary: true,
            sortOrder: 0,
          },
          {
            url: 'https://storage.suuqzo.test/products/mbp-side.jpg',
            altText: 'MacBook Pro Side Profile',
            isPrimary: false,
            sortOrder: 1,
          },
        ],
      });

      expect(product).toBeDefined();
      expect(product?.status).toBe(ProductStatus.DRAFT);
      expect(product?.variants.length).toBe(2);
      expect(product?.images.length).toBe(2);
      expect(product?.images[0].isPrimary).toBe(true);

      // Verify inventory items created
      expect(product?.variants[0].inventoryItems.length).toBe(1);
      expect(product?.variants[0].inventoryItems[0].quantityOnHand).toBe(10);
      expect(product?.variants[1].inventoryItems[0].quantityOnHand).toBe(5);

      createdProductId = product!.id;
    });

    it('should reject duplicate SKU across the system', async () => {
      await expect(
        productsService.create(sellerUserId, UserRole.SELLER, {
          storeId,
          categoryId,
          title: 'Duplicate SKU Laptop',
          description: 'Testing SKU uniqueness',
          basePrice: 1200,
          variants: [
            {
              title: 'Conflict SKU variant',
              sku: `MBP-M3-16-512-${testSuffix}`,
              price: 1200,
            },
          ],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject duplicate slug in same store', async () => {
      await expect(
        productsService.create(sellerUserId, UserRole.SELLER, {
          storeId,
          categoryId,
          title: 'Duplicate Slug Laptop',
          slug: `macbook-pro-m3-${testSuffix}`,
          description: 'Same slug',
          basePrice: 1200,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('2. Product Updates & Modifications', () => {
    it('should allow owner seller to update product fields', async () => {
      const updated = await productsService.update(
        createdProductId,
        sellerUserId,
        UserRole.SELLER,
        {
          description: 'Updated description: Includes AppleCare+ warranty option',
          basePrice: 1549.99,
        },
      );

      expect(updated?.description).toBe('Updated description: Includes AppleCare+ warranty option');
      expect(Number(updated?.basePrice)).toBe(1549.99);
    });

    it('should prevent competitor from updating another sellers product', async () => {
      await expect(
        productsService.update(
          createdProductId,
          competitorUserId,
          UserRole.SELLER,
          { basePrice: 1.0 },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should forbid seller from directly publishing product without approval', async () => {
      await expect(
        productsService.update(
          createdProductId,
          sellerUserId,
          UserRole.SELLER,
          { status: ProductStatus.PUBLISHED },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('3. Product Archival', () => {
    it('should allow seller to archive product', async () => {
      const archived = await productsService.archive(
        createdProductId,
        sellerUserId,
        UserRole.SELLER,
      );

      expect(archived.status).toBe(ProductStatus.ARCHIVED);
    });
  });
});
