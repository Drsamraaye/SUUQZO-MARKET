import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { PaymentProviderFactory } from './payment-provider.factory.js';
import { FinancialLedgerService, SYSTEM_ACCOUNTS } from './financial-ledger.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { VerifyBankTransferDto, CollectCodDto } from './dto/verify-bank-transfer.dto.js';
import { QueryPaymentsDto } from './dto/query-payments.dto.js';
import {
  ParentOrderStatus,
  SubOrderStatus,
  PaymentStatus,
  PaymentMethod,
  ReservationStatus,
  StockMovementType,
  WebhookProcessStatus,
  LedgerEntryDirection,
  UserRole,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../common/interfaces/request-context.interface.js';
import * as crypto from 'crypto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: PaymentProviderFactory,
    private readonly ledgerService: FinancialLedgerService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Customer initiates a payment for an active order.
   */
  async createPayment(userId: string, dto: CreatePaymentDto) {
    const customer = await this.prisma.customerProfile.findUnique({
      where: { userId },
    });
    if (!customer) {
      throw new NotFoundException('Customer profile not found.');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        subOrders: true,
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID "${dto.orderId}" not found.`);
    }

    if (order.customerId !== customer.id) {
      throw new ForbiddenException('Access denied: You do not own this order.');
    }

    if (
      order.status === ParentOrderStatus.CONFIRMED ||
      order.status === ParentOrderStatus.FULFILLED ||
      order.status === ParentOrderStatus.PARTIALLY_FULFILLED
    ) {
      throw new BadRequestException('Order has already been confirmed and paid.');
    }

    if (order.status === ParentOrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot pay for a cancelled order.');
    }

    // Check if there is already a CAPTURED payment
    const capturedPayment = order.payments.find((p) => p.status === PaymentStatus.CAPTURED);
    if (capturedPayment) {
      throw new BadRequestException('Order already has a captured payment.');
    }

    // Idempotency: If pending payment exists with same method, return it
    const existingPending = order.payments.find(
      (p) => p.status === PaymentStatus.PENDING && p.paymentMethod === dto.paymentMethod,
    );
    if (existingPending) {
      return {
        payment: existingPending,
        message: 'Active payment session already exists for this order and method.',
        isIdempotent: true,
      };
    }

    const provider = this.providerFactory.getProviderForMethod(dto.paymentMethod);
    const paymentNumber = `PAY-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    // Initialize with provider
    const initResult = await provider.initializePayment({
      paymentNumber,
      orderNumber: order.orderNumber,
      amount: order.totalPayable,
      currency: order.currency,
      paymentMethod: dto.paymentMethod,
      payerPhone: dto.payerPhone,
      payerAccount: dto.payerAccount,
      metadata: {
        orderId: order.id,
        customerId: customer.id,
        idempotencyKey: dto.idempotencyKey,
      },
    });

    // Atomic persistence of Payment and PaymentTransaction
    const payment = await this.prisma.$transaction(
      async (tx) => {
        const createdPayment = await tx.payment.create({
          data: {
            paymentNumber,
            orderId: order.id,
            amount: order.totalPayable,
            currency: order.currency,
            paymentMethod: dto.paymentMethod,
            paymentProvider: provider.providerName,
            status: initResult.status || PaymentStatus.PENDING,
            payerPhone: dto.payerPhone,
            payerAccount: dto.payerAccount,
            providerTransactionId: initResult.providerTransactionId,
            providerReference: initResult.providerReference,
            metadata: {
              idempotencyKey: dto.idempotencyKey,
              rawInitResponse: initResult.rawResponse,
            },
          },
        });

        await tx.paymentTransaction.create({
          data: {
            paymentId: createdPayment.id,
            action: 'INITIALIZE',
            requestPayload: { ...dto },
            responsePayload: initResult.rawResponse || {},
            statusCode: '200',
            isSuccess: initResult.isSuccess,
          },
        });

        // Advance order to PAYMENT_PROCESSING
        if (order.status === ParentOrderStatus.PENDING_PAYMENT) {
          await tx.order.update({
            where: { id: order.id },
            data: { status: ParentOrderStatus.PAYMENT_PROCESSING },
          });
        }

        return createdPayment;
      },
      { timeout: 30000, maxWait: 10000 },
    );

    await this.auditLogsService.log({
      userId,
      action: 'PAYMENT_INITIALIZED',
      entityName: 'Payment',
      entityId: payment.id,
      newValues: {
        paymentNumber: payment.paymentNumber,
        method: payment.paymentMethod,
        amount: payment.amount.toString(),
      },
    });

    return {
      payment,
      providerDetails: initResult.rawResponse,
      actionRequired: initResult.actionRequired,
      redirectUrl: initResult.redirectUrl,
    };
  }

  /**
   * Webhook processor: Verifies signature, deduplicates, and captures payment.
   */
  async processWebhookEvent(
    providerName: string,
    payload: any,
    headers: Record<string, string>,
  ) {
    const provider = this.providerFactory.getProviderByName(providerName);

    // 1. Signature verification
    const verification = await provider.verifyWebhook(payload, headers);
    if (!verification.isValid) {
      this.logger.warn(`Invalid webhook from ${providerName}: ${verification.errorMessage}`);
      throw new BadRequestException(verification.errorMessage || 'Invalid webhook signature');
    }

    const eventId = verification.eventId || `evt-${Date.now()}`;

    // 2. Event deduplication check
    const existingEvent = await this.prisma.providerWebhookEvent.findUnique({
      where: {
        provider_eventId: {
          provider: provider.providerName,
          eventId,
        },
      },
    });

    if (existingEvent && existingEvent.status === WebhookProcessStatus.PROCESSED) {
      return {
        isIdempotent: true,
        message: 'Webhook event has already been processed.',
        eventId,
      };
    }

    // Record webhook event as PROCESSING
    let webhookRecord = existingEvent;
    if (!webhookRecord) {
      webhookRecord = await this.prisma.providerWebhookEvent.create({
        data: {
          provider: provider.providerName,
          eventId,
          eventType: verification.eventType || 'PAYMENT_EVENT',
          payload: payload || {},
          headers: headers || {},
          status: WebhookProcessStatus.PROCESSING,
        },
      });
    }

    // 3. Match payment by providerReference or providerTransactionId
    const payment = await this.prisma.payment.findFirst({
      where: {
        OR: [
          { providerReference: verification.providerReference },
          { providerTransactionId: verification.providerTransactionId },
          { paymentNumber: payload?.paymentNumber },
        ].filter(Boolean) as any,
      },
      include: {
        order: {
          include: {
            subOrders: true,
            customer: true,
          },
        },
      },
    });

    if (!payment) {
      await this.prisma.providerWebhookEvent.update({
        where: { id: webhookRecord.id },
        data: {
          status: WebhookProcessStatus.FAILED,
          errorMessage: 'Matching payment record not found.',
        },
      });
      throw new NotFoundException('Matching payment record not found for webhook.');
    }

    // If already CAPTURED, idempotent return
    if (payment.status === PaymentStatus.CAPTURED) {
      await this.prisma.providerWebhookEvent.update({
        where: { id: webhookRecord.id },
        data: { status: WebhookProcessStatus.PROCESSED, processedAt: new Date() },
      });
      return {
        isIdempotent: true,
        message: 'Payment already captured previously.',
        paymentId: payment.id,
      };
    }

    // 4. Capture Payment and execute fulfillment + ledger workflow
    if (verification.status === PaymentStatus.CAPTURED) {
      await this.finalizePaymentCapture(
        payment.id,
        'AGGREGATOR_WEBHOOK',
        verification.providerTransactionId || payment.providerTransactionId || '',
        payload,
      );

      await this.prisma.providerWebhookEvent.update({
        where: { id: webhookRecord.id },
        data: { status: WebhookProcessStatus.PROCESSED, processedAt: new Date() },
      });

      return {
        isSuccess: true,
        status: PaymentStatus.CAPTURED,
        paymentId: payment.id,
      };
    }

    // If provider reported failure
    if (verification.status === PaymentStatus.FAILED) {
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.FAILED,
            failedAt: new Date(),
            failureReason: verification.errorMessage || 'Provider reported payment failure',
          },
        });

        await tx.paymentTransaction.create({
          data: {
            paymentId: payment.id,
            action: 'WEBHOOK_FAILED',
            responsePayload: payload,
            isSuccess: false,
          },
        });
      });

      await this.prisma.providerWebhookEvent.update({
        where: { id: webhookRecord.id },
        data: { status: WebhookProcessStatus.PROCESSED, processedAt: new Date() },
      });

      return { isSuccess: false, status: PaymentStatus.FAILED };
    }

    return { isSuccess: true, status: payment.status };
  }

  /**
   * Admin audits and confirms a Bank Transfer payment.
   */
  async confirmBankTransfer(
    adminId: string,
    paymentId: string,
    dto: VerifyBankTransferDto,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });

    if (!payment) {
      throw new NotFoundException(`Payment with ID "${paymentId}" not found.`);
    }

    if (payment.paymentMethod !== PaymentMethod.BANK_TRANSFER) {
      throw new BadRequestException('Payment method is not Bank Transfer.');
    }

    if (payment.status === PaymentStatus.CAPTURED) {
      throw new BadRequestException('Payment has already been confirmed and captured.');
    }

    await this.finalizePaymentCapture(
      payment.id,
      'BANK_TRANSFER_ADMIN_VERIFY',
      dto.bankReference,
      dto,
      adminId,
    );

    await this.auditLogsService.log({
      userId: adminId,
      action: 'BANK_TRANSFER_PAYMENT_CONFIRMED',
      entityName: 'Payment',
      entityId: payment.id,
      newValues: {
        bankReference: dto.bankReference,
        adminNotes: dto.adminNotes,
        amount: payment.amount.toString(),
      },
    });

    return this.getPaymentById(payment.id);
  }

  /**
   * Authorized personnel confirms Cash on Delivery collection upon physical delivery.
   */
  async confirmCodCollection(
    authorizedUserId: string,
    paymentId: string,
    dto: CollectCodDto,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException(`Payment with ID "${paymentId}" not found.`);
    }

    if (payment.paymentMethod !== PaymentMethod.CASH_ON_DELIVERY) {
      throw new BadRequestException('Payment method is not Cash on Delivery.');
    }

    if (payment.status === PaymentStatus.CAPTURED) {
      throw new BadRequestException('Cash on Delivery has already been marked collected.');
    }

    await this.finalizePaymentCapture(
      payment.id,
      'COD_COLLECTION_CONFIRM',
      `COD-${payment.paymentNumber}`,
      dto,
      authorizedUserId,
    );

    await this.auditLogsService.log({
      userId: authorizedUserId,
      action: 'COD_PAYMENT_COLLECTED',
      entityName: 'Payment',
      entityId: payment.id,
      newValues: {
        collectedByRiderId: dto.collectedByRiderId,
        notes: dto.notes,
        amount: payment.amount.toString(),
      },
    });

    return this.getPaymentById(payment.id);
  }

  /**
   * Core atomic payment capture engine:
   * 1. Updates Payment status to CAPTURED
   * 2. Advances Order and SubOrders to CONFIRMED
   * 3. Consumes Inventory Reservations & decrements physical stock
   * 4. Posts Double-Entry Financial Ledger transaction (Asset clearing vs Seller Payables & Commission)
   * 5. Dispatches notifications
   */
  private async finalizePaymentCapture(
    paymentId: string,
    action: string,
    referenceId: string,
    payload: any,
    actorId?: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        // 1. Fetch payment with order and suborders
        const payment = await tx.payment.findUniqueOrThrow({
          where: { id: paymentId },
          include: {
            order: {
              include: {
                subOrders: {
                  include: {
                    seller: { include: { user: true } },
                  },
                },
                customer: { include: { user: true } },
              },
            },
          },
        });

        // 2. Update Payment
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.CAPTURED,
            capturedAt: new Date(),
            providerTransactionId: referenceId || payment.providerTransactionId,
            metadata: {
              ...(payment.metadata as Record<string, any>),
              capturedBy: actorId || 'SYSTEM_WEBHOOK',
              capturePayload: payload,
            },
          },
        });

        // 3. Record PaymentTransaction
        await tx.paymentTransaction.create({
          data: {
            paymentId: payment.id,
            action,
            responsePayload: payload || {},
            statusCode: '200',
            isSuccess: true,
          },
        });

        // 4. Update Parent Order -> CONFIRMED
        await tx.order.update({
          where: { id: payment.orderId },
          data: {
            status: ParentOrderStatus.CONFIRMED,
          },
        });

        // 5. Update SubOrders -> CONFIRMED (if currently PENDING_ACCEPTANCE)
        await tx.subOrder.updateMany({
          where: {
            parentOrderId: payment.orderId,
            status: SubOrderStatus.PENDING_ACCEPTANCE,
          },
          data: {
            status: SubOrderStatus.CONFIRMED,
            confirmedAt: new Date(),
          },
        });

        // 6. Consume Inventory Reservations & deduct physical stock
        const activeReservations = await tx.inventoryReservation.findMany({
          where: {
            orderId: payment.orderId,
            status: ReservationStatus.ACTIVE,
          },
        });

        for (const res of activeReservations) {
          const inv = await tx.inventoryItem.update({
            where: { id: res.inventoryItemId },
            data: {
              reservedQuantity: { decrement: res.quantity },
              quantityOnHand: { decrement: res.quantity },
            },
          });

          await tx.inventoryReservation.update({
            where: { id: res.id },
            data: { status: ReservationStatus.CONSUMED },
          });

          await tx.stockMovement.create({
            data: {
              inventoryItemId: res.inventoryItemId,
              type: StockMovementType.PURCHASE_FULFILL,
              quantityChange: -res.quantity,
              quantityBefore: inv.quantityOnHand + res.quantity,
              quantityAfter: inv.quantityOnHand,
              referenceType: 'ORDER',
              referenceId: payment.orderId,
              notes: `Stock consumed upon payment capture #${payment.paymentNumber}`,
            },
          });
        }

        // 7. Post Double-Entry Financial Ledger Transaction
        // Select appropriate asset clearing account based on payment method
        let clearingAccount: string = SYSTEM_ACCOUNTS.CASH_CLEARING;
        if (payment.paymentMethod === PaymentMethod.BANK_TRANSFER) {
          clearingAccount = SYSTEM_ACCOUNTS.BANK_TRANSFER;
        } else if (payment.paymentMethod === PaymentMethod.CASH_ON_DELIVERY) {
          clearingAccount = SYSTEM_ACCOUNTS.COD_RECEIVABLE;
        }

        const entries: Array<{
          accountCode: string;
          direction: LedgerEntryDirection;
          amount: Prisma.Decimal;
          sellerId?: string;
        }> = [];

        // Debit: Asset Clearing Account for total payment amount
        entries.push({
          accountCode: clearingAccount,
          direction: LedgerEntryDirection.DEBIT,
          amount: payment.amount,
        });

        let totalCommission = new Prisma.Decimal(0);

        // Credit: Each participating Seller's Payable Sub-account
        for (const subOrder of payment.order.subOrders) {
          entries.push({
            accountCode: `2010-${subOrder.sellerId}`,
            sellerId: subOrder.sellerId,
            direction: LedgerEntryDirection.CREDIT,
            amount: subOrder.sellerPayableAmount,
          });

          totalCommission = totalCommission.add(subOrder.commissionAmount);
        }

        // Credit: 5% Marketplace Commission Revenue Account
        if (totalCommission.greaterThan(0)) {
          entries.push({
            accountCode: SYSTEM_ACCOUNTS.COMMISSION_REVENUE,
            direction: LedgerEntryDirection.CREDIT,
            amount: totalCommission,
          });
        }

        await this.ledgerService.postTransaction(
          {
            referenceType: 'PAYMENT_CAPTURE',
            referenceId: payment.id,
            description: `Payment capture #${payment.paymentNumber} for Order #${payment.order.orderNumber}`,
            entries,
          },
          tx,
        );

        // Notify customer
        if (payment.order.customer?.userId) {
          await this.notificationsService.send({
            userId: payment.order.customer.userId,
            title: 'Payment Successful',
            body: `Your payment of $${payment.amount} for Order #${payment.order.orderNumber} has been confirmed.`,
            data: { orderId: payment.orderId, paymentId: payment.id },
          });
        }

        // Notify sellers
        for (const subOrder of payment.order.subOrders) {
          if (subOrder.seller?.userId) {
            await this.notificationsService.send({
              userId: subOrder.seller.userId,
              title: 'New Paid Order Received',
              body: `Suborder #${subOrder.subOrderNumber} has been paid and confirmed. Earnings: $${subOrder.sellerPayableAmount}.`,
              data: { subOrderId: subOrder.id, orderId: payment.orderId },
            });
          }
        }

        return payment;
      },
      { timeout: 30000, maxWait: 10000 },
    );
  }

  /**
   * Retrieve payment by ID with security authorization check.
   */
  async getPaymentById(paymentId: string, user?: AuthenticatedUser) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          include: {
            subOrders: true,
            customer: true,
          },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
        },
        refunds: true,
      },
    });

    if (!payment) {
      throw new NotFoundException(`Payment with ID "${paymentId}" not found.`);
    }

    if (user) {
      // Customer IDOR check
      if (user.role === UserRole.CUSTOMER) {
        if (payment.order.customer.userId !== user.id) {
          throw new ForbiddenException('Access denied: You cannot view this payment.');
        }
      }

      // Seller IDOR check
      if (user.role === UserRole.SELLER) {
        const seller = await this.prisma.sellerProfile.findUnique({
          where: { userId: user.id },
        });
        const belongsToSeller = payment.order.subOrders.some(
          (s) => s.sellerId === seller?.id,
        );
        if (!belongsToSeller) {
          throw new ForbiddenException('Access denied: You do not have suborders in this payment.');
        }
      }
    }

    return payment;
  }

  /**
   * Customer: List own payment history.
   */
  async listCustomerPayments(userId: string, query: QueryPaymentsDto) {
    const customer = await this.prisma.customerProfile.findUnique({
      where: { userId },
    });
    if (!customer) {
      return { items: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {
      order: {
        customerId: customer.id,
      },
    };

    if (query.status) {
      where.status = query.status as PaymentStatus;
    }
    if (query.paymentMethod) {
      where.paymentMethod = query.paymentMethod as PaymentMethod;
    }

    const [total, items] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            select: { orderNumber: true, totalPayable: true, status: true },
          },
        },
      }),
    ]);

    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Admin: List all marketplace payments with filtering and pagination.
   */
  async listAdminPayments(query: QueryPaymentsDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {};

    if (query.status) {
      where.status = query.status as PaymentStatus;
    }
    if (query.paymentMethod) {
      where.paymentMethod = query.paymentMethod as PaymentMethod;
    }
    if (query.orderId) {
      where.orderId = query.orderId;
    }
    if (query.search) {
      where.OR = [
        { paymentNumber: { contains: query.search, mode: 'insensitive' } },
        { providerReference: { contains: query.search, mode: 'insensitive' } },
        { providerTransactionId: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            select: { orderNumber: true, totalPayable: true, status: true },
          },
          refunds: {
            select: { refundNumber: true, amount: true, status: true },
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
