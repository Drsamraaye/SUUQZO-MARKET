import { Module } from '@nestjs/common';
import {
  PaymentsController,
  AdminPaymentsController,
  AdminRefundsController,
  AdminLedgerController,
  AdminPayoutsController,
  SellerFinanceController,
} from './payments.controller.js';
import { PaymentWebhookController } from './payment-webhook.controller.js';
import { PaymentsService } from './payments.service.js';
import { RefundsService } from './refunds.service.js';
import { FinancialLedgerService } from './financial-ledger.service.js';
import { SellerPayoutsService } from './seller-payouts.service.js';
import { PaymentProviderFactory } from './payment-provider.factory.js';
import { AggregatorPaymentAdapter } from './providers/aggregator.adapter.js';
import { BankTransferPaymentAdapter } from './providers/bank-transfer.adapter.js';
import { CashOnDeliveryPaymentAdapter } from './providers/cash-on-delivery.adapter.js';

@Module({
  controllers: [
    PaymentsController,
    AdminPaymentsController,
    AdminRefundsController,
    AdminLedgerController,
    AdminPayoutsController,
    SellerFinanceController,
    PaymentWebhookController,
  ],
  providers: [
    PaymentsService,
    RefundsService,
    FinancialLedgerService,
    SellerPayoutsService,
    PaymentProviderFactory,
    AggregatorPaymentAdapter,
    BankTransferPaymentAdapter,
    CashOnDeliveryPaymentAdapter,
  ],
  exports: [
    PaymentsService,
    RefundsService,
    FinancialLedgerService,
    SellerPayoutsService,
    PaymentProviderFactory,
  ],
})
export class PaymentsModule {}
