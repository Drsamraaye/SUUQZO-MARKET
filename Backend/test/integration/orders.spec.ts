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
  ParentOrderStatus,
  SubOrderStatus,
  ReservationStatus,
} from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('Phase 06: Order Management & Lifecycle Integration Tests', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cartService: CartService;
  let checkoutService: CheckoutService;
  let ordersService: OrdersService;

  const testSuffix = Date.now().toString().slice(-6);
  let adminUserId: string;
  let customerUserId: string;
  let customerProfileId: string;
  let sellerUserId: string;
  let sellerProfileId: string;
  let storeId: string;
  let categoryId: string;
  let variantId: string;
  let inventoryItemId: string;

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

    // 1. Admin
    const admin = await prisma.user.create({
      data: {
        phone: `+25261601${testSuffix}`,
        email: `ord_admin_${testSuffix}@suuqzo.test`,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.ADMIN],
        passwordHash: '$argon2id$dummy',
      },
    });
    adminUserId = admin.id;

    // 2. Customer
    const cust = await prisma.user.create({
      data: {
        phone: `+25261602${testSuffix}`,
        email: `ord_cust_${testSuffix}@suuqzo.test`,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.CUSTOMER],
        passwordHash: '$argon2id$dummy',
      },
    });
    customerUserId = cust.id;

    const custProf = await prisma.customerProfile.create({
      data: {
        userId: customerUserId,
        firstName: 'Omar',
        lastName: `Hassan-${testSuffix}`,
      },
    });
    customerProfileId = custProf.id;

    // 3. Seller, Store, Product, Variant, Inventory
    const seller = await prisma.user.create({
      data: {
        phone: `+25261603${testSuffix}`,
        email: `ord_seller_${testSuffix}@suuqzo.test`,
        role: UserRole.SELLER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.SELLER],
        passwordHash: '$argon2id$dummy',
      },
    });
    sellerUserId = seller.id;

    const sellerProf = await prisma.sellerProfile.create({
      data: {
        userId: sellerUserId,
        businessName: `Order Store ${testSuffix}`,
        payoutAccountIdentifier: `+25261603${testSuffix}`,
        verificationStatus: SellerVerificationStatus.VERIFIED,
        commissionRate: 0.05,
      },
    });
    sellerProfileId = sellerProf.id;

    const store = await prisma.store.create({
      data: {
        sellerId: sellerProfileId,
        name: `Orders Testing Store ${testSuffix}`,
        slug: `ord-test-store-${testSuffix}`,
        city: 'Mogadishu',
        address: 'Waberi District',
        status: StoreStatus.ACTIVE,
      },
    });
    storeId = store.id;

    const cat = await prisma.category.create({
      data: {
        name: `Order Cat ${testSuffix}`,
        slug: `ord-cat-${testSuffix}`,
        isActive: true,
      },
    });
    categoryId = cat.id;

    const product = await prisma.product.create({
      data: {
        storeId,
        categoryId,
        title: `Order Product ${testSuffix}`,
        description: 'Testing order product lifecycle description',
        slug: `ord-product-${testSuffix}`,
        status: ProductStatus.PUBLISHED,
        basePrice: 50.0,
      },
    });

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `SKU-ORD-${testSuffix}`,
        title: 'Order Variant',
        price: 50.0,
        attributes: { size: 'L' },
      },
    });
    variantId = variant.id;

    const inv = await prisma.inventoryItem.create({
      data: {
        variantId,
        storeId,
        quantityOnHand: 100,
        reservedQuantity: 0,
      },
    });
    inventoryItemId = inv.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      if (inventoryItemId) {
        await prisma.stockMovement.deleteMany({
          where: { inventoryItemId },
        });
        await prisma.inventoryReservation.deleteMany({
          where: { inventoryItemId },
        });
      }
      if (storeId) {
        await prisma.orderItem.deleteMany({
          where: { subOrder: { storeId } },
        });
        await prisma.subOrder.deleteMany({
          where: { storeId },
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
      if (sellerProfileId) {
        await prisma.sellerProfile.deleteMany({ where: { id: sellerProfileId } });
      }
      if (customerProfileId) {
        await prisma.customerProfile.deleteMany({ where: { id: customerProfileId } });
      }
      const allUserIds = [adminUserId, customerUserId, sellerUserId].filter(Boolean);
      if (allUserIds.length > 0) {
        await prisma.user.deleteMany({
          where: { id: { in: allUserIds } },
        });
      }
    } catch (err) {
      console.error('Orders cleanup error:', err);
    }
    await moduleRef?.close();
  });

  let createdOrderId: string;
  let createdSubOrderId: string;

  it('1. should create an order via checkout for lifecycle testing', async () => {
    await cartService.addItem(customerUserId, {
      variantId,
      quantity: 2,
    });

    const order = await checkoutService.checkout(customerUserId, {
      idempotencyKey: `idemp-ord-test-${testSuffix}`,
      shippingAddress: {
        recipientName: 'Omar Hassan',
        phone: '+252616000000',
        city: 'Mogadishu',
        district: 'Waberi',
        street: 'Airport Road',
      },
    });

    expect(order).toBeDefined();
    createdOrderId = order.id;
    createdSubOrderId = order.subOrders[0].id;
  });

  it('2. customer should list their own orders', async () => {
    const list = await ordersService.findCustomerOrders(customerUserId, {
      page: 1,
      limit: 10,
    });

    expect(list.items.length).toBeGreaterThanOrEqual(1);
    const found = list.items.find((o) => o.id === createdOrderId);
    expect(found).toBeDefined();
    expect(found?.status).toBe(ParentOrderStatus.PENDING_PAYMENT);
  });

  it('3. customer should get single order details', async () => {
    const detail = await ordersService.findCustomerOrderById(
      customerUserId,
      createdOrderId,
    );

    expect(detail.id).toBe(createdOrderId);
    expect(detail.subOrders.length).toBe(1);
    expect(detail.subOrders[0].items.length).toBe(1);
  });

  it('4. customer should get order tracking breakdown', async () => {
    const tracking = await ordersService.getCustomerOrderTracking(
      customerUserId,
      createdOrderId,
    );

    expect(tracking.orderId).toBe(createdOrderId);
    expect(tracking.subOrders.length).toBe(1);
    expect(tracking.subOrders[0].storeName).toBe(`Orders Testing Store ${testSuffix}`);
    expect(tracking.subOrders[0].status).toBe(SubOrderStatus.PENDING_ACCEPTANCE);
  });

  it('5. seller should list their store suborders', async () => {
    const list = await ordersService.findSellerSuborders(sellerUserId, {
      page: 1,
      limit: 10,
    });

    expect(list.items.length).toBeGreaterThanOrEqual(1);
    const found = list.items.find((s) => s.id === createdSubOrderId);
    expect(found).toBeDefined();
    expect(found?.store.id).toBe(storeId);
  });

  it('6. seller should get suborder details', async () => {
    const suborder = await ordersService.findSellerSuborderById(
      sellerUserId,
      createdSubOrderId,
    );

    expect(suborder.id).toBe(createdSubOrderId);
    expect(suborder.items.length).toBe(1);
    expect(Number(suborder.items[0].unitPrice)).toBe(50);
  });

  it('7. seller should advance suborder: PENDING_ACCEPTANCE -> CONFIRMED', async () => {
    const updated = await ordersService.updateSellerSuborderStatus(
      sellerUserId,
      createdSubOrderId,
      { status: SubOrderStatus.CONFIRMED },
    );

    expect(updated.status).toBe(SubOrderStatus.CONFIRMED);
  });

  it('8. seller should advance suborder: CONFIRMED -> PROCESSING_PACKING and trigger parent order status update', async () => {
    const updated = await ordersService.updateSellerSuborderStatus(
      sellerUserId,
      createdSubOrderId,
      { status: SubOrderStatus.PROCESSING_PACKING },
    );

    expect(updated.status).toBe(SubOrderStatus.PROCESSING_PACKING);

    // Parent order status should now be reconciled to PARTIALLY_FULFILLED
    const parent = await prisma.order.findUnique({
      where: { id: createdOrderId },
    });
    expect(parent?.status).toBe(ParentOrderStatus.PARTIALLY_FULFILLED);
  });

  it('9. customer should NOT be allowed to cancel order once seller started processing', async () => {
    await expect(
      ordersService.cancelCustomerOrder(customerUserId, createdOrderId, {
        reason: 'Changed my mind',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('10. seller should advance suborder: PROCESSING_PACKING -> READY_FOR_PICKUP', async () => {
    const updated = await ordersService.updateSellerSuborderStatus(
      sellerUserId,
      createdSubOrderId,
      { status: SubOrderStatus.READY_FOR_PICKUP },
    );

    expect(updated.status).toBe(SubOrderStatus.READY_FOR_PICKUP);
  });

  it('11. customer cancellation test on a fresh PENDING_PAYMENT order (releases inventory)', async () => {
    // Create another order for cancellation testing
    await cartService.addItem(customerUserId, {
      variantId,
      quantity: 3,
    });

    const orderToCancel = await checkoutService.checkout(customerUserId, {
      idempotencyKey: `idemp-cancel-${testSuffix}`,
      shippingAddress: {
        recipientName: 'Omar Hassan',
        phone: '+252616000000',
        city: 'Mogadishu',
        district: 'Waberi',
        street: 'Airport Road',
      },
    });

    // Check inventory reserved before cancel
    const invBefore = await prisma.inventoryItem.findUnique({
      where: { id: inventoryItemId },
    });
    const reservedBefore = invBefore?.reservedQuantity ?? 0;

    // Customer cancels
    const result = await ordersService.cancelCustomerOrder(
      customerUserId,
      orderToCancel.id,
      { reason: 'Found a better price' },
    );

    expect(result.message).toContain('cancelled');

    // Verify parent order is CANCELLED
    const parent = await prisma.order.findUnique({
      where: { id: orderToCancel.id },
      include: { subOrders: true },
    });
    expect(parent?.status).toBe(ParentOrderStatus.CANCELLED);
    expect(parent?.subOrders[0].status).toBe(SubOrderStatus.CANCELLED);

    // Verify inventory reservation is RELEASED and reservedQuantity decremented by 3
    const invAfter = await prisma.inventoryItem.findUnique({
      where: { id: inventoryItemId },
    });
    expect(invAfter?.reservedQuantity).toBe(reservedBefore - 3);

    const reservation = await prisma.inventoryReservation.findFirst({
      where: { orderId: orderToCancel.id },
    });
    expect(reservation?.status).toBe(ReservationStatus.RELEASED);
  });

  it('12. admin should list all orders across the platform', async () => {
    const all = await ordersService.adminFindAllOrders({
      page: 1,
      limit: 10,
    });

    expect(all.items.length).toBeGreaterThanOrEqual(1);
    expect(all.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('13. admin should get order with complete audit details', async () => {
    const order = await ordersService.adminFindOrderById(createdOrderId);

    expect(order.id).toBe(createdOrderId);
    expect(order.customer).toBeDefined();
    expect(order.subOrders[0].seller).toBeDefined();
    expect(order.subOrders[0].items).toBeDefined();
  });

  it('14. admin should update order status (e.g. manual payment confirmation)', async () => {
    const updated = await ordersService.adminUpdateOrderStatus(
      adminUserId,
      createdOrderId,
      { status: ParentOrderStatus.CONFIRMED },
    );

    expect(updated.status).toBe(ParentOrderStatus.CONFIRMED);
  });
});
