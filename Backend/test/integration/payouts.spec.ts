import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../src/database/prisma.module.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { FinancialLedgerService, SYSTEM_ACCOUNTS } from '../../src/payments/financial-ledger.service.js';
import { SellerPayoutsService } from '../../src/payments/seller-payouts.service.js';
import { AuditLogsModule } from '../../src/audit-logs/audit-logs.module.js';
import { NotificationsModule } from '../../src/notifications/notifications.module.js';
import {
  PayoutBatchStatus,
  PayoutStatus,
  LedgerEntryDirection,
  Prisma,
} from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('Phase 07: Seller Payouts & Batch Execution Integration Tests', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let ledgerService: FinancialLedgerService;
  let payoutsService: SellerPayoutsService;

  const testSuffix = Date.now().toString().slice(-6);
  let adminUserId: string;
  let sellerUserId: string;
  let sellerProfileId: string;
  let createdBatchId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuditLogsModule, NotificationsModule],
      providers: [FinancialLedgerService, SellerPayoutsService],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    ledgerService = moduleRef.get<FinancialLedgerService>(FinancialLedgerService);
    payoutsService = moduleRef.get<SellerPayoutsService>(SellerPayoutsService);
    await moduleRef.init();

    // 1. Create Admin user
    const admin = await prisma.user.create({
      data: {
        email: `payout_admin_${testSuffix}@suuqzo.test`,
        phone: `+25261${testSuffix}01`,
        passwordHash: 'dummy_hash',
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
    adminUserId = admin.id;

    // 2. Create Seller user & verified profile
    const sellerUser = await prisma.user.create({
      data: {
        email: `payout_seller_${testSuffix}@suuqzo.test`,
        phone: `+25261${testSuffix}02`,
        passwordHash: 'dummy_hash',
        role: 'SELLER',
        status: 'ACTIVE',
      },
    });
    sellerUserId = sellerUser.id;

    const seller = await prisma.sellerProfile.create({
      data: {
        userId: sellerUser.id,
        businessName: `Payout Merchant ${testSuffix}`,
        verificationStatus: 'VERIFIED',
        payoutAccountIdentifier: `25261${testSuffix}02`,
        defaultPayoutMethod: 'EVC_PLUS',
        isDailyPayoutEligible: true,
      },
    });
    sellerProfileId = seller.id;

    // 3. Credit seller payable account in the ledger ($250.00 available balance)
    await ledgerService.ensureSystemAccounts();
    await ledgerService.postTransaction({
      referenceType: 'TEST_SEED_ORDER',
      referenceId: `SEED-${testSuffix}`,
      description: 'Initial seed earnings for payout testing',
      entries: [
        {
          accountCode: SYSTEM_ACCOUNTS.CASH_CLEARING,
          direction: LedgerEntryDirection.DEBIT,
          amount: new Prisma.Decimal('250.00'),
        },
        {
          accountCode: `2010-${sellerProfileId}`,
          sellerId: sellerProfileId,
          direction: LedgerEntryDirection.CREDIT,
          amount: new Prisma.Decimal('250.00'),
        },
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      if (createdBatchId) {
        await prisma.sellerPayout.deleteMany({ where: { batchId: createdBatchId } });
        await prisma.payoutBatch.delete({ where: { id: createdBatchId } });
      }

      // Cleanup ledger entries for this seller
      const testTxs = await prisma.ledgerTransaction.findMany({
        where: {
          OR: [
            { referenceId: `SEED-${testSuffix}` },
            { description: { contains: testSuffix } },
          ],
        },
      });
      for (const tx of testTxs) {
        await prisma.ledgerEntry.deleteMany({ where: { transactionId: tx.id } });
        await prisma.ledgerTransaction.delete({ where: { id: tx.id } });
      }

      await prisma.ledgerAccount.deleteMany({
        where: { accountCode: `2010-${sellerProfileId}` },
      });

      if (sellerProfileId) {
        await prisma.sellerProfile.delete({ where: { id: sellerProfileId } });
      }
      if (sellerUserId) {
        await prisma.user.delete({ where: { id: sellerUserId } });
      }
      if (adminUserId) {
        await prisma.user.delete({ where: { id: adminUserId } });
      }
    } catch (e) {
      console.warn('Error in payout test cleanup:', e);
    }
    await moduleRef.close();
  });

  it('1. should verify seller has available balance of $250.00 before payout', async () => {
    const balance = await ledgerService.getSellerBalance(sellerProfileId);
    expect(new Prisma.Decimal(balance.availableBalance).equals('250.00')).toBe(true);
  });

  it('2. should generate a daily payout batch containing the eligible seller', async () => {
    const result: any = await payoutsService.generateDailyPayoutBatch(
      adminUserId,
      sellerProfileId,
    );

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.batchNumber).toMatch(/^BATCH-/);
    expect(result.status).toBe(PayoutBatchStatus.PENDING_REVIEW);
    expect(new Prisma.Decimal(result.totalAmount).equals('250.00')).toBe(true);
    expect(result.payouts).toBeDefined();
    expect(result.payouts.length).toBe(1);
    expect(result.payouts[0].status).toBe(PayoutStatus.SCHEDULED);

    createdBatchId = result.id;
  });

  it('3. should approve and execute payout batch with atomic ledger posting', async () => {
    const executed = await payoutsService.approveAndExecuteBatch(
      createdBatchId,
      adminUserId,
    );

    expect(executed).toBeDefined();
    expect(executed?.status).toBe(PayoutBatchStatus.COMPLETED);
    expect(executed?.approvedByAdminId).toBe(adminUserId);

    // Verify individual payout updated to PAID
    const payout = await prisma.sellerPayout.findFirst({
      where: { batchId: createdBatchId },
    });
    expect(payout?.status).toBe(PayoutStatus.PAID);
    expect(payout?.paidAt).toBeDefined();

    // Verify seller available balance is now $0.00 (and paidOutAmount is $250.00)
    const newBalance = await ledgerService.getSellerBalance(sellerProfileId);
    expect(new Prisma.Decimal(newBalance.availableBalance).equals('0.00')).toBe(true);
    expect(new Prisma.Decimal(newBalance.paidOutAmount).equals('250.00')).toBe(true);
  });

  it('4. should reject re-approving an already completed payout batch', async () => {
    await expect(
      payoutsService.approveAndExecuteBatch(createdBatchId, adminUserId),
    ).rejects.toThrow(BadRequestException);
  });

  it('5. should allow authenticated seller to view own payout history', async () => {
    const history = await payoutsService.getSellerPayouts(sellerUserId, 1, 10);

    expect(history.items).toBeDefined();
    expect(history.items.length).toBeGreaterThanOrEqual(1);
    expect(history.items[0].sellerId).toBe(sellerProfileId);
    expect(history.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('6. should list all payout batches for admin review', async () => {
    const batches = await payoutsService.listPayoutBatches(1, 10);

    expect(batches.items).toBeDefined();
    expect(batches.items.length).toBeGreaterThanOrEqual(1);
    const found = batches.items.some((b) => b.id === createdBatchId);
    expect(found).toBe(true);
  });
});
