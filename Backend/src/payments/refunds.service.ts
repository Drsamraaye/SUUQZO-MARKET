import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { PaymentProviderFactory } from './payment-provider.factory.js';
import { FinancialLedgerService, SYSTEM_ACCOUNTS } from './financial-ledger.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CreateRefundDto } from './dto/create-refund.dto.js';
import {
  PaymentStatus,
  PaymentMethod,
  ParentOrderStatus,
  SubOrderStatus,
  RefundStatus,
  LedgerEntryDirection,
  Prisma,
} from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: PaymentProviderFactory,
    private readonly ledgerService: FinancialLedgerService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Admin executes a full or partial refund against a captured payment.
   * Posts balanced double-entry ledger reversal entries.
   */
  async createRefund(adminId: string, dto: CreateRefundDto) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: dto.paymentId },
      include: {
        order: {
          include: {
            subOrders: {
              include: { seller: { include: { user: true } } },
            },
            customer: { include: { user: true } },
          },
        },
        refunds: true,
      },
    });

    if (!payment) {
      throw new NotFoundException(`Payment with ID "${dto.paymentId}" not found.`);
    }

    if (
      payment.status !== PaymentStatus.CAPTURED &&
      payment.status !== PaymentStatus.PARTIALLY_REFUNDED
    ) {
      throw new BadRequestException(
        `Cannot refund payment in "${payment.status}" status. Only CAPTURED or PARTIALLY_REFUNDED payments are refundable.`,
      );
    }

    // 1. Calculate remaining refundable balance
    const existingRefunded = payment.refunds
      .filter((r) => r.status === RefundStatus.COMPLETED || r.status === RefundStatus.PENDING)
      .reduce((sum, r) => sum.add(new Prisma.Decimal(r.amount)), new Prisma.Decimal(0));

    const remainingRefundable = payment.amount.sub(existingRefunded);

    if (remainingRefundable.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Payment has already been fully refunded.');
    }

    const refundAmount = dto.amount
      ? new Prisma.Decimal(dto.amount)
      : remainingRefundable;

    if (refundAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Refund amount must be greater than zero.');
    }

    if (refundAmount.greaterThan(remainingRefundable)) {
      throw new BadRequestException(
        `Refund amount ($${refundAmount}) exceeds maximum refundable amount ($${remainingRefundable}).`,
      );
    }

    // 2. Identify affected suborder and calculate seller debit vs commission reversal
    let targetSellerId: string;
    let commissionRefundAmount: Prisma.Decimal;
    let sellerDebitAmount: Prisma.Decimal;

    if (dto.subOrderId) {
      const subOrder = payment.order.subOrders.find((s) => s.id === dto.subOrderId);
      if (!subOrder) {
        throw new BadRequestException(
          `SubOrder "${dto.subOrderId}" does not belong to this payment's parent order.`,
        );
      }
      targetSellerId = subOrder.sellerId;
      const rate = new Prisma.Decimal(subOrder.commissionRate || 0.05);
      commissionRefundAmount = refundAmount.mul(rate).toDecimalPlaces(2);
      sellerDebitAmount = refundAmount.sub(commissionRefundAmount);
    } else {
      // If single suborder or whole-order refund
      const primarySubOrder = payment.order.subOrders[0];
      if (!primarySubOrder) {
        throw new BadRequestException('Order does not have associated suborders.');
      }
      targetSellerId = primarySubOrder.sellerId;
      const rate = new Prisma.Decimal(primarySubOrder.commissionRate || 0.05);
      commissionRefundAmount = refundAmount.mul(rate).toDecimalPlaces(2);
      sellerDebitAmount = refundAmount.sub(commissionRefundAmount);
    }

    const refundNumber = `REF-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    // 3. Request refund from payment provider adapter
    const provider = this.providerFactory.getProviderForMethod(payment.paymentMethod);
    const providerRefund = await provider.initiateRefund({
      refundNumber,
      paymentNumber: payment.paymentNumber,
      providerTransactionId: payment.providerTransactionId || undefined,
      amount: refundAmount,
      currency: payment.currency,
      reason: dto.reason,
    });

    // 4. Atomic transaction: create Refund, update Payment/Order, post balanced ledger reversal
    const refund = await this.prisma.$transaction(
      async (tx) => {
        const createdRefund = await tx.refund.create({
          data: {
            refundNumber,
            paymentId: payment.id,
            orderId: payment.orderId,
            subOrderId: dto.subOrderId || null,
            amount: refundAmount,
            currency: payment.currency,
            reason: dto.reason,
            status: RefundStatus.COMPLETED,
            sellerDebitAmount,
            commissionRefundAmount,
            providerRefundId: providerRefund.providerRefundId,
            adminNotes: dto.adminNotes,
            processedAt: new Date(),
          },
        });

        const newTotalRefunded = existingRefunded.add(refundAmount);
        const isFullyRefunded = newTotalRefunded.equals(payment.amount);

        // Update Payment status
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: isFullyRefunded
              ? PaymentStatus.REFUNDED
              : PaymentStatus.PARTIALLY_REFUNDED,
          },
        });

        // If fully refunded, mark Order as REFUNDED
        if (isFullyRefunded) {
          await tx.order.update({
            where: { id: payment.orderId },
            data: { status: ParentOrderStatus.REFUNDED },
          });
        }

        // If suborder targeted and fully refunded, update SubOrder status
        if (dto.subOrderId && isFullyRefunded) {
          await tx.subOrder.update({
            where: { id: dto.subOrderId },
            data: { status: SubOrderStatus.REFUNDED },
          });
        }

        // Post Double-Entry Ledger Reversal Transaction:
        // Debit: Marketplace Commission Revenue Account (4010) -> Reverses revenue
        // Debit: Seller Payable Liability Account (2010-{sellerId}) -> Decreases seller payable liability
        // Credit: Asset Clearing Account (1010/1020/1030) -> Reduces cash/clearing balance
        // Total Debits ($commissionRefundAmount + $sellerDebitAmount = $refundAmount) == Total Credits ($refundAmount)
        let clearingAccount: string = SYSTEM_ACCOUNTS.CASH_CLEARING;
        if (payment.paymentMethod === PaymentMethod.BANK_TRANSFER) {
          clearingAccount = SYSTEM_ACCOUNTS.BANK_TRANSFER;
        } else if (payment.paymentMethod === PaymentMethod.CASH_ON_DELIVERY) {
          clearingAccount = SYSTEM_ACCOUNTS.COD_RECEIVABLE;
        }

        const entries = [];

        if (commissionRefundAmount.greaterThan(0)) {
          entries.push({
            accountCode: SYSTEM_ACCOUNTS.COMMISSION_REVENUE,
            direction: LedgerEntryDirection.DEBIT,
            amount: commissionRefundAmount,
          });
        }

        if (sellerDebitAmount.greaterThan(0)) {
          entries.push({
            accountCode: `2010-${targetSellerId}`,
            sellerId: targetSellerId,
            direction: LedgerEntryDirection.DEBIT,
            amount: sellerDebitAmount,
          });
        }

        entries.push({
          accountCode: clearingAccount,
          direction: LedgerEntryDirection.CREDIT,
          amount: refundAmount,
        });

        await this.ledgerService.postTransaction(
          {
            referenceType: 'REFUND',
            referenceId: createdRefund.id,
            description: `Refund #${refundNumber} of $${refundAmount} for Payment #${payment.paymentNumber}`,
            entries,
          },
          tx,
        );

        return createdRefund;
      },
      { timeout: 30000, maxWait: 10000 },
    );

    // 5. Audit log
    await this.auditLogsService.log({
      userId: adminId,
      action: 'REFUND_EXECUTED',
      entityName: 'Refund',
      entityId: refund.id,
      newValues: {
        refundNumber: refund.refundNumber,
        amount: refundAmount.toString(),
        paymentId: payment.id,
        reason: dto.reason,
      },
    });

    // 6. Notify customer
    if (payment.order.customer?.userId) {
      await this.notificationsService.send({
        userId: payment.order.customer.userId,
        title: 'Refund Processed',
        body: `A refund of $${refundAmount} has been processed for Order #${payment.order.orderNumber}.`,
        data: { refundId: refund.id, refundNumber: refund.refundNumber },
      });
    }

    return refund;
  }

  /**
   * Retrieve refund by ID.
   */
  async getRefundById(refundId: string) {
    const refund = await this.prisma.refund.findUnique({
      where: { id: refundId },
      include: {
        payment: true,
        order: true,
        subOrder: true,
      },
    });

    if (!refund) {
      throw new NotFoundException(`Refund with ID "${refundId}" not found.`);
    }

    return refund;
  }

  /**
   * List all refunds (Admin/Finance).
   */
  async listRefunds(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [total, items] = await Promise.all([
      this.prisma.refund.count(),
      this.prisma.refund.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          payment: { select: { paymentNumber: true, paymentMethod: true } },
          order: { select: { orderNumber: true } },
        },
      }),
    ]);

    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
