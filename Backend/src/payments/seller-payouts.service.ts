import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { FinancialLedgerService, SYSTEM_ACCOUNTS } from './financial-ledger.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  PayoutBatchStatus,
  PayoutStatus,
  PayoutMethodType,
  LedgerEntryDirection,
  Prisma,
} from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class SellerPayoutsService {
  private readonly logger = new Logger(SellerPayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: FinancialLedgerService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Generates a daily payout batch for all sellers with available balances.
   */
  async generateDailyPayoutBatch(adminId: string, specificSellerId?: string) {
    const cycleDate = new Date();
    const batchNumber = `BATCH-${cycleDate.toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    // Find sellers with verified profiles
    const sellerQuery: any = {
      isDailyPayoutEligible: true,
    };
    if (specificSellerId) {
      sellerQuery.id = specificSellerId;
    }

    const sellers = await this.prisma.sellerProfile.findMany({
      where: sellerQuery,
      include: { user: true },
    });

    const eligiblePayouts: Array<{
      seller: typeof sellers[0];
      amount: Prisma.Decimal;
    }> = [];

    let totalBatchAmount = new Prisma.Decimal(0);

    for (const seller of sellers) {
      const balance = await this.ledgerService.getSellerBalance(seller.id);
      if (balance.availableBalance.greaterThan(0)) {
        eligiblePayouts.push({ seller, amount: balance.availableBalance });
        totalBatchAmount = totalBatchAmount.add(balance.availableBalance);
      }
    }

    if (eligiblePayouts.length === 0) {
      return {
        message: 'No eligible seller balances found for daily payout.',
        batchNumber: null,
        payoutsCount: 0,
        totalAmount: '0.00',
      };
    }

    // Create PayoutBatch and SellerPayout records atomically
    const batch = await this.prisma.$transaction(
      async (tx) => {
        const createdBatch = await tx.payoutBatch.create({
          data: {
            batchNumber,
            cycleDate,
            status: PayoutBatchStatus.PENDING_REVIEW,
            totalAmount: totalBatchAmount,
            totalPayoutsCount: eligiblePayouts.length,
          },
        });

        for (const item of eligiblePayouts) {
          const payoutNumber = `PAYOUT-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
          await tx.sellerPayout.create({
            data: {
              payoutNumber,
              batchId: createdBatch.id,
              sellerId: item.seller.id,
              amount: item.amount,
              currency: 'USD',
              method: item.seller.defaultPayoutMethod,
              destinationAccount: item.seller.payoutAccountIdentifier,
              destinationAccountSnapshot: {
                businessName: item.seller.businessName,
                identifier: item.seller.payoutAccountIdentifier,
                method: item.seller.defaultPayoutMethod,
              },
              status: PayoutStatus.SCHEDULED,
            },
          });
        }

        return createdBatch;
      },
      { timeout: 30000, maxWait: 10000 },
    );

    await this.auditLogsService.log({
      userId: adminId,
      action: 'DAILY_PAYOUT_BATCH_GENERATED',
      entityName: 'PayoutBatch',
      entityId: batch.id,
      newValues: {
        batchNumber: batch.batchNumber,
        totalAmount: totalBatchAmount.toString(),
        payoutsCount: eligiblePayouts.length,
      },
    });

    this.logger.log(`Created Daily Payout Batch ${batch.batchNumber} with ${eligiblePayouts.length} payouts totaling $${totalBatchAmount}`);

    return this.prisma.payoutBatch.findUnique({
      where: { id: batch.id },
      include: {
        payouts: {
          include: {
            seller: { select: { id: true, businessName: true, defaultPayoutMethod: true } },
          },
        },
      },
    });
  }

  /**
   * Approves and executes a payout batch, posting double-entry ledger entries.
   */
  async approveAndExecuteBatch(batchId: string, adminId: string) {
    const batch = await this.prisma.payoutBatch.findUnique({
      where: { id: batchId },
      include: {
        payouts: {
          include: { seller: { include: { user: true } } },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException(`Payout batch with ID "${batchId}" not found.`);
    }

    if (batch.status === PayoutBatchStatus.COMPLETED) {
      throw new BadRequestException('Payout batch has already been completed.');
    }

    const executedBatch = await this.prisma.$transaction(
      async (tx) => {
        // 1. Advance batch status
        await tx.payoutBatch.update({
          where: { id: batch.id },
          data: {
            status: PayoutBatchStatus.COMPLETED,
            approvedByAdminId: adminId,
            executedAt: new Date(),
            completedAt: new Date(),
          },
        });

        // 2. Process each payout and post balanced ledger entries
        for (const payout of batch.payouts) {
          if (payout.status === PayoutStatus.PAID) continue;

          await tx.sellerPayout.update({
            where: { id: payout.id },
            data: {
              status: PayoutStatus.PAID,
              paidAt: new Date(),
              providerReference: `EXEC-${payout.payoutNumber}`,
            },
          });

          // Post Double-Entry Ledger Transaction:
          // Debit: Seller Payable Liability Account (2010-{sellerId}) -> decreases liability
          // Credit: Cash & Clearing Asset Account (1010) -> decreases cash
          await this.ledgerService.postTransaction(
            {
              referenceType: 'SELLER_PAYOUT',
              referenceId: payout.id,
              description: `Daily payout execution #${payout.payoutNumber} to ${payout.seller.businessName}`,
              entries: [
                {
                  accountCode: `2010-${payout.sellerId}`,
                  sellerId: payout.sellerId,
                  direction: LedgerEntryDirection.DEBIT,
                  amount: payout.amount,
                },
                {
                  accountCode: SYSTEM_ACCOUNTS.CASH_CLEARING,
                  direction: LedgerEntryDirection.CREDIT,
                  amount: payout.amount,
                },
              ],
            },
            tx,
          );

          // Update seller totalSalesAmount / stats
          await tx.sellerProfile.update({
            where: { id: payout.sellerId },
            data: {
              updatedAt: new Date(),
            },
          });
        }

        return tx.payoutBatch.findUnique({
          where: { id: batch.id },
          include: { payouts: true },
        });
      },
      { timeout: 30000, maxWait: 10000 },
    );

    // Audit log
    await this.auditLogsService.log({
      userId: adminId,
      action: 'PAYOUT_BATCH_APPROVED_AND_EXECUTED',
      entityName: 'PayoutBatch',
      entityId: batchId,
      oldValues: { status: batch.status },
      newValues: { status: PayoutBatchStatus.COMPLETED, approvedBy: adminId },
    });

    // Notify sellers
    for (const payout of batch.payouts) {
      if (payout.seller.userId) {
        await this.notificationsService.send({
          userId: payout.seller.userId,
          title: 'Daily Payout Dispatched',
          body: `Your daily payout of $${payout.amount} (${payout.method}) has been approved and processed.`,
          data: { payoutId: payout.id, payoutNumber: payout.payoutNumber },
        });
      }
    }

    return executedBatch;
  }

  /**
   * Retrieves list of all payout batches (Admin/Finance).
   */
  async listPayoutBatches(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [total, items] = await Promise.all([
      this.prisma.payoutBatch.count(),
      this.prisma.payoutBatch.findMany({
        skip,
        take: limit,
        orderBy: { cycleDate: 'desc' },
        include: {
          _count: { select: { payouts: true } },
        },
      }),
    ]);

    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Retrieves payout history for an authenticated seller.
   */
  async getSellerPayouts(userId: string, page = 1, limit = 20) {
    const seller = await this.prisma.sellerProfile.findUnique({
      where: { userId },
    });
    if (!seller) {
      throw new ForbiddenException('Authenticated user does not have a seller profile.');
    }

    const skip = (page - 1) * limit;
    const [total, items] = await Promise.all([
      this.prisma.sellerPayout.count({ where: { sellerId: seller.id } }),
      this.prisma.sellerPayout.findMany({
        where: { sellerId: seller.id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          batch: { select: { batchNumber: true, cycleDate: true } },
        },
      }),
    ]);

    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
