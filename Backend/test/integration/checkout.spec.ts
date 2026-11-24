import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../src/database/prisma.module.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { CartModule } from '../../src/cart/cart.module.js';
import { CartService } from '../../src/cart/cart.service.js';
import { CheckoutModule } from '../../src/checkout/checkout.module.js';
import { CheckoutService } from '../../src/checkout/checkout.service.js';
import { AuditLogsModule } from '../../src/audit-logs/audit-logs.module.js';
import { NotificationsModule } from '../../src/notifications/notifications.module.js';
import {
  UserRole,
  UserStatus,
  SellerVerificationStatus,
  StoreStatus,
  ProductStatus,
  ParentOrderStatus,
  SubOrderStatus,
  ReservationStatus,
  StockMovementType,
} from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('Phase 06: Multi-Vendor Checkout Integration Tests', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cartService: CartService;
  let checkoutService: CheckoutService;

  const testSuffix = Date.now().toString().slice(-6);
  let customerUserId: string;
  let customerProfileId: string;
  let seller1UserId: string;
  let seller1ProfileId: string;
  let store1Id: string;
  let seller2UserId: string;
  let seller2ProfileId: string;
  let store2Id: string;
  let categoryId: string;

  let variantStore1Id: string;
  let inventoryStore1Id: string;
  let variantStore2Id: string;
  let inventoryStore2Id: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        PrismaModule,
        AuditLogsModule,
        NotificationsModule,
        CartModule,
        CheckoutModule,
      ],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    cartService = moduleRef.get<CartService>(CartService);
    checkoutService = moduleRef.get<CheckoutService>(CheckoutService);
    await moduleRef.init();

    // 1. Create Customer
    const user = await prisma.user.create({
      data: {
        phone: `+25261501${testSuffix}`,
        email: `chk_cust_${testSuffix}@suuqzo.test`,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.CUSTOMER],
        passwordHash: '$argon2id$dummy',
      },
    });
    customerUserId = user.id;

    const custProf = await prisma.customerProfile.create({
      data: {
        userId: customerUserId,
        firstName: 'Ali',
        lastName: `Customer-${testSuffix}`,
      },
    });
    customerProfileId = custProf.id;

    // 2. Create Category
    const cat = await prisma.category.create({
      data: {
        name: `Checkout Cat ${testSuffix}`,
        slug: `chk-cat-${testSuffix}`,
        isActive: true,
      },
    });
    categoryId = cat.id;

    // 3. Create Store 1 & Seller 1 (5% commission)
    const s1 = await prisma.user.create({
      data: {
        phone: `+25261502${testSuffix}`,
        email: `chk_s1_${testSuffix}@suuqzo.test`,
        role: UserRole.SELLER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.SELLER],
        passwordHash: '$argon2id$dummy',
      },
    });
    seller1UserId = s1.id;

    const s1Prof = await prisma.sellerProfile.create({
      data: {
        userId: seller1UserId,
        businessName: `Store 1 Seller ${testSuffix}`,
        payoutAccountIdentifier: `+25261502${testSuffix}`,
        verificationStatus: SellerVerificationStatus.VERIFIED,
        commissionRate: 0.05,
      },
    });
    seller1ProfileId = s1Prof.id;

    const store1 = await prisma.store.create({
      data: {
        sellerId: seller1ProfileId,
        name: `Store One ${testSuffix}`,
        slug: `store-one-${testSuffix}`,
        city: 'Mogadishu',
        address: 'Hodan District',
        status: StoreStatus.ACTIVE,
      },
    });
    store1Id = store1.id;

    // Store 1 Product & Variant
    const prod1 = await prisma.product.create({
      data: {
        storeId: store1Id,
        categoryId,
        title: `Product S1 ${testSuffix}`,
        description: 'Store 1 product description',
        slug: `prod-s1-${testSuffix}`,
        status: ProductStatus.PUBLISHED,
        basePrice: 90.0,
      },
    });

    const v1 = await prisma.productVariant.create({
      data: {
        productId: prod1.id,
        sku: `SKU-CHK-S1-${testSuffix}`,
        title: 'Variant S1',
        price: 90.0,
        attributes: { size: 'XL' },
      },
    });
    variantStore1Id = v1.id;

    const inv1 = await prisma.inventoryItem.create({
      data: {
        variantId: variantStore1Id,
        storeId: store1Id,
        quantityOnHand: 25,
        reservedQuantity: 0,
      },
    });
    inventoryStore1Id = inv1.id;

    // 4. Create Store 2 & Seller 2
    const s2 = await prisma.user.create({
      data: {
        phone: `+25261503${testSuffix}`,
        email: `chk_s2_${testSuffix}@suuqzo.test`,
        role: UserRole.SELLER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.SELLER],
        passwordHash: '$argon2id$dummy',
      },
    });
    seller2UserId = s2.id;

    const s2Prof = await prisma.sellerProfile.create({
      data: {
        userId: seller2UserId,
        businessName: `Store 2 Seller ${testSuffix}`,
        payoutAccountIdentifier: `+25261503${testSuffix}`,
        verificationStatus: SellerVerificationStatus.VERIFIED,
        commissionRate: 0.05,
      },
    });
    seller2ProfileId = s2Prof.id;

    const store2 = await prisma.store.create({
      data: {
        sellerId: seller2ProfileId,
        name: `Store Two ${testSuffix}`,
        slug: `store-two-${testSuffix}`,
        city: 'Mogadishu',
        address: 'Wadajir District',
        status: StoreStatus.ACTIVE,
      },
    });
    store2Id = store2.id;

    // Store 2 Product & Variant
    const prod2 = await prisma.product.create({
      data: {
        storeId: store2Id,
        categoryId,
        title: `Product S2 ${testSuffix}`,
        description: 'Store 2 product description',
        slug: `prod-s2-${testSuffix}`,
        status: ProductStatus.PUBLISHED,
        basePrice: 60.0,
      },
    });

    const v2 = await prisma.productVariant.create({
      data: {
        productId: prod2.id,
        sku: `SKU-CHK-S2-${testSuffix}`,
        title: 'Variant S2',
        price: 60.0,
        attributes: { color: 'Blue' },
      },
    });
    variantStore2Id = v2.id;

    const inv2 = await prisma.inventoryItem.create({
      data: {
        variantId: variantStore2Id,
        storeId: store2Id,
        quantityOnHand: 15,
        reservedQuantity: 0,
      },
    });
    inventoryStore2Id = inv2.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      const storeIds = [store1Id, store2Id].filter(Boolean);
      if (storeIds.length > 0) {
        await prisma.stockMovement.deleteMany({
          where: { inventoryItem: { storeId: { in: storeIds } } },
        });
        await prisma.inventoryReservation.deleteMany({
          where: { inventoryItem: { storeId: { in: storeIds } } },
        });
        await prisma.orderItem.deleteMany({
          where: { subOrder: { storeId: { in: storeIds } } },
        });
        await prisma.subOrder.deleteMany({
          where: { storeId: { in: storeIds } },
        });
      }
      if (customerProfileId) {
        await prisma.order.deleteMany({
          where: { customerId: customerProfileId },
        });
        await prisma.cartItem.deleteMany({
          where: { variant: { sku: { contains: testSuffix } } },
        });
        await prisma.cart.deleteMany({
          where: { customerId: customerProfileId },
        });
      }
      if (storeIds.length > 0) {
        await prisma.inventoryItem.deleteMany({
          where: { storeId: { in: storeIds } },
        });
        await prisma.productVariant.deleteMany({
          where: { sku: { contains: testSuffix } },
        });
        await prisma.product.deleteMany({
          where: { storeId: { in: storeIds } },
        });
      }
      if (categoryId) {
        await prisma.category.deleteMany({ where: { id: categoryId } });
      }
      if (storeIds.length > 0) {
        await prisma.store.deleteMany({
          where: { id: { in: storeIds } },
        });
      }
      const sellerProfileIds = [seller1ProfileId, seller2ProfileId].filter(Boolean);
      if (sellerProfileIds.length > 0) {
        await prisma.sellerProfile.deleteMany({
          where: { id: { in: sellerProfileIds } },
        });
      }
      if (customerProfileId) {
        await prisma.customerProfile.deleteMany({
          where: { id: customerProfileId },
        });
      }
      const allUserIds = [customerUserId, seller1UserId, seller2UserId].filter(Boolean);
      if (allUserIds.length > 0) {
        await prisma.user.deleteMany({
          where: { id: { in: allUserIds } },
        });
      }
    } catch (err) {
      console.error('Checkout cleanup error:', err);
    }
    await moduleRef?.close();
  });

  it('1. should reject checkout if customer cart is empty', async () => {
    await expect(
      checkoutService.checkout(customerUserId, {
        idempotencyKey: `idemp-empty-${testSuffix}`,
        shippingAddress: {
          recipientName: 'Ali Customer',
          phone: '+252615011111',
          city: 'Mogadishu',
          district: 'Hodan',
          street: 'Wadada Maka Al Mukarama',
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('2. should execute atomic multi-vendor checkout with 1 ParentOrder and 2 SubOrders', async () => {
    // Add items from Store 1 and Store 2 into customer cart
    await cartService.addItem(customerUserId, {
      variantId: variantStore1Id,
      quantity: 2, // 2 * 90.0 = 180.0
    });

    await cartService.addItem(customerUserId, {
      variantId: variantStore2Id,
      quantity: 3, // 3 * 60.0 = 180.0
    });

    const idempotencyKey = `idemp-mv-${testSuffix}`;
    const orderResponse = await checkoutService.checkout(customerUserId, {
      idempotencyKey,
      shippingAddress: {
        recipientName: 'Ali Customer',
        phone: '+252615011111',
        city: 'Mogadishu',
        district: 'Hodan',
        street: 'Wadada Maka Al Mukarama',
      },
      customerNotes: 'Please ring the doorbell',
    });

    // Verify Parent Order
    expect(orderResponse).toBeDefined();
    expect(orderResponse.orderNumber).toMatch(/^SQ-/);
    expect(orderResponse.status).toBe(ParentOrderStatus.PENDING_PAYMENT);
    // Subtotal: 180 (S1) + 180 (S2) = 360.00
    expect(Number(orderResponse.totalAmount)).toBe(360);
    expect(orderResponse.subOrders.length).toBe(2);

    // Verify SubOrder for Store 1
    const sub1 = orderResponse.subOrders.find((s: any) => s.store.id === store1Id);
    expect(sub1).toBeDefined();
    expect(sub1.subOrderNumber).toMatch(/^SQS-/);
    expect(sub1.status).toBe(SubOrderStatus.PENDING_ACCEPTANCE);
    expect(Number(sub1.totalAmount)).toBe(180);
    // Commission is 5%: 180 * 0.05 = 9.00
    expect(Number(sub1.commissionAmount)).toBe(9);
    // Seller payable: 180 - 9 = 171.00
    expect(Number(sub1.sellerPayableAmount)).toBe(171);
    expect(sub1.items.length).toBe(1);
    expect(sub1.items[0].productTitleSnapshot).toBe(`Product S1 ${testSuffix}`);
    expect(sub1.items[0].skuSnapshot).toBe(`SKU-CHK-S1-${testSuffix}`);
    expect(Number(sub1.items[0].unitPriceSnapshot)).toBe(90);
    expect(sub1.items[0].quantity).toBe(2);

    // Verify SubOrder for Store 2
    const sub2 = orderResponse.subOrders.find((s: any) => s.store.id === store2Id);
    expect(sub2).toBeDefined();
    expect(Number(sub2.totalAmount)).toBe(180);
    expect(Number(sub2.commissionAmount)).toBe(9);
    expect(Number(sub2.sellerPayableAmount)).toBe(171);
    expect(sub2.items[0].skuSnapshot).toBe(`SKU-CHK-S2-${testSuffix}`);
    expect(Number(sub2.items[0].unitPriceSnapshot)).toBe(60);

    // Verify Inventory Reservations in database
    const inv1 = await prisma.inventoryItem.findUnique({
      where: { id: inventoryStore1Id },
    });
    expect(inv1?.reservedQuantity).toBe(2);

    const inv2 = await prisma.inventoryItem.findUnique({
      where: { id: inventoryStore2Id },
    });
    expect(inv2?.reservedQuantity).toBe(3);

    const reservations = await prisma.inventoryReservation.findMany({
      where: { orderId: orderResponse.id },
    });
    expect(reservations.length).toBe(2);
    expect(reservations.every((r) => r.status === ReservationStatus.ACTIVE)).toBe(true);

    // Verify StockMovements created
    const movements = await prisma.stockMovement.findMany({
      where: { referenceId: orderResponse.id },
    });
    expect(movements.length).toBe(2);
    expect(movements.every((m) => m.type === StockMovementType.PURCHASE_RESERVE)).toBe(true);

    // Verify Cart is cleared
    const cart = await cartService.getCart(customerUserId);
    expect(cart.stores.length).toBe(0);
  });

  it('3. should support idempotency (submitting same key returns existing order without duplicates)', async () => {
    // Add 1 item
    await cartService.addItem(customerUserId, {
      variantId: variantStore1Id,
      quantity: 1,
    });

    const key = `idemp-repeat-${testSuffix}`;
    const firstCall = await checkoutService.checkout(customerUserId, {
      idempotencyKey: key,
      shippingAddress: {
        recipientName: 'Ali Customer',
        phone: '+252615011111',
        city: 'Mogadishu',
        district: 'Hodan',
        street: 'Wadada Maka Al Mukarama',
      },
    });

    // Immediate second call with identical idempotencyKey
    const secondCall = await checkoutService.checkout(customerUserId, {
      idempotencyKey: key,
      shippingAddress: {
        recipientName: 'Ali Customer',
        phone: '+252615011111',
        city: 'Mogadishu',
        district: 'Hodan',
        street: 'Wadada Maka Al Mukarama',
      },
    });

    expect(secondCall.id).toBe(firstCall.id);
    expect(secondCall.orderNumber).toBe(firstCall.orderNumber);

    // Verify no duplicate order in DB with that key
    const allMatching = await prisma.order.findMany({
      where: {
        shippingAddressSnapshot: {
          path: ['idempotencyKey'],
          equals: key,
        },
      },
    });
    expect(allMatching.length).toBe(1);
  });

  it('4. should reject checkout if stock was depleted before checkout', async () => {
    // Set inventory to 0 available
    await prisma.inventoryItem.update({
      where: { id: inventoryStore2Id },
      data: { quantityOnHand: 5, reservedQuantity: 5 }, // 0 available
    });

    // Add to cart directly in DB to simulate racing condition
    const cart = await prisma.cart.findFirst({
      where: { customerId: customerProfileId },
    });

    await prisma.cartItem.create({
      data: {
        cartId: cart!.id,
        variantId: variantStore2Id,
        quantity: 1,
        unitPrice: 60.0,
      },
    });

    await expect(
      checkoutService.checkout(customerUserId, {
        idempotencyKey: `idemp-nostock-${testSuffix}`,
        shippingAddress: {
          recipientName: 'Ali Customer',
          phone: '+252615011111',
          city: 'Mogadishu',
          district: 'Hodan',
          street: 'Wadada Maka Al Mukarama',
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
