import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { RefundsService } from './refunds.service.js';
import { FinancialLedgerService } from './financial-ledger.service.js';
import { SellerPayoutsService } from './seller-payouts.service.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { VerifyBankTransferDto, CollectCodDto } from './dto/verify-bank-transfer.dto.js';
import { CreateRefundDto, CreatePayoutBatchDto } from './dto/create-refund.dto.js';
import { QueryPaymentsDto } from './dto/query-payments.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RequirePermissions } from '../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../authorization/permissions/permission.constants.js';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthenticatedUser } from '../common/interfaces/request-context.interface.js';

// ============================================================================
// CUSTOMER PAYMENT CONTROLLER — /api/v1/payments
// ============================================================================
@Controller('api/v1/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Customer initiates a new payment.
   * POST /api/v1/payments
   */
  @Post()
  @Roles(UserRole.CUSTOMER)
  @HttpCode(HttpStatus.CREATED)
  async createPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.paymentsService.createPayment(user.id, dto);
  }

  /**
   * Customer lists own payment history.
   * GET /api/v1/payments/mine
   */
  @Get('mine')
  @Roles(UserRole.CUSTOMER)
  async listMyPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryPaymentsDto,
  ) {
    return this.paymentsService.listCustomerPayments(user.id, query);
  }

  /**
   * Get single payment by ID (with ownership verification).
   * GET /api/v1/payments/:id
   */
  @Get(':id')
  async getPayment(
    @Param('id') paymentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.getPaymentById(paymentId, user);
  }
}

// ============================================================================
// ADMIN PAYMENTS CONTROLLER — /api/v1/admin/payments
// ============================================================================
@Controller('api/v1/admin/payments')
export class AdminPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Admin lists all payments across marketplace.
   * GET /api/v1/admin/payments
   */
  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_PAYMENTS_VIEW)
  async listPayments(@Query() query: QueryPaymentsDto) {
    return this.paymentsService.listAdminPayments(query);
  }

  /**
   * Admin gets single payment details.
   * GET /api/v1/admin/payments/:id
   */
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_PAYMENTS_VIEW)
  async getPayment(@Param('id') paymentId: string) {
    return this.paymentsService.getPaymentById(paymentId);
  }

  /**
   * Admin verifies Bank Transfer payment.
   * POST /api/v1/admin/payments/:id/verify-bank-transfer
   */
  @Post(':id/verify-bank-transfer')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_PAYMENTS_MANAGE)
  @HttpCode(HttpStatus.OK)
  async verifyBankTransfer(
    @Param('id') paymentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyBankTransferDto,
  ) {
    return this.paymentsService.confirmBankTransfer(user.id, paymentId, dto);
  }

  /**
   * Confirm Cash on Delivery collection upon physical delivery.
   * POST /api/v1/admin/payments/:id/confirm-cod
   */
  @Post(':id/confirm-cod')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_PAYMENTS_MANAGE)
  @HttpCode(HttpStatus.OK)
  async confirmCod(
    @Param('id') paymentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CollectCodDto,
  ) {
    return this.paymentsService.confirmCodCollection(user.id, paymentId, dto);
  }
}

// ============================================================================
// ADMIN REFUNDS CONTROLLER — /api/v1/admin/refunds
// ============================================================================
@Controller('api/v1/admin/refunds')
export class AdminRefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  /**
   * Admin creates full or partial refund.
   * POST /api/v1/admin/refunds
   */
  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_ORDERS_REFUND)
  @HttpCode(HttpStatus.CREATED)
  async createRefund(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRefundDto,
  ) {
    return this.refundsService.createRefund(user.id, dto);
  }

  /**
   * Admin lists all refunds.
   * GET /api/v1/admin/refunds
   */
  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_PAYMENTS_VIEW)
  async listRefunds(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.refundsService.listRefunds(
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  /**
   * Admin retrieves single refund details.
   * GET /api/v1/admin/refunds/:id
   */
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_PAYMENTS_VIEW)
  async getRefund(@Param('id') refundId: string) {
    return this.refundsService.getRefundById(refundId);
  }
}

// ============================================================================
// ADMIN FINANCIAL LEDGER CONTROLLER — /api/v1/admin/ledger
// ============================================================================
@Controller('api/v1/admin/ledger')
export class AdminLedgerController {
  constructor(private readonly ledgerService: FinancialLedgerService) {}

  /**
   * Admin retrieves chart of accounts and live balances.
   * GET /api/v1/admin/ledger/accounts
   */
  @Get('accounts')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_PAYMENTS_VIEW)
  async getAccounts() {
    return this.ledgerService.getAllAccounts();
  }

  /**
   * Admin retrieves paginated double-entry ledger transactions with entries.
   * GET /api/v1/admin/ledger/transactions
   */
  @Get('transactions')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_PAYMENTS_VIEW)
  async getTransactions(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.ledgerService.getTransactions(
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }
}

// ============================================================================
// ADMIN PAYOUTS CONTROLLER — /api/v1/admin/payouts
// ============================================================================
@Controller('api/v1/admin/payouts')
export class AdminPayoutsController {
  constructor(private readonly payoutsService: SellerPayoutsService) {}

  /**
   * Admin generates daily payout batch.
   * POST /api/v1/admin/payouts/generate
   */
  @Post('generate')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_PAYOUTS_APPROVE)
  @HttpCode(HttpStatus.CREATED)
  async generatePayoutBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto?: CreatePayoutBatchDto,
  ) {
    return this.payoutsService.generateDailyPayoutBatch(user.id, dto?.sellerId);
  }

  /**
   * Admin approves and executes daily payout batch (posts double-entry ledger).
   * POST /api/v1/admin/payouts/:batchId/approve
   */
  @Post(':batchId/approve')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_PAYOUTS_APPROVE)
  @HttpCode(HttpStatus.OK)
  async approvePayoutBatch(
    @Param('batchId') batchId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payoutsService.approveAndExecuteBatch(batchId, user.id);
  }

  /**
   * Admin lists all payout batches.
   * GET /api/v1/admin/payouts
   */
  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_PAYOUTS_VIEW)
  async listPayoutBatches(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.payoutsService.listPayoutBatches(
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }
}

// ============================================================================
// SELLER FINANCE CONTROLLER — /api/v1/seller
// ============================================================================
@Controller('api/v1/seller')
export class SellerFinanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: FinancialLedgerService,
    private readonly payoutsService: SellerPayoutsService,
  ) {}

  /**
   * Seller checks own live financial balance.
   * GET /api/v1/seller/balance
   */
  @Get('balance')
  @Roles(UserRole.SELLER)
  async getBalance(@CurrentUser() user: AuthenticatedUser) {
    const seller = await this.prisma.sellerProfile.findUnique({
      where: { userId: user.id },
    });
    if (!seller) {
      throw new ForbiddenException('Authenticated user does not have an active seller profile.');
    }
    return this.ledgerService.getSellerBalance(seller.id);
  }

  /**
   * Seller views own payout history.
   * GET /api/v1/seller/payouts
   */
  @Get('payouts')
  @Roles(UserRole.SELLER)
  async getPayouts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.payoutsService.getSellerPayouts(
      user.id,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }
}
