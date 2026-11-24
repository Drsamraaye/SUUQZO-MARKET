import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../src/database/prisma.module.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { CartModule } from '../../src/cart/cart.module.js';
import { CartService } from '../../src/cart/cart.service.js';
import { AuditLogsModule } from '../../src/audit-logs/audit-logs.module.js';
import { NotificationsModule } from '../../src/notifications/notifications.module.js';
import {
  UserRole,
  UserStatus,
  SellerVerificationStatus,
  StoreStatus,
  ProductStatus,
} from '@prisma/client';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('Phase 06: Cart Integration Tests', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cartService: CartService;

  const testSuffix = Date.now().toString().slice(-6);
  let customerAUserId: string;
  let customerBUserId: string;
  let sellerUserId: string;
  let storeId: string;
  let categoryId: string;
  let productId: string;
  let variantId1: string;
  let variantId2: string;
  let unpublishedVariantId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuditLogsModule, NotificationsModule, CartModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    cartService = moduleRef.get<CartService>(CartService);
    await moduleRef.init();

    // 1. Create Customers
    const userA = await prisma.user.create({
      data: {
        phone: `+25261401${testSuffix}`,
        email: `cust_a_${testSuffix}@suuqzo.test`,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.CUSTOMER],
        passwordHash: '$argon2id$dummy',
      },
    });
    customerAUserId = userA.id;
    await prisma.customerProfile.create({
      data: {
        userId: customerAUserId,
        firstName: 'Customer',
        lastName: `A-${testSuffix}`,
      },
    });

    const userB = await prisma.user.create({
      data: {
        phone: `+25261402${testSuffix}`,
        email: `cust_b_${testSuffix}@suuqzo.test`,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.CUSTOMER],
        passwordHash: '$argon2id$dummy',
      },
    });
    customerBUserId = userB.id;
    await prisma.customerProfile.create({
      data: {
        userId: customerBUserId,
        firstName: 'Customer',
        lastName: `B-${testSuffix}`,
      },
    });

    // 2. Create Seller, Store, Category
    const seller = await prisma.user.create({
      data: {
        phone: `+25261403${testSuffix}`,
        email: `seller_cart_${testSuffix}@suuqzo.test`,
        role: UserRole.SELLER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.SELLER],
        passwordHash: '$argon2id$dummy',
      },
    });
    sellerUserId = seller.id;

    const sellerProfile = await prisma.sellerProfile.create({
      data: {
        userId: sellerUserId,
        businessName: `Cart Seller ${testSuffix}`,
        payoutAccountIdentifier: `+25261403${testSuffix}`,
        verificationStatus: SellerVerificationStatus.VERIFIED,
        commissionRate: 0.05,
      },
    });

    const store = await prisma.store.create({
      data: {
        sellerId: sellerProfile.id,
        name: `Cart Store ${testSuffix}`,
        slug: `cart-store-${testSuffix}`,
        city: 'Mogadishu',
        address: 'Waberi District',
        status: StoreStatus.ACTIVE,
      },
    });
    storeId = store.id;

    const cat = await prisma.category.create({
      data: {
        name: `Cart Cat ${testSuffix}`,
        slug: `cart-cat-${testSuffix}`,
        isActive: true,
      },
    });
    categoryId = cat.id;

    // 3. Published Product with 2 Variants
    const product = await prisma.product.create({
      data: {
        storeId,
        categoryId,
        title: `Cart Active Product ${testSuffix}`,
        description: 'Test cart product description',
        slug: `cart-active-prod-${testSuffix}`,
        status: ProductStatus.PUBLISHED,
        basePrice: 50.0,
      },
    });
    productId = product.id;

    const v1 = await prisma.productVariant.create({
      data: {
        productId,
        sku: `SKU-CART-V1-${testSuffix}`,
        title: 'Variant 1',
        price: 45.0,
        attributes: { size: 'L' },
      },
    });
    variantId1 = v1.id;

    await prisma.inventoryItem.create({
      data: {
        variantId: variantId1,
        storeId,
        quantityOnHand: 20,
        reservedQuantity: 0,
      },
    });

    const v2 = await prisma.productVariant.create({
      data: {
        productId,
        sku: `SKU-CART-V2-${testSuffix}`,
        title: 'Variant 2',
        price: 30.0,
        attributes: { size: 'M' },
      },
    });
    variantId2 = v2.id;

    await prisma.inventoryItem.create({
      data: {
        variantId: variantId2,
        storeId,
        quantityOnHand: 5,
        reservedQuantity: 0,
      },
    });

    // 4. Unpublished Product with Variant
    const unpubProd = await prisma.product.create({
      data: {
        storeId,
        categoryId,
        title: `Cart Draft Product ${testSuffix}`,
        description: 'Draft product description',
        slug: `cart-draft-prod-${testSuffix}`,
        status: ProductStatus.DRAFT,
        basePrice: 10.0,
      },
    });

    const vUnpub = await prisma.productVariant.create({
      data: {
        productId: unpubProd.id,
        sku: `SKU-CART-UNPUB-${testSuffix}`,
        title: 'Draft Variant',
        price: 10.0,
        attributes: {},
      },
    });
    unpublishedVariantId = vUnpub.id;

    await prisma.inventoryItem.create({
      data: {
        variantId: unpublishedVariantId,
        storeId,
        quantityOnHand: 10,
        reservedQuantity: 0,
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.cartItem.deleteMany({
        where: { variant: { sku: { contains: testSuffix } } },
      });
      if (customerAUserId || customerBUserId) {
        const userIds = [customerAUserId, customerBUserId].filter(Boolean);
        await prisma.cart.deleteMany({
          where: { customer: { userId: { in: userIds } } },
        });
      }
      if (storeId) {
        await prisma.inventoryItem.deleteMany({ where: { storeId } });
        await prisma.productVariant.deleteMany({
          where: { sku: { contains: testSuffix } },
        });
        await prisma.product.deleteMany({ where: { storeId } });
        await prisma.store.deleteMany({ where: { id: storeId } });
      }
      if (categoryId) {
        await prisma.category.deleteMany({ where: { id: categoryId } });
      }
      if (sellerUserId) {
        await prisma.sellerProfile.deleteMany({ where: { userId: sellerUserId } });
      }
      if (customerAUserId || customerBUserId) {
        const custIds = [customerAUserId, customerBUserId].filter(Boolean);
        await prisma.customerProfile.deleteMany({
          where: { userId: { in: custIds } },
        });
      }
      const allUserIds = [customerAUserId, customerBUserId, sellerUserId].filter(Boolean);
      if (allUserIds.length > 0) {
        await prisma.user.deleteMany({
          where: { id: { in: allUserIds } },
        });
      }
    } catch (err) {
      console.error('Cart cleanup error:', err);
    }
    await moduleRef?.close();
  });

  it('1. should add a valid product variant to cart', async () => {
    const cart = await cartService.addItem(customerAUserId, {
      variantId: variantId1,
      quantity: 2,
    });

    expect(cart).toBeDefined();
    expect(cart.stores.length).toBe(1);
    const allItems = cart.stores.flatMap((s) => s.items);
    expect(allItems.length).toBe(1);
    expect(allItems[0].variantId).toBe(variantId1);
    expect(allItems[0].quantity).toBe(2);
    expect(Number(allItems[0].unitPrice)).toBe(45);
    expect(Number(allItems[0].lineTotal)).toBe(90);
    expect(Number(cart.grandSubtotal)).toBe(90);
    expect(cart.totalItemsCount).toBe(2);
  });

  it('2. should increment quantity when adding the same variant again', async () => {
    const cart = await cartService.addItem(customerAUserId, {
      variantId: variantId1,
      quantity: 3,
    });

    const allItems = cart.stores.flatMap((s) => s.items);
    expect(allItems.length).toBe(1);
    expect(allItems[0].quantity).toBe(5);
    expect(Number(cart.grandSubtotal)).toBe(225); // 5 * 45
    expect(cart.totalItemsCount).toBe(5);
  });

  it('3. should reject adding variant from unpublished product', async () => {
    await expect(
      cartService.addItem(customerAUserId, {
        variantId: unpublishedVariantId,
        quantity: 1,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('4. should reject adding quantity that exceeds available inventory', async () => {
    // variantId2 has 5 units on hand
    await expect(
      cartService.addItem(customerAUserId, {
        variantId: variantId2,
        quantity: 10,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('5. should get customer cart grouped by store', async () => {
    // Add variant 2 with quantity 2
    await cartService.addItem(customerAUserId, {
      variantId: variantId2,
      quantity: 2,
    });

    const cart = await cartService.getCart(customerAUserId);
    const allItems = cart.stores.flatMap((s) => s.items);
    expect(allItems.length).toBe(2);
    expect(cart.stores.length).toBe(1);
    expect(cart.stores[0].store.id).toBe(storeId);
    expect(cart.stores[0].items.length).toBe(2);
    // 5 * 45 (225) + 2 * 30 (60) = 285
    expect(Number(cart.grandSubtotal)).toBe(285);
  });

  it('6. should update cart item quantity', async () => {
    const currentCart = await cartService.getCart(customerAUserId);
    const allItems = currentCart.stores.flatMap((s) => s.items);
    const item1 = allItems.find((i) => i.variantId === variantId1);
    expect(item1).toBeDefined();

    const updated = await cartService.updateItemQuantity(
      customerAUserId,
      item1!.id,
      { quantity: 4 },
    );

    const updatedItems = updated.stores.flatMap((s) => s.items);
    const updatedItem = updatedItems.find((i) => i.id === item1!.id);
    expect(updatedItem?.quantity).toBe(4);
    // 4 * 45 (180) + 2 * 30 (60) = 240
    expect(Number(updated.grandSubtotal)).toBe(240);
  });

  it('7. should reject updating cart item quantity beyond available stock', async () => {
    const currentCart = await cartService.getCart(customerAUserId);
    const allItems = currentCart.stores.flatMap((s) => s.items);
    const item2 = allItems.find((i) => i.variantId === variantId2);
    expect(item2).toBeDefined();

    await expect(
      cartService.updateItemQuantity(customerAUserId, item2!.id, {
        quantity: 999,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('8. should enforce customer cart isolation (Customer B cannot update Customer A item)', async () => {
    const currentCartA = await cartService.getCart(customerAUserId);
    const itemA = currentCartA.stores.flatMap((s) => s.items)[0];

    await expect(
      cartService.updateItemQuantity(customerBUserId, itemA.id, {
        quantity: 1,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('9. should remove single cart item', async () => {
    const currentCart = await cartService.getCart(customerAUserId);
    const allItems = currentCart.stores.flatMap((s) => s.items);
    const itemToRemove = allItems.find(
      (i) => i.variantId === variantId2,
    );

    const result = await cartService.removeItem(
      customerAUserId,
      itemToRemove!.id,
    );
    expect(result.message).toContain('removed');

    const updated = await cartService.getCart(customerAUserId);
    const updatedItems = updated.stores.flatMap((s) => s.items);
    expect(updatedItems.length).toBe(1);
    expect(updatedItems[0].variantId).toBe(variantId1);
  });

  it('10. should clear entire cart for authenticated customer', async () => {
    const result = await cartService.clearCart(customerAUserId);
    expect(result.message).toContain('cleared');

    const cart = await cartService.getCart(customerAUserId);
    const allItems = cart.stores.flatMap((s) => s.items);
    expect(allItems.length).toBe(0);
    expect(Number(cart.grandSubtotal)).toBe(0);
  });
});
