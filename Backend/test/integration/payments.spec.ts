import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../src/database/prisma.module.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { PaymentsModule } from '../../src/payments/payments.module.js';
import { PaymentsService } from '../../src/payments/payments.service.js';
import { RefundsService } from '../../src/payments/refunds.service.js';
import { FinancialLedgerService } from '../../src/payments/financial-ledger.service.js';
import { AuditLogsModule } from '../../src/audit-logs/audit-logs.module.js';
import { NotificationsModule } from '../../src/notifications/notifications.module.js';
import {
  PaymentMethod,
  PaymentStatus,
  ParentOrderStatus,
  SubOrderStatus,
  RefundStatus,
  RefundReason,
  ReservationStatus,
  Prisma,
} from '@prisma/client';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('Phase 07: Payment Integration & Lifecycle Integration Tests', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let paymentsService: PaymentsService;
  let refundsService: RefundsService;
  let ledgerService: FinancialLedgerService;

  const testSuffix = Date.now().toString().slice(-6);
  let adminUserId: string;
  let customerAUserId: string;
  let customerAProfileId: string;
  let customerBUserId: string;
  let sellerUserId: string;
  let sellerProfileId: string;
  let storeId: string;
  let categoryId: string;
  let variantId: string;
  let inventoryItemId: string;

  let orderAId: string;
  let orderANumber: string;
  let subOrderAId: string;
  let paymentAId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        PrismaModule,
        AuditLogsModule,
        NotificationsModule,
        PaymentsModule,
      ],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    paymentsService = moduleRef.get<PaymentsService>(PaymentsService);
    refundsService = moduleRef.get<RefundsService>(RefundsService);
    ledgerService = moduleRef.get<FinancialLedgerService>(FinancialLedgerService);
    await moduleRef.init();

    // 1. Admin
    const admin = await prisma.user.create({
      data: {
        email: `pay_admin_${testSuffix}@suuqzo.test`,
        phone: `+25261${testSuffix}10`,
        passwordHash: 'dummy_hash',
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
    adminUserId = admin.id;

    // 2. Customer A
    const custA = await prisma.user.create({
      data: {
        email: `custA_${testSuffix}@suuqzo.test`,
        phone: `+25261${testSuffix}11`,
        passwordHash: 'dummy_hash',
        role: 'CUSTOMER',
        status: 'ACTIVE',
      },
    });
    customerAUserId = custA.id;
    const profileA = await prisma.customerProfile.create({
      data: {
        userId: custA.id,
        firstName: 'Ahmed',
        lastName: 'Nur',
      },
    });
    customerAProfileId = profileA.id;

    // 3. Customer B (for IDOR tests)
    const custB = await prisma.user.create({
      data: {
        email: `custB_${testSuffix}@suuqzo.test`,
        phone: `+25261${testSuffix}12`,
        passwordHash: 'dummy_hash',
        role: 'CUSTOMER',
        status: 'ACTIVE',
      },
    });
    customerBUserId = custB.id;
    await prisma.customerProfile.create({
      data: {
        userId: custB.id,
        firstName: 'Jama',
        lastName: 'Farah',
      },
    });

    // 4. Seller & Store
    const sellerUser = await prisma.user.create({
      data: {
        email: `seller_${testSuffix}@suuqzo.test`,
        phone: `+25261${testSuffix}13`,
        passwordHash: 'dummy_hash',
        role: 'SELLER',
        status: 'ACTIVE',
      },
    });
    sellerUserId = sellerUser.id;

    const seller = await prisma.sellerProfile.create({
      data: {
        userId: sellerUser.id,
        businessName: `Payment Test Store ${testSuffix}`,
        verificationStatus: 'VERIFIED',
        payoutAccountIdentifier: `25261${testSuffix}13`,
        defaultPayoutMethod: 'ZAAD',
        isDailyPayoutEligible: true,
      },
    });
    sellerProfileId = seller.id;

    const store = await prisma.store.create({
      data: {
        sellerId: seller.id,
        name: `Flagship Store ${testSuffix}`,
        slug: `flagship-${testSuffix}`,
        status: 'ACTIVE',
        city: 'Hargeisa',
        address: 'Downtown Main St',
      },
    });
    storeId = store.id;

    // 5. Category & Product & Variant & Inventory
    const cat = await prisma.category.create({
      data: {
        name: `Pay Cat ${testSuffix}`,
        slug: `pay-cat-${testSuffix}`,
      },
    });
    categoryId = cat.id;

    const prod = await prisma.product.create({
      data: {
        storeId: store.id,
        categoryId: cat.id,
        title: `Payment Test Smartphone ${testSuffix}`,
        description: 'Smartphone for payment testing',
        slug: `phone-${testSuffix}`,
        status: 'PUBLISHED',
        basePrice: new Prisma.Decimal('100.00'),
      },
    });

    const variant = await prisma.productVariant.create({
      data: {
        productId: prod.id,
        sku: `SKU-${testSuffix}`,
        title: 'Default Black',
        price: new Prisma.Decimal('100.00'),
        attributes: { color: 'black' },
      },
    });
    variantId = variant.id;

    const inv = await prisma.inventoryItem.create({
      data: {
        storeId: store.id,
        variantId: variant.id,
        quantityOnHand: 20,
        reservedQuantity: 2,
      },
    });
    inventoryItemId = inv.id;

    // 6. Create Seed Order A (Total: $105.00: $100 items + $5 delivery)
    orderANumber = `SQ-${Date.now()}-${testSuffix}`;
    const order = await prisma.order.create({
      data: {
        orderNumber: orderANumber,
        customerId: customerAProfileId,
        status: ParentOrderStatus.PENDING_PAYMENT,
        grossMerchandiseValue: new Prisma.Decimal('100.00'),
        subtotalAmount: new Prisma.Decimal('100.00'),
        deliveryFeeAmount: new Prisma.Decimal('5.00'),
        taxAmount: new Prisma.Decimal('0.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        totalPayable: new Prisma.Decimal('105.00'),
        currency: 'USD',
        shippingAddressSnapshot: { street: 'Jigjiga Yar', city: 'Hargeisa' },
      },
    });
    orderAId = order.id;

    const subOrder = await prisma.subOrder.create({
      data: {
        subOrderNumber: `${orderANumber}-01`,
        parentOrderId: order.id,
        sellerId: seller.id,
        storeId: store.id,
        status: SubOrderStatus.PENDING_ACCEPTANCE,
        itemsSubtotal: new Prisma.Decimal('100.00'),
        deliveryFee: new Prisma.Decimal('5.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('105.00'),
        commissionRate: new Prisma.Decimal('0.0500'),
        commissionAmount: new Prisma.Decimal('5.00'), // 5% of $100
        sellerPayableAmount: new Prisma.Decimal('100.00'), // $105 total - $5 commission
      },
    });
    subOrderAId = subOrder.id;

    await prisma.inventoryReservation.create({
      data: {
        inventoryItemId: inv.id,
        variantId: variant.id,
        orderId: order.id,
        subOrderId: subOrder.id,
        quantity: 1,
        status: ReservationStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      // Delete refunds, payments, transactions, ledger entries
      await prisma.refund.deleteMany({ where: { orderId: orderAId } });
      await prisma.paymentTransaction.deleteMany({
        where: { payment: { orderId: orderAId } },
      });
      await prisma.payment.deleteMany({ where: { orderId: orderAId } });
      await prisma.providerWebhookEvent.deleteMany({
        where: { provider: 'CENTRALIZED_AGGREGATOR' },
      });

      const testTxs = await prisma.ledgerTransaction.findMany({
        where: { description: { contains: testSuffix } },
      });
      for (const tx of testTxs) {
        await prisma.ledgerEntry.deleteMany({ where: { transactionId: tx.id } });
        await prisma.ledgerTransaction.delete({ where: { id: tx.id } });
      }

      await prisma.inventoryReservation.deleteMany({
        where: { inventoryItemId },
      });
      await prisma.stockMovement.deleteMany({
        where: { inventoryItemId },
      });
      await prisma.inventoryItem.deleteMany({
        where: { id: inventoryItemId },
      });
      await prisma.productVariant.deleteMany({ where: { id: variantId } });
      await prisma.product.deleteMany({ where: { storeId } });
      await prisma.category.deleteMany({ where: { id: categoryId } });
      await prisma.subOrder.deleteMany({ where: { parentOrderId: orderAId } });
      await prisma.order.deleteMany({ where: { id: orderAId } });
      await prisma.store.deleteMany({ where: { id: storeId } });

      await prisma.ledgerEntry.deleteMany({
        where: { account: { accountCode: `2010-${sellerProfileId}` } },
      });
      await prisma.ledgerAccount.deleteMany({
        where: { accountCode: `2010-${sellerProfileId}` },
      });

      if (sellerProfileId) {
        await prisma.sellerProfile.delete({ where: { id: sellerProfileId } });
      }
      if (customerAProfileId) {
        await prisma.customerProfile.delete({ where: { id: customerAProfileId } });
      }
      await prisma.customerProfile.deleteMany({
        where: { user: { email: { contains: testSuffix } } },
      });
      await prisma.user.deleteMany({
        where: { email: { contains: testSuffix } },
      });
    } catch (e) {
      console.warn('Error in payments test cleanup:', e);
    }
    await moduleRef.close();
  });

  it('1. should reject payment creation if customer does not own the order (IDOR)', async () => {
    await expect(
      paymentsService.createPayment(customerBUserId, {
        orderId: orderAId,
        paymentMethod: PaymentMethod.EVC_PLUS,
        payerPhone: '+252615555555',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('2. should initialize payment session successfully for order owner', async () => {
    const result = await paymentsService.createPayment(customerAUserId, {
      orderId: orderAId,
      paymentMethod: PaymentMethod.EVC_PLUS,
      payerPhone: '+252615555555',
    });

    expect(result).toBeDefined();
    expect(result.payment).toBeDefined();
    expect(result.payment.paymentNumber).toMatch(/^PAY-/);
    expect(result.payment.status).toBe(PaymentStatus.PENDING);
    expect(new Prisma.Decimal(result.payment.amount).equals('105.00')).toBe(true);
    expect(result.payment.providerReference).toBeDefined();

    paymentAId = result.payment.id;

    // Verify Order advanced to PAYMENT_PROCESSING
    const updatedOrder = await prisma.order.findUnique({ where: { id: orderAId } });
    expect(updatedOrder?.status).toBe(ParentOrderStatus.PAYMENT_PROCESSING);
  });

  it('3. should return existing payment session idempotently on duplicate create', async () => {
    const result = await paymentsService.createPayment(customerAUserId, {
      orderId: orderAId,
      paymentMethod: PaymentMethod.EVC_PLUS,
      payerPhone: '+252615555555',
    });

    expect(result).toBeDefined();
    expect(result.isIdempotent).toBe(true);
    expect(result.payment.id).toBe(paymentAId);
  });

  it('4. should reject webhook with forged or invalid HMAC signature', async () => {
    const invalidPayload = {
      eventId: `evt-${Date.now()}`,
      providerReference: 'AGG-INVALID-REF',
      status: 'CAPTURED',
    };

    await expect(
      paymentsService.processWebhookEvent(
        'CENTRALIZED_AGGREGATOR',
        invalidPayload,
        { 'x-aggregator-signature': 'forged_invalid_signature_hex' },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('5. should capture payment via valid signed webhook, confirm order, consume reservations, and post ledger', async () => {
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentAId } });
    const eventId = `evt-${Date.now()}-${testSuffix}`;

    const webhookPayload = {
      eventId,
      eventType: 'PAYMENT_CONFIRMATION',
      providerReference: payment.providerReference,
      providerTransactionId: `TXN-WAAFI-${testSuffix}`,
      amount: '105.00',
      currency: 'USD',
      status: 'CAPTURED',
      timestamp: new Date().toISOString(),
    };

    // Calculate valid HMAC-SHA256 signature using default secret
    const secret = process.env.PAYMENT_AGGREGATOR_WEBHOOK_SECRET || 'suuqzo-default-webhook-secret-key-32b';
    const signature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(webhookPayload))
      .digest('hex');

    const result = await paymentsService.processWebhookEvent(
      'CENTRALIZED_AGGREGATOR',
      webhookPayload,
      { 'x-aggregator-signature': signature },
    );

    expect(result).toBeDefined();
    expect(result.isSuccess).toBe(true);
    expect(result.status).toBe(PaymentStatus.CAPTURED);

    // 1. Verify Payment is CAPTURED
    const updatedPayment = await prisma.payment.findUnique({ where: { id: paymentAId } });
    expect(updatedPayment?.status).toBe(PaymentStatus.CAPTURED);
    expect(updatedPayment?.capturedAt).toBeDefined();

    // 2. Verify Order is CONFIRMED
    const updatedOrder = await prisma.order.findUnique({ where: { id: orderAId } });
    expect(updatedOrder?.status).toBe(ParentOrderStatus.CONFIRMED);

    // 3. Verify SubOrder is CONFIRMED
    const updatedSubOrder = await prisma.subOrder.findUnique({ where: { id: subOrderAId } });
    expect(updatedSubOrder?.status).toBe(SubOrderStatus.CONFIRMED);

    // 4. Verify Inventory Reservation is CONSUMED
    const reservation = await prisma.inventoryReservation.findFirst({
      where: { orderId: orderAId },
    });
    expect(reservation?.status).toBe(ReservationStatus.CONSUMED);

    // 5. Verify Seller Balance in Ledger reflects $100.00 sellerPayable
    const sellerBal = await ledgerService.getSellerBalance(sellerProfileId);
    expect(new Prisma.Decimal(sellerBal.availableBalance).equals('100.00')).toBe(true);
  });

  it('6. should handle duplicate webhook event idempotently without double-posting', async () => {
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentAId } });
    const duplicatePayload = {
      eventId: `evt-duplicate-${testSuffix}`,
      providerReference: payment.providerReference,
      status: 'CAPTURED',
    };

    const secret = process.env.PAYMENT_AGGREGATOR_WEBHOOK_SECRET || 'suuqzo-default-webhook-secret-key-32b';
    const signature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(duplicatePayload))
      .digest('hex');

    const result = await paymentsService.processWebhookEvent(
      'CENTRALIZED_AGGREGATOR',
      duplicatePayload,
      { 'x-aggregator-signature': signature },
    );

    expect(result).toBeDefined();
    expect(result.isIdempotent).toBe(true);
  });

  it('7. should execute partial refund against captured payment and post ledger reversal', async () => {
    // Refund $20.00 of the $105.00 captured payment
    const refund = await refundsService.createRefund(adminUserId, {
      paymentId: paymentAId,
      subOrderId: subOrderAId,
      amount: 20.0,
      reason: RefundReason.DAMAGED_ITEM,
      adminNotes: 'Damaged packaging partial courtesy refund',
    });

    expect(refund).toBeDefined();
    expect(refund.refundNumber).toMatch(/^REF-/);
    expect(refund.status).toBe(RefundStatus.COMPLETED);
    expect(new Prisma.Decimal(refund.amount).equals('20.00')).toBe(true);
    // 5% commission on $20 = $1.00; seller debit = $19.00
    expect(new Prisma.Decimal(refund.commissionRefundAmount).equals('1.00')).toBe(true);
    expect(new Prisma.Decimal(refund.sellerDebitAmount).equals('19.00')).toBe(true);

    // Verify Payment status is PARTIALLY_REFUNDED
    const payment = await prisma.payment.findUnique({ where: { id: paymentAId } });
    expect(payment?.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);

    // Verify Seller Available Balance decreased from $100.00 to $81.00 ($100 - $19)
    const sellerBal = await ledgerService.getSellerBalance(sellerProfileId);
    expect(new Prisma.Decimal(sellerBal.availableBalance).equals('81.00')).toBe(true);
  });

  it('8. should reject refund amount exceeding remaining refundable balance', async () => {
    // Remaining refundable is $105 - $20 = $85. Requesting $90 must fail.
    await expect(
      refundsService.createRefund(adminUserId, {
        paymentId: paymentAId,
        amount: 90.0,
        reason: RefundReason.CUSTOMER_CANCELLED,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('9. should execute full remaining refund and transition payment/order to REFUNDED', async () => {
    // Refund remaining $85.00
    const refund = await refundsService.createRefund(adminUserId, {
      paymentId: paymentAId,
      subOrderId: subOrderAId,
      amount: 85.0,
      reason: RefundReason.CUSTOMER_CANCELLED,
    });

    expect(refund.status).toBe(RefundStatus.COMPLETED);

    // Verify Payment and Order are REFUNDED
    const payment = await prisma.payment.findUnique({ where: { id: paymentAId } });
    expect(payment?.status).toBe(PaymentStatus.REFUNDED);

    const order = await prisma.order.findUnique({ where: { id: orderAId } });
    expect(order?.status).toBe(ParentOrderStatus.REFUNDED);
  });

  it('10. should handle Bank Transfer payment and admin verification workflow', async () => {
    // 1. Create Order for Bank Transfer
    const btOrderNumber = `SQ-BT-${Date.now()}-${testSuffix}`;
    const btOrder = await prisma.order.create({
      data: {
        orderNumber: btOrderNumber,
        customerId: customerAProfileId,
        status: ParentOrderStatus.PENDING_PAYMENT,
        grossMerchandiseValue: new Prisma.Decimal('50.00'),
        subtotalAmount: new Prisma.Decimal('50.00'),
        deliveryFeeAmount: new Prisma.Decimal('0.00'),
        taxAmount: new Prisma.Decimal('0.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        totalPayable: new Prisma.Decimal('50.00'),
        currency: 'USD',
        shippingAddressSnapshot: { street: 'Jigjiga Yar', city: 'Hargeisa' },
      },
    });

    const btSubOrder = await prisma.subOrder.create({
      data: {
        subOrderNumber: `${btOrderNumber}-01`,
        parentOrderId: btOrder.id,
        sellerId: sellerProfileId,
        storeId,
        status: SubOrderStatus.PENDING_ACCEPTANCE,
        itemsSubtotal: new Prisma.Decimal('50.00'),
        deliveryFee: new Prisma.Decimal('0.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('50.00'),
        commissionRate: new Prisma.Decimal('0.0500'),
        commissionAmount: new Prisma.Decimal('2.50'),
        sellerPayableAmount: new Prisma.Decimal('47.50'),
      },
    });

    // 2. Customer initiates Bank Transfer payment
    const initResult = await paymentsService.createPayment(customerAUserId, {
      orderId: btOrder.id,
      paymentMethod: PaymentMethod.BANK_TRANSFER,
    });

    expect(initResult.payment.status).toBe(PaymentStatus.PENDING);
    expect(initResult.payment.paymentMethod).toBe(PaymentMethod.BANK_TRANSFER);
    expect(initResult.providerDetails).toBeDefined();

    // 3. Admin verifies Bank Transfer payment
    const confirmed = await paymentsService.confirmBankTransfer(
      adminUserId,
      initResult.payment.id,
      {
        bankReference: `DAHAB-TXN-${testSuffix}`,
        adminNotes: 'Verified on Premier Bank portal',
      },
    );

    expect(confirmed.status).toBe(PaymentStatus.CAPTURED);
    expect(confirmed.capturedAt).toBeDefined();

    const verifiedOrder = await prisma.order.findUnique({ where: { id: btOrder.id } });
    expect(verifiedOrder?.status).toBe(ParentOrderStatus.CONFIRMED);

    // Clean up BT order
    await prisma.paymentTransaction.deleteMany({ where: { paymentId: initResult.payment.id } });
    await prisma.payment.delete({ where: { id: initResult.payment.id } });
    await prisma.subOrder.delete({ where: { id: btSubOrder.id } });
    await prisma.order.delete({ where: { id: btOrder.id } });
  });

  it('11. should handle Cash on Delivery payment and collection confirmation workflow', async () => {
    // 1. Create Order for COD
    const codOrderNumber = `SQ-COD-${Date.now()}-${testSuffix}`;
    const codOrder = await prisma.order.create({
      data: {
        orderNumber: codOrderNumber,
        customerId: customerAProfileId,
        status: ParentOrderStatus.PENDING_PAYMENT,
        grossMerchandiseValue: new Prisma.Decimal('30.00'),
        subtotalAmount: new Prisma.Decimal('30.00'),
        deliveryFeeAmount: new Prisma.Decimal('0.00'),
        taxAmount: new Prisma.Decimal('0.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        totalPayable: new Prisma.Decimal('30.00'),
        currency: 'USD',
        shippingAddressSnapshot: { street: 'Main Rd', city: 'Hargeisa' },
      },
    });

    const codSubOrder = await prisma.subOrder.create({
      data: {
        subOrderNumber: `${codOrderNumber}-01`,
        parentOrderId: codOrder.id,
        sellerId: sellerProfileId,
        storeId,
        status: SubOrderStatus.PENDING_ACCEPTANCE,
        itemsSubtotal: new Prisma.Decimal('30.00'),
        deliveryFee: new Prisma.Decimal('0.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('30.00'),
        commissionRate: new Prisma.Decimal('0.0500'),
        commissionAmount: new Prisma.Decimal('1.50'),
        sellerPayableAmount: new Prisma.Decimal('28.50'),
      },
    });

    // 2. Customer initiates COD payment
    const initResult = await paymentsService.createPayment(customerAUserId, {
      orderId: codOrder.id,
      paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
    });

    expect(initResult.payment.status).toBe(PaymentStatus.PENDING);
    expect(initResult.payment.paymentMethod).toBe(PaymentMethod.CASH_ON_DELIVERY);

    // 3. Confirm COD collection upon delivery
    const confirmed = await paymentsService.confirmCodCollection(
      adminUserId,
      initResult.payment.id,
      {
        notes: 'Cash collected by delivery personnel at recipient door',
      },
    );

    expect(confirmed.status).toBe(PaymentStatus.CAPTURED);

    // Clean up COD order
    await prisma.paymentTransaction.deleteMany({ where: { paymentId: initResult.payment.id } });
    await prisma.payment.delete({ where: { id: initResult.payment.id } });
    await prisma.subOrder.delete({ where: { id: codSubOrder.id } });
    await prisma.order.delete({ where: { id: codOrder.id } });
  });
});
