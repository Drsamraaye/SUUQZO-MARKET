import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import {
  LedgerAccountType,
  LedgerEntryDirection,
  Prisma,
} from '@prisma/client';

export interface LedgerEntryInput {
  accountCode: string;
  direction: LedgerEntryDirection;
  amount: Prisma.Decimal;
  sellerId?: string;
}

export interface PostLedgerTransactionInput {
  referenceType: string;
  referenceId: string;
  description: string;
  entries: LedgerEntryInput[];
}

export const SYSTEM_ACCOUNTS = {
  CASH_CLEARING: '1010',
  BANK_TRANSFER: '1020',
  COD_RECEIVABLE: '1030',
  SELLER_PAYABLE_CONTROL: '2010',
  COMMISSION_REVENUE: '4010',
  REFUND_EXPENSE: '5010',
} as const;

@Injectable()
export class FinancialLedgerService {
  private readonly logger = new Logger(FinancialLedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Initializes or verifies presence of system standard chart of accounts.
   */
  async ensureSystemAccounts(tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;

    const defaultAccounts = [
      { code: SYSTEM_ACCOUNTS.CASH_CLEARING, name: 'Cash & Aggregator Clearing', type: LedgerAccountType.ASSET },
      { code: SYSTEM_ACCOUNTS.BANK_TRANSFER, name: 'Bank Transfer Settlement Account', type: LedgerAccountType.ASSET },
      { code: SYSTEM_ACCOUNTS.COD_RECEIVABLE, name: 'Cash on Delivery Receivable', type: LedgerAccountType.ASSET },
      { code: SYSTEM_ACCOUNTS.SELLER_PAYABLE_CONTROL, name: 'Seller Payable Control Account', type: LedgerAccountType.LIABILITY },
      { code: SYSTEM_ACCOUNTS.COMMISSION_REVENUE, name: 'Marketplace 5% Commission Revenue', type: LedgerAccountType.REVENUE },
      { code: SYSTEM_ACCOUNTS.REFUND_EXPENSE, name: 'Customer Refund Reversal Account', type: LedgerAccountType.EXPENSE },
    ];

    for (const acc of defaultAccounts) {
      await client.ledgerAccount.upsert({
        where: { accountCode: acc.code },
        update: {},
        create: {
          accountCode: acc.code,
          accountName: acc.name,
          accountType: acc.type,
          currency: 'USD',
          balance: new Prisma.Decimal(0),
        },
      });
    }
  }

  /**
   * Resolves or creates a dedicated liability sub-account for an individual seller.
   */
  async getOrCreateSellerAccount(sellerId: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    const accountCode = `2010-${sellerId}`;

    let account = await client.ledgerAccount.findUnique({
      where: { accountCode },
    });

    if (!account) {
      const seller = await client.sellerProfile.findUnique({ where: { id: sellerId } });
      const businessName = seller?.businessName || 'Seller';

      account = await client.ledgerAccount.create({
        data: {
          accountCode,
          accountName: `Seller Payable - ${businessName}`,
          accountType: LedgerAccountType.LIABILITY,
          currency: 'USD',
          balance: new Prisma.Decimal(0),
          sellerId,
        },
      });
    }

    return account;
  }

  /**
   * Posts an immutable, balanced double-entry financial transaction.
   * Total Debits MUST equal Total Credits.
   */
  async postTransaction(input: PostLedgerTransactionInput, externalTx?: Prisma.TransactionClient) {
    // 1. Double-Entry Balance Verification
    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);

    for (const entry of input.entries) {
      const entryAmount = new Prisma.Decimal(entry.amount);
      if (entryAmount.lessThanOrEqualTo(0)) {
        throw new BadRequestException(`Ledger entry amount must be positive. Received: ${entryAmount}`);
      }

      if (entry.direction === LedgerEntryDirection.DEBIT) {
        totalDebit = totalDebit.add(entryAmount);
      } else {
        totalCredit = totalCredit.add(entryAmount);
      }
    }

    // Exact cent balance check
    if (!totalDebit.equals(totalCredit)) {
      throw new BadRequestException(
        `Double-entry transaction unbalanced! Total Debits ($${totalDebit}) must equal Total Credits ($${totalCredit}). Difference: $${totalDebit.sub(totalCredit)}`,
      );
    }

    const runWithClient = async (tx: Prisma.TransactionClient) => {
      await this.ensureSystemAccounts(tx);

      const transactionNumber = `LTX-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

      const ledgerTx = await tx.ledgerTransaction.create({
        data: {
          transactionNumber,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          description: input.description,
        },
      });

      for (const entry of input.entries) {
        let account = await tx.ledgerAccount.findUnique({
          where: { accountCode: entry.accountCode },
        });

        if (!account && entry.sellerId) {
          account = await this.getOrCreateSellerAccount(entry.sellerId, tx);
        }

        if (!account) {
          throw new BadRequestException(`Ledger account "${entry.accountCode}" not found.`);
        }

        await tx.ledgerEntry.create({
          data: {
            transactionId: ledgerTx.id,
            accountId: account.id,
            direction: entry.direction,
            amount: entry.amount,
          },
        });

        // Update account balance based on account type and entry direction:
        // Asset/Expense: Debit increases (+), Credit decreases (-)
        // Liability/Equity/Revenue: Credit increases (+), Debit decreases (-)
        const isAssetOrExpense =
          account.accountType === LedgerAccountType.ASSET ||
          account.accountType === LedgerAccountType.EXPENSE;

        let balanceDelta: Prisma.Decimal;
        if (isAssetOrExpense) {
          balanceDelta = entry.direction === LedgerEntryDirection.DEBIT ? entry.amount : entry.amount.negated();
        } else {
          balanceDelta = entry.direction === LedgerEntryDirection.CREDIT ? entry.amount : entry.amount.negated();
        }

        await tx.ledgerAccount.update({
          where: { id: account.id },
          data: {
            balance: account.balance.add(balanceDelta),
          },
        });
      }

      this.logger.log(
        `Posted balanced double-entry transaction ${transactionNumber} (${input.description}) | Balance: $${totalDebit}`,
      );

      return ledgerTx;
    };

    if (externalTx) {
      return runWithClient(externalTx);
    }

    return this.prisma.$transaction((tx) => runWithClient(tx), {
      timeout: 30000,
      maxWait: 10000,
    });
  }

  /**
   * Retrieves live balance for an individual merchant seller.
   */
  async getSellerBalance(sellerId: string) {
    const accountCode = `2010-${sellerId}`;
    const account = await this.prisma.ledgerAccount.findUnique({
      where: { accountCode },
    });

    const currentBalance = account?.balance ? new Prisma.Decimal(account.balance) : new Prisma.Decimal(0);

    // Reserved payouts (status SCHEDULED or PROCESSING)
    const reservedPayouts = await this.prisma.sellerPayout.aggregate({
      where: {
        sellerId,
        status: { in: ['SCHEDULED', 'PROCESSING'] },
      },
      _sum: { amount: true },
    });
    const reservedAmount = reservedPayouts._sum.amount ? new Prisma.Decimal(reservedPayouts._sum.amount) : new Prisma.Decimal(0);

    const availableBalance = currentBalance.sub(reservedAmount);

    // Total historical payouts
    const totalPaid = await this.prisma.sellerPayout.aggregate({
      where: {
        sellerId,
        status: 'PAID',
      },
      _sum: { amount: true },
    });
    const paidOutAmount = totalPaid._sum.amount ? new Prisma.Decimal(totalPaid._sum.amount) : new Prisma.Decimal(0);

    return {
      sellerId,
      currentBalance,
      reservedAmount,
      availableBalance: availableBalance.lessThan(0) ? new Prisma.Decimal(0) : availableBalance,
      paidOutAmount,
      currency: 'USD',
    };
  }

  /**
   * Retrieves all ledger accounts with balances (Admin/Finance).
   */
  async getAllAccounts() {
    await this.ensureSystemAccounts();
    return this.prisma.ledgerAccount.findMany({
      orderBy: { accountCode: 'asc' },
    });
  }

  /**
   * Lists ledger transactions with pagination and entries.
   */
  async getTransactions(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [total, items] = await Promise.all([
      this.prisma.ledgerTransaction.count(),
      this.prisma.ledgerTransaction.findMany({
        skip,
        take: limit,
        orderBy: { postedAt: 'desc' },
        include: {
          entries: {
            include: {
              account: {
                select: { accountCode: true, accountName: true, accountType: true },
              },
            },
          },
        },
      }),
    ]);

    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
