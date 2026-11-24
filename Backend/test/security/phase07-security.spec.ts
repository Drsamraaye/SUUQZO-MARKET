import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../src/database/prisma.module.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { PaymentsModule } from '../../src/payments/payments.module.js';
import { PaymentsService } from '../../src/payments/payments.service.js';
import { RefundsService } from '../../src/payments/refunds.service.js';
import { FinancialLedgerService } from '../../src/payments/financial-ledger.service.js';
import { SellerPayoutsService } from '../../src/payments/seller-payouts.service.js';
import { AuditLogsModule } from '../../src/audit-logs/audit-logs.module.js';
import { NotificationsModule } from '../../src/notifications/notifications.module.js';
import {
  PaymentMethod,
  PaymentStatus,
  ParentOrderStatus,
  SubOrderStatus,
  RefundReason,
  UserRole,
  Prisma,
} from '@prisma/client';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('Phase 07: Security, IDOR & Webhook Forgery Prevention Tests', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let paymentsService: PaymentsService;
  let refundsService: RefundsService;
  let ledgerService: FinancialLedgerService;
  let payoutsService: SellerPayoutsService;

  const testSuffix = Date.now().toString().slice(-6);
  let customerAUserId: string;
  let customerAProfileId: string;
  let customerBUserId: string;
  let customerBProfileId: string;

  let sellerAUserId: string;
  let sellerAProfileId: string;
  let sellerBUserId: string;
  let sellerBProfileId: string;

  let storeAId: string;
  let orderAId: string;
  let paymentAId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuditLogsModule, NotificationsModule, PaymentsModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    paymentsService = moduleRef.get<PaymentsService>(PaymentsService);
    refundsService = moduleRef.get<RefundsService>(RefundsService);
    ledgerService = moduleRef.get<FinancialLedgerService>(FinancialLedgerService);
    payoutsService = moduleRef.get<SellerPayoutsService>(SellerPayoutsService);
    await moduleRef.init();

    // 1. Customer A
    const custA = await prisma.user.create({
      data: {
        email: `sec_custA_${testSuffix}@suuqzo.test`,
        phone: `+25261${testSuffix}51`,
        passwordHash: 'dummy_hash',
        role: 'CUSTOMER',
        status: 'ACTIVE',
      },
    });
    customerAUserId = custA.id;
    const profA = await prisma.customerProfile.create({
      data: { userId: custA.id, firstName: 'Asha', lastName: 'Ali' },
    });
    customerAProfileId = profA.id;

    // 2. Customer B
    const custB = await prisma.user.create({
      data: {
        email: `sec_custB_${testSuffix}@suuqzo.test`,
        phone: `+25261${testSuffix}52`,
        passwordHash: 'dummy_hash',
        role: 'CUSTOMER',
        status: 'ACTIVE',
      },
    });
    customerBUserId = custB.id;
    const profB = await prisma.customerProfile.create({
      data: { userId: custB.id, firstName: 'Hassan', lastName: 'Osman' },
    });
    customerBProfileId = profB.id;

    // 3. Seller A
    const sUserA = await prisma.user.create({
      data: {
        email: `sec_sellerA_${testSuffix}@suuqzo.test`,
        phone: `+25261${testSuffix}53`,
        passwordHash: 'dummy_hash',
        role: 'SELLER',
        status: 'ACTIVE',
      },
    });
    sellerAUserId = sUserA.id;
    const sProfA = await prisma.sellerProfile.create({
      data: {
        userId: sUserA.id,
        businessName: `Store Alpha ${testSuffix}`,
        verificationStatus: 'VERIFIED',
        payoutAccountIdentifier: `25261${testSuffix}53`,
        defaultPayoutMethod: 'ZAAD',
        isDailyPayoutEligible: true,
      },
    });
    sellerAProfileId = sProfA.id;

    // 4. Seller B
    const sUserB = await prisma.user.create({
      data: {
        email: `sec_sellerB_${testSuffix}@suuqzo.test`,
        phone: `+25261${testSuffix}54`,
        passwordHash: 'dummy_hash',
        role: 'SELLER',
        status: 'ACTIVE',
      },
    });
    sellerBUserId = sUserB.id;
    const sProfB = await prisma.sellerProfile.create({
      data: {
        userId: sUserB.id,
        businessName: `Store Beta ${testSuffix}`,
        verificationStatus: 'VERIFIED',
        payoutAccountIdentifier: `25261${testSuffix}54`,
        defaultPayoutMethod: 'EVC_PLUS',
        isDailyPayoutEligible: true,
      },
    });
    sellerBProfileId = sProfB.id;

    const storeA = await prisma.store.create({
      data: {
        sellerId: sProfA.id,
        name: `Sec Alpha Store ${testSuffix}`,
        slug: `sec-alpha-${testSuffix}`,
        status: 'ACTIVE',
        city: 'Hargeisa',
        address: 'BadaCas',
      },
    });
    storeAId = storeA.id;

    // 5. Order for Customer A with Seller A
    const orderNumber = `SQ-SEC-${Date.now()}-${testSuffix}`;
    const order = await prisma.order.create({
      data: {
        orderNumber,
        customerId: customerAProfileId,
        status: ParentOrderStatus.PENDING_PAYMENT,
        grossMerchandiseValue: new Prisma.Decimal('75.00'),
        subtotalAmount: new Prisma.Decimal('75.00'),
        deliveryFeeAmount: new Prisma.Decimal('0.00'),
        taxAmount: new Prisma.Decimal('0.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        totalPayable: new Prisma.Decimal('75.00'),
        currency: 'USD',
        shippingAddressSnapshot: { street: 'BadaCas', city: 'Hargeisa' },
      },
    });
    orderAId = order.id;

    await prisma.subOrder.create({
      data: {
        subOrderNumber: `${orderNumber}-01`,
        parentOrderId: order.id,
        sellerId: sProfA.id,
        storeId: storeA.id,
        status: SubOrderStatus.PENDING_ACCEPTANCE,
        itemsSubtotal: new Prisma.Decimal('75.00'),
        deliveryFee: new Prisma.Decimal('0.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('75.00'),
        commissionRate: new Prisma.Decimal('0.0500'),
        commissionAmount: new Prisma.Decimal('3.75'),
        sellerPayableAmount: new Prisma.Decimal('71.25'),
      },
    });

    const init = await paymentsService.createPayment(customerAUserId, {
      orderId: order.id,
      paymentMethod: PaymentMethod.ZAAD,
      payerPhone: '+252634444444',
    });
    paymentAId = init.payment.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.paymentTransaction.deleteMany({
        where: { paymentId: paymentAId },
      });
      await prisma.payment.deleteMany({ where: { orderId: orderAId } });
      await prisma.subOrder.deleteMany({ where: { parentOrderId: orderAId } });
      await prisma.order.deleteMany({ where: { id: orderAId } });
      await prisma.store.deleteMany({ where: { id: storeAId } });

      await prisma.sellerProfile.deleteMany({
        where: { id: { in: [sellerAProfileId, sellerBProfileId] } },
      });
      await prisma.customerProfile.deleteMany({
        where: { id: { in: [customerAProfileId, customerBProfileId] } },
      });
      await prisma.user.deleteMany({
        where: { email: { contains: testSuffix } },
      });
    } catch (e) {
      console.warn('Error in security test cleanup:', e);
    }
    await moduleRef.close();
  });

  it('1. IDOR: Customer B cannot view Customer A payment record', async () => {
    await expect(
      paymentsService.getPaymentById(paymentAId, {
        id: customerBUserId,
        role: UserRole.CUSTOMER,
        permissions: [],
      } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('2. IDOR: Seller B cannot view Customer A payment having only Seller A suborders', async () => {
    await expect(
      paymentsService.getPaymentById(paymentAId, {
        id: sellerBUserId,
        role: UserRole.SELLER,
        permissions: [],
      } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('3. IDOR: Seller A cannot view Seller B payout history', async () => {
    // Seller A requesting payouts with Seller A userId returns only Seller A items
    const sellerAPayouts = await payoutsService.getSellerPayouts(sellerAUserId);
    for (const p of sellerAPayouts.items) {
      expect(p.sellerId).toBe(sellerAProfileId);
      expect(p.sellerId).not.toBe(sellerBProfileId);
    }
  });

  it('4. Webhook Forgery: Webhook without signature header is rejected', async () => {
    await expect(
      paymentsService.processWebhookEvent(
        'CENTRALIZED_AGGREGATOR',
        { eventId: 'evt-unsigned', status: 'CAPTURED' },
        {},
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('5. Webhook Forgery: Webhook with altered payload signature is rejected', async () => {
    const tamperedPayload = {
      eventId: 'evt-tampered',
      amount: '500.00', // Attacker altered amount
      status: 'CAPTURED',
    };

    await expect(
      paymentsService.processWebhookEvent(
        'CENTRALIZED_AGGREGATOR',
        tamperedPayload,
        { 'x-aggregator-signature': '0000000000000000000000000000000000000000000000000000000000000000' },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('6. Business Integrity: Cannot refund an un-captured (PENDING) payment', async () => {
    await expect(
      refundsService.createRefund('admin_id', {
        paymentId: paymentAId,
        amount: 25.0,
        reason: RefundReason.CUSTOMER_CANCELLED,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('7. Workflow Integrity: Cannot verify Bank Transfer on a ZAAD payment', async () => {
    await expect(
      paymentsService.confirmBankTransfer('admin_id', paymentAId, {
        bankReference: 'INVALID-BT',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('8. Workflow Integrity: Cannot confirm COD collection on a ZAAD payment', async () => {
    await expect(
      paymentsService.confirmCodCollection('admin_id', paymentAId, {
        notes: 'Invalid COD collection attempt',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
