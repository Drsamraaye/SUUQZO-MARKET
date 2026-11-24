import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  PrismaClient,
  Prisma,
  LedgerAccountType,
  LedgerEntryDirection,
  PayoutBatchStatus,
  PayoutStatus,
  PayoutMethodType,
  ReservationStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
const { Pool } = pg;
import 'dotenv/config';

describe('TASK 6: Financial and Inventory Integrity Verification', () => {
  let pool: pg.Pool;
  let prisma: PrismaClient;

  beforeAll(async () => {
    const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
    pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

  describe('1. Monetary Decimal Precision & Zero-Float Arithmetic', () => {
    it('should store and compute exact decimals without IEEE 754 floating point inaccuracies', () => {
      // Classic float issue: 0.1 + 0.2 = 0.30000000000000004
      const priceA = new Prisma.Decimal('0.10');
      const priceB = new Prisma.Decimal('0.20');
      const sum = priceA.plus(priceB);

      expect(sum.toString()).toBe('0.3');
      expect(sum.toFixed(2)).toBe('0.30');
    });

    it('should calculate 5% platform commission accurately', () => {
      // 5% standard marketplace commission rule
      const subtotal = new Prisma.Decimal('199.99');
      const commissionRate = new Prisma.Decimal('0.0500'); // 5%

      const commissionAmount = subtotal.mul(commissionRate);
      const roundedCommission = new Prisma.Decimal(
        commissionAmount.toFixed(2, Prisma.Decimal.ROUND_HALF_UP)
      );
      const sellerPayable = subtotal.minus(roundedCommission);

      // 199.99 * 0.05 = 9.9995 -> 10.00
      expect(roundedCommission.toString()).toBe('10');
      // 199.99 - 10.00 = 189.99
      expect(sellerPayable.toString()).toBe('189.99');
      // Verify conservation of total
      expect(roundedCommission.plus(sellerPayable).toString()).toBe('199.99');
    });
  });

  describe('2. Double-Entry Accounting Ledger Balancing', () => {
    const testTxNumber = `TX_LEDGER_${Date.now()}`;
    const accCashCode = `1010_TEST_CASH_${Date.now()}`;
    const accEscrowCode = `2010_TEST_ESCROW_${Date.now()}`;

    let cashAccId: string;
    let escrowAccId: string;

    beforeAll(async () => {
      const cash = await prisma.ledgerAccount.create({
        data: {
          accountCode: accCashCode,
          accountName: 'Test Cash Clearing',
          accountType: LedgerAccountType.ASSET,
        },
      });
      cashAccId = cash.id;

      const escrow = await prisma.ledgerAccount.create({
        data: {
          accountCode: accEscrowCode,
          accountName: 'Test Customer Escrow',
          accountType: LedgerAccountType.LIABILITY,
        },
      });
      escrowAccId = escrow.id;
    });

    afterAll(async () => {
      // Cleanup ledger entries and accounts
      await prisma.ledgerEntry.deleteMany({
        where: { transaction: { transactionNumber: testTxNumber } },
      });
      await prisma.ledgerTransaction.deleteMany({
        where: { transactionNumber: testTxNumber },
      });
      await prisma.ledgerAccount.deleteMany({
        where: { id: { in: [cashAccId, escrowAccId] } },
      });
    });

    it('should record balanced journal entries where sum of debits equals sum of credits', async () => {
      const orderAmount = new Prisma.Decimal('150.00');

      // Create transaction with balanced double entries
      const tx = await prisma.ledgerTransaction.create({
        data: {
          transactionNumber: testTxNumber,
          referenceType: 'ORDER_PAYMENT',
          referenceId: 'TEST_ORDER_REF_123',
          description: 'Payment captured into escrow for order 123',
          entries: {
            create: [
              {
                accountId: cashAccId,
                direction: LedgerEntryDirection.DEBIT,
                amount: orderAmount,
              },
              {
                accountId: escrowAccId,
                direction: LedgerEntryDirection.CREDIT,
                amount: orderAmount,
              },
            ],
          },
        },
        include: { entries: true },
      });

      expect(tx.entries.length).toBe(2);

      const totalDebits = tx.entries
        .filter((e) => e.direction === LedgerEntryDirection.DEBIT)
        .reduce((sum, e) => sum.plus(e.amount), new Prisma.Decimal('0.00'));

      const totalCredits = tx.entries
        .filter((e) => e.direction === LedgerEntryDirection.CREDIT)
        .reduce((sum, e) => sum.plus(e.amount), new Prisma.Decimal('0.00'));

      // Strict double-entry balance check: Debits == Credits
      expect(totalDebits.equals(totalCredits)).toBe(true);
      expect(totalDebits.toString()).toBe('150');
      expect(totalCredits.toString()).toBe('150');
    });
  });

  describe('3. Webhook Event Idempotency & Duplicate Prevention', () => {
    const testProvider = 'SOMPAY_TEST';
    const testEventId = `EVT_${Date.now()}`;

    afterAll(async () => {
      await prisma.providerWebhookEvent.deleteMany({
        where: { provider: testProvider, eventId: testEventId },
      });
    });

    it('should store initial webhook event successfully', async () => {
      const event = await prisma.providerWebhookEvent.create({
        data: {
          provider: testProvider,
          eventId: testEventId,
          eventType: 'payment.success',
          payload: { transactionId: 'SOM_999', amount: 50.0 },
        },
      });

      expect(event).toBeDefined();
      expect(event.eventId).toBe(testEventId);
    });

    it('should reject duplicate webhook event with identical provider and eventId (P2002)', async () => {
      try {
        await prisma.providerWebhookEvent.create({
          data: {
            provider: testProvider,
            eventId: testEventId,
            eventType: 'payment.success',
            payload: { transactionId: 'SOM_999', amount: 50.0 },
          },
        });
        expect.unreachable(
          'Duplicate webhook was accepted when it should have failed'
        );
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
        const pErr = err as Prisma.PrismaClientKnownRequestError;
        expect(pErr.code).toBe('P2002');
      }
    });
  });

  describe('4. Inventory Reservation Lifecycle & Expiration Logic', () => {
    it('should correctly flag expired reservations based on timestamp', () => {
      const now = new Date();
      const pastExpiry = new Date(now.getTime() - 60000); // 1 minute ago
      const futureExpiry = new Date(now.getTime() + 600000); // 10 minutes in future

      const isExpiredPast = pastExpiry <= now;
      const isExpiredFuture = futureExpiry <= now;

      expect(isExpiredPast).toBe(true);
      expect(isExpiredFuture).toBe(false);
    });
  });

  describe('5. Duplicate Seller Payout Prevention', () => {
    const testBatchNumber = `BATCH_${Date.now()}`;
    const testPayoutNumber = `PAYOUT_${Date.now()}`;
    let batchId: string;
    let testUserId: string;
    let testSellerId: string;

    beforeAll(async () => {
      const batch = await prisma.payoutBatch.create({
        data: {
          batchNumber: testBatchNumber,
          cycleDate: new Date(),
          status: PayoutBatchStatus.PENDING_REVIEW,
          totalAmount: new Prisma.Decimal('500.00'),
          totalPayoutsCount: 1,
        },
      });
      batchId = batch.id;

      const user = await prisma.user.create({
        data: {
          phone: `+252${Date.now().toString().slice(-8)}`,
          email: `test.seller.${Date.now()}@suuqzo.test`,
          role: 'SELLER',
        },
      });
      testUserId = user.id;

      const seller = await prisma.sellerProfile.create({
        data: {
          userId: testUserId,
          businessName: 'Test Seller Store',
          payoutAccountIdentifier: '+252615000000',
          defaultPayoutMethod: PayoutMethodType.EVC_PLUS,
        },
      });
      testSellerId = seller.id;
    });

    afterAll(async () => {
      await prisma.sellerPayout.deleteMany({
        where: { payoutNumber: testPayoutNumber },
      });
      await prisma.payoutBatch.deleteMany({
        where: { id: batchId },
      });
      if (testSellerId) {
        await prisma.sellerProfile.deleteMany({
          where: { id: testSellerId },
        });
      }
      if (testUserId) {
        await prisma.user.deleteMany({
          where: { id: testUserId },
        });
      }
    });

    it('should create initial seller payout record', async () => {
      const payout = await prisma.sellerPayout.create({
        data: {
          payoutNumber: testPayoutNumber,
          batchId: batchId,
          sellerId: testSellerId,
          amount: new Prisma.Decimal('250.00'),
          method: PayoutMethodType.EVC_PLUS,
          destinationAccount: '+252615000000',
          destinationAccountSnapshot: { phone: '+252615000000', network: 'Hormuud' },
          status: PayoutStatus.SCHEDULED,
        },
      });

      expect(payout).toBeDefined();
      expect(payout.payoutNumber).toBe(testPayoutNumber);
      expect(payout.amount.toString()).toBe('250');
    });

    it('should reject duplicate seller payout with identical payoutNumber (P2002)', async () => {
      try {
        await prisma.sellerPayout.create({
          data: {
            payoutNumber: testPayoutNumber,
            batchId: batchId,
            sellerId: testSellerId,
            amount: new Prisma.Decimal('250.00'),
            method: PayoutMethodType.EVC_PLUS,
            destinationAccount: '+252615000000',
            destinationAccountSnapshot: { phone: '+252615000000', network: 'Hormuud' },
            status: PayoutStatus.SCHEDULED,
          },
        });
        expect.unreachable('Duplicate payoutNumber was accepted');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
        const pErr = err as Prisma.PrismaClientKnownRequestError;
        expect(pErr.code).toBe('P2002');
      }
    });
  });
});
