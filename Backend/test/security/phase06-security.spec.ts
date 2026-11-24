import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../src/database/prisma.module.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { CartModule } from '../../src/cart/cart.module.js';
import { CartService } from '../../src/cart/cart.service.js';
import { CheckoutModule } from '../../src/checkout/checkout.module.js';
import { CheckoutService } from '../../src/checkout/checkout.service.js';
import { OrdersModule } from '../../src/orders/orders.module.js';
import { OrdersService } from '../../src/orders/orders.service.js';
import { AuditLogsModule } from '../../src/audit-logs/audit-logs.module.js';
import { NotificationsModule } from '../../src/notifications/notifications.module.js';
import {
  UserRole,
  UserStatus,
  SellerVerificationStatus,
  StoreStatus,
  ProductStatus,
  SubOrderStatus,
} from '@prisma/client';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('Phase 06: Security & Authorization Boundary Tests', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cartService: CartService;
  let checkoutService: CheckoutService;
  let ordersService: OrdersService;

  const testSuffix = Date.now().toString().slice(-6);
  let customerAUserId: string;
  let customerBUserId: string;
  let sellerAUserId: string;
  let sellerAProfileId: string;
  let storeAId: string;
  let sellerBUserId: string;
  let sellerBProfileId: string;
  let storeBId: string;
  let categoryId: string;
  let variantAId: string;

  let orderAId: string;
  let subOrderAId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        PrismaModule,
        AuditLogsModule,
        NotificationsModule,
        CartModule,
        CheckoutModule,
        OrdersModule,
      ],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    cartService = moduleRef.get<CartService>(CartService);
    checkoutService = moduleRef.get<CheckoutService>(CheckoutService);
    ordersService = moduleRef.get<OrdersService>(OrdersService);
    await moduleRef.init();

    // 1. Customer A
    const custA = await prisma.user.create({
      data: {
        phone: `+25261701${testSuffix}`,
        email: `sec_cust_a_${testSuffix}@suuqzo.test`,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.CUSTOMER],
        passwordHash: '$argon2id$dummy',
      },
    });
    customerAUserId = custA.id;
    await prisma.customerProfile.create({
      data: {
        userId: customerAUserId,
        firstName: 'Customer',
        lastName: `A-${testSuffix}`,
      },
    });

    // 2. Customer B
    const custB = await prisma.user.create({
      data: {
        phone: `+25261702${testSuffix}`,
        email: `sec_cust_b_${testSuffix}@suuqzo.test`,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.CUSTOMER],
        passwordHash: '$argon2id$dummy',
      },
    });
    customerBUserId = custB.id;
    await prisma.customerProfile.create({
      data: {
        userId: customerBUserId,
        firstName: 'Customer',
        lastName: `B-${testSuffix}`,
      },
    });

    // 3. Category
    const cat = await prisma.category.create({
      data: {
        name: `Sec Cat ${testSuffix}`,
        slug: `sec-cat-${testSuffix}`,
        isActive: true,
      },
    });
    categoryId = cat.id;

    // 4. Seller A & Store A
    const sellerA = await prisma.user.create({
      data: {
        phone: `+25261703${testSuffix}`,
        email: `sec_seller_a_${testSuffix}@suuqzo.test`,
        role: UserRole.SELLER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.SELLER],
        passwordHash: '$argon2id$dummy',
      },
    });
    sellerAUserId = sellerA.id;

    const sAProf = await prisma.sellerProfile.create({
      data: {
        userId: sellerAUserId,
        businessName: `Store A Business ${testSuffix}`,
        payoutAccountIdentifier: `+25261703${testSuffix}`,
        verificationStatus: SellerVerificationStatus.VERIFIED,
        commissionRate: 0.05,
      },
    });
    sellerAProfileId = sAProf.id;

    const stA = await prisma.store.create({
      data: {
        sellerId: sellerAProfileId,
        name: `Sec Store A ${testSuffix}`,
        slug: `sec-store-a-${testSuffix}`,
        city: 'Mogadishu',
        address: 'Hodan District',
        status: StoreStatus.ACTIVE,
      },
    });
    storeAId = stA.id;

    const prodA = await prisma.product.create({
      data: {
        storeId: storeAId,
        categoryId,
        title: `Sec Product A ${testSuffix}`,
        description: 'Sec product description',
        slug: `sec-prod-a-${testSuffix}`,
        status: ProductStatus.PUBLISHED,
        basePrice: 80.0,
      },
    });

    const vA = await prisma.productVariant.create({
      data: {
        productId: prodA.id,
        sku: `SKU-SEC-A-${testSuffix}`,
        title: 'Variant A',
        price: 80.0,
        attributes: { size: 'M' },
      },
    });
    variantAId = vA.id;

    await prisma.inventoryItem.create({
      data: {
        variantId: variantAId,
        storeId: storeAId,
        quantityOnHand: 50,
        reservedQuantity: 0,
      },
    });

    // 5. Seller B & Store B
    const sellerB = await prisma.user.create({
      data: {
        phone: `+25261704${testSuffix}`,
        email: `sec_seller_b_${testSuffix}@suuqzo.test`,
        role: UserRole.SELLER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.SELLER],
        passwordHash: '$argon2id$dummy',
      },
    });
    sellerBUserId = sellerB.id;

    const sBProf = await prisma.sellerProfile.create({
      data: {
        userId: sellerBUserId,
        businessName: `Store B Business ${testSuffix}`,
        payoutAccountIdentifier: `+25261704${testSuffix}`,
        verificationStatus: SellerVerificationStatus.VERIFIED,
        commissionRate: 0.05,
      },
    });
    sellerBProfileId = sBProf.id;

    const stB = await prisma.store.create({
      data: {
        sellerId: sellerBProfileId,
        name: `Sec Store B ${testSuffix}`,
        slug: `sec-store-b-${testSuffix}`,
        city: 'Mogadishu',
        address: 'Wadajir District',
        status: StoreStatus.ACTIVE,
      },
    });
    storeBId = stB.id;

    // Create an initial order for Customer A from Store A
    await cartService.addItem(customerAUserId, {
      variantId: variantAId,
      quantity: 1,
    });

    const order = await checkoutService.checkout(customerAUserId, {
      idempotencyKey: `idemp-sec-init-${testSuffix}`,
      shippingAddress: {
        recipientName: 'Customer A',
        phone: '+252617011111',
        city: 'Mogadishu',
        district: 'Hodan',
        street: 'Street 1',
      },
    });

    orderAId = order.id;
    subOrderAId = order.subOrders[0].id;
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      const storeIds = [storeAId, storeBId].filter(Boolean);
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
      if (customerAUserId || customerBUserId) {
        const userIds = [customerAUserId, customerBUserId].filter(Boolean);
        await prisma.order.deleteMany({
          where: { customer: { userId: { in: userIds } } },
        });
        await prisma.cartItem.deleteMany({
          where: { variant: { sku: { contains: testSuffix } } },
        });
        await prisma.cart.deleteMany({
          where: { customer: { userId: { in: userIds } } },
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
      const sellerProfileIds = [sellerAProfileId, sellerBProfileId].filter(Boolean);
      if (sellerProfileIds.length > 0) {
        await prisma.sellerProfile.deleteMany({
          where: { id: { in: sellerProfileIds } },
        });
      }
      if (customerAUserId || customerBUserId) {
        const custIds = [customerAUserId, customerBUserId].filter(Boolean);
        await prisma.customerProfile.deleteMany({
          where: { userId: { in: custIds } },
        });
      }
      const allUserIds = [customerAUserId, customerBUserId, sellerAUserId, sellerBUserId].filter(Boolean);
      if (allUserIds.length > 0) {
        await prisma.user.deleteMany({
          where: { id: { in: allUserIds } },
        });
      }
    } catch (err) {
      console.error('Security tests cleanup error:', err);
    }
    await moduleRef?.close();
  });

  it('1. IDOR Prevention: Customer B cannot view Customer A order', async () => {
    await expect(
      ordersService.findCustomerOrderById(customerBUserId, orderAId),
    ).rejects.toThrow(ForbiddenException);
  });

  it('2. IDOR Prevention: Customer B cannot cancel Customer A order', async () => {
    await expect(
      ordersService.cancelCustomerOrder(customerBUserId, orderAId, {
        reason: 'Malicious cancel attempt',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('3. IDOR Prevention: Seller B cannot view Seller A suborder', async () => {
    await expect(
      ordersService.findSellerSuborderById(sellerBUserId, subOrderAId),
    ).rejects.toThrow(ForbiddenException);
  });

  it('4. IDOR Prevention: Seller B cannot update status of Seller A suborder', async () => {
    await expect(
      ordersService.updateSellerSuborderStatus(sellerBUserId, subOrderAId, {
        status: SubOrderStatus.CONFIRMED,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('5. IDOR Prevention: Seller B cannot reject Seller A suborder', async () => {
    await expect(
      ordersService.rejectSellerSuborder(sellerBUserId, subOrderAId, {
        reason: 'Malicious rejection attempt',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('6. Status Escalation Prevention: Seller cannot jump states directly to DELIVERED', async () => {
    await expect(
      ordersService.updateSellerSuborderStatus(sellerAUserId, subOrderAId, {
        status: SubOrderStatus.DELIVERED,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('7. Price Tampering Prevention: Checkout strictly computes DB variant price regardless of payload', async () => {
    await cartService.addItem(customerBUserId, {
      variantId: variantAId,
      quantity: 1,
    });

    const order = await checkoutService.checkout(customerBUserId, {
      idempotencyKey: `idemp-price-tamper-${testSuffix}`,
      shippingAddress: {
        recipientName: 'Customer B',
        phone: '+252617022222',
        city: 'Mogadishu',
        district: 'Hodan',
        street: 'Street 2',
      },
    });

    // Real DB price is 80.0
    expect(Number(order.totalAmount)).toBe(80);
    expect(Number(order.subOrders[0].items[0].unitPriceSnapshot)).toBe(80);
  });
});
