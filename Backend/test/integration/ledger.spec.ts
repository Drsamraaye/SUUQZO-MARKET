import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../src/database/prisma.module.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import {
  FinancialLedgerService,
  SYSTEM_ACCOUNTS,
} from '../../src/payments/financial-ledger.service.js';
import {
  LedgerAccountType,
  LedgerEntryDirection,
  Prisma,
} from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('Phase 07: Financial Ledger & Double-Entry Accounting Tests', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let ledgerService: FinancialLedgerService;

  const testSuffix = Date.now().toString().slice(-6);
  let testSellerId: string;
  let testUserId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [FinancialLedgerService],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    ledgerService = moduleRef.get<FinancialLedgerService>(FinancialLedgerService);
    await moduleRef.init();

    // Create a mock seller profile for testing seller-specific ledger accounts
    const user = await prisma.user.create({
      data: {
        email: `ledger_seller_${testSuffix}@suuqzo.test`,
        phone: `+25261${testSuffix}99`,
        passwordHash: 'dummy_hash',
        role: 'SELLER',
        status: 'ACTIVE',
      },
    });
    testUserId = user.id;

    const seller = await prisma.sellerProfile.create({
      data: {
        userId: user.id,
        businessName: `Ledger Store ${testSuffix}`,
        verificationStatus: 'VERIFIED',
        payoutAccountIdentifier: `ACC-${testSuffix}`,
        defaultPayoutMethod: 'ZAAD',
        isDailyPayoutEligible: true,
      },
    });
    testSellerId = seller.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      // Clean up test transactions and entries
      const testTxs = await prisma.ledgerTransaction.findMany({
        where: { referenceId: { contains: testSuffix } },
      });
      for (const tx of testTxs) {
        await prisma.ledgerEntry.deleteMany({ where: { transactionId: tx.id } });
        await prisma.ledgerTransaction.delete({ where: { id: tx.id } });
      }

      await prisma.ledgerAccount.deleteMany({
        where: { accountCode: `2010-${testSellerId}` },
      });

      if (testSellerId) {
        await prisma.sellerProfile.delete({ where: { id: testSellerId } });
      }
      if (testUserId) {
        await prisma.user.delete({ where: { id: testUserId } });
      }
    } catch (e) {
      console.warn('Error in ledger test cleanup:', e);
    }
    await moduleRef.close();
  });

  it('1. should verify system chart of accounts are initialized', async () => {
    await ledgerService.ensureSystemAccounts();

    const accounts = await ledgerService.getAllAccounts();
    const codes = accounts.map((a) => a.accountCode);

    expect(codes).toContain(SYSTEM_ACCOUNTS.CASH_CLEARING);
    expect(codes).toContain(SYSTEM_ACCOUNTS.BANK_TRANSFER);
    expect(codes).toContain(SYSTEM_ACCOUNTS.COD_RECEIVABLE);
    expect(codes).toContain(SYSTEM_ACCOUNTS.SELLER_PAYABLE_CONTROL);
    expect(codes).toContain(SYSTEM_ACCOUNTS.COMMISSION_REVENUE);
    expect(codes).toContain(SYSTEM_ACCOUNTS.REFUND_EXPENSE);
  });

  it('2. should dynamically create seller liability sub-account (2010-{sellerId})', async () => {
    const account = await ledgerService.getOrCreateSellerAccount(testSellerId);

    expect(account).toBeDefined();
    expect(account.accountCode).toBe(`2010-${testSellerId}`);
    expect(account.accountType).toBe(LedgerAccountType.LIABILITY);
    expect(account.sellerId).toBe(testSellerId);
  });

  it('3. should post a balanced double-entry transaction (Debits === Credits)', async () => {
    const amount = new Prisma.Decimal('100.00');
    const sellerPayable = new Prisma.Decimal('95.00');
    const commission = new Prisma.Decimal('5.00');

    // Debit: Cash Clearing 1010 ($100.00)
    // Credit: Seller Payable 2010-{sellerId} ($95.00)
    // Credit: Commission Revenue 4010 ($5.00)
    const result = await ledgerService.postTransaction({
      referenceType: 'TEST_PAYMENT',
      referenceId: `REF-${testSuffix}-01`,
      description: `Test payment posting ${testSuffix}`,
      entries: [
        {
          accountCode: SYSTEM_ACCOUNTS.CASH_CLEARING,
          direction: LedgerEntryDirection.DEBIT,
          amount,
        },
        {
          accountCode: `2010-${testSellerId}`,
          sellerId: testSellerId,
          direction: LedgerEntryDirection.CREDIT,
          amount: sellerPayable,
        },
        {
          accountCode: SYSTEM_ACCOUNTS.COMMISSION_REVENUE,
          direction: LedgerEntryDirection.CREDIT,
          amount: commission,
        },
      ],
    });

    expect(result).toBeDefined();
    expect(result.transactionNumber).toMatch(/^LTX-/);

    // Verify seller balance updated
    const balance = await ledgerService.getSellerBalance(testSellerId);
    expect(new Prisma.Decimal(balance.currentBalance).equals(sellerPayable)).toBe(true);
    expect(new Prisma.Decimal(balance.availableBalance).equals(sellerPayable)).toBe(true);
  });

  it('4. should reject unbalanced double-entry transaction with BadRequestException', async () => {
    await expect(
      ledgerService.postTransaction({
        referenceType: 'TEST_UNBALANCED',
        referenceId: `REF-${testSuffix}-02`,
        description: 'Deliberately unbalanced transaction',
        entries: [
          {
            accountCode: SYSTEM_ACCOUNTS.CASH_CLEARING,
            direction: LedgerEntryDirection.DEBIT,
            amount: new Prisma.Decimal('100.00'),
          },
          {
            accountCode: SYSTEM_ACCOUNTS.COMMISSION_REVENUE,
            direction: LedgerEntryDirection.CREDIT,
            amount: new Prisma.Decimal('90.00'), // Missing $10!
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('5. should reject zero or negative ledger entry amount', async () => {
    await expect(
      ledgerService.postTransaction({
        referenceType: 'TEST_INVALID_AMOUNT',
        referenceId: `REF-${testSuffix}-03`,
        description: 'Negative entry amount',
        entries: [
          {
            accountCode: SYSTEM_ACCOUNTS.CASH_CLEARING,
            direction: LedgerEntryDirection.DEBIT,
            amount: new Prisma.Decimal('-50.00'),
          },
          {
            accountCode: SYSTEM_ACCOUNTS.COMMISSION_REVENUE,
            direction: LedgerEntryDirection.CREDIT,
            amount: new Prisma.Decimal('-50.00'),
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('6. should retrieve paginated ledger transactions with their entries', async () => {
    const history = await ledgerService.getTransactions(1, 10);

    expect(history.items).toBeDefined();
    expect(history.items.length).toBeGreaterThan(0);
    expect(history.meta.total).toBeGreaterThan(0);

    const firstTx = history.items[0];
    expect(firstTx.entries).toBeDefined();
    expect(firstTx.entries.length).toBeGreaterThan(0);
    expect(firstTx.entries[0].account).toBeDefined();
  });
});
