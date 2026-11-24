import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  IPaymentProvider,
  InitPaymentParams,
  InitPaymentResult,
  WebhookVerificationResult,
  PaymentQueryResult,
  RefundParams,
  RefundResult,
} from '../payment-provider.interface.js';
import { PaymentMethod, PaymentStatus } from '@prisma/client';

@Injectable()
export class BankTransferPaymentAdapter implements IPaymentProvider {
  private readonly logger = new Logger(BankTransferPaymentAdapter.name);
  readonly providerName = 'MANUAL_BANK_TRANSFER';

  readonly supportedMethods: PaymentMethod[] = [PaymentMethod.BANK_TRANSFER];

  async initializePayment(params: InitPaymentParams): Promise<InitPaymentResult> {
    const referenceCode = `SQ-BT-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    this.logger.log(
      `Initialized Bank Transfer for payment ${params.paymentNumber}, Reference: ${referenceCode}, Amount: $${params.amount}`,
    );

    return {
      isSuccess: true,
      providerReference: referenceCode,
      status: PaymentStatus.PENDING,
      actionRequired: true,
      rawResponse: {
        instructions: 'Please transfer the exact amount to SUUQZO Premier Bank or Dahabshiil Bank account.',
        bankAccountName: 'SUUQZO MALL GENERAL TRADING',
        bankAccounts: [
          { bank: 'Premier Bank', accountNumber: '010200304001', currency: 'USD' },
          { bank: 'Dahabshiil Bank', accountNumber: '9876543210', currency: 'USD' },
        ],
        referenceCode,
        requiredPaymentReference: referenceCode,
      },
    };
  }

  async verifyWebhook(_payload: any, _headers: Record<string, string>): Promise<WebhookVerificationResult> {
    return {
      isValid: false,
      provider: this.providerName,
      errorMessage: 'Bank Transfer does not accept webhooks; verification is manual via Admin Audit.',
    };
  }

  async queryStatus(providerReference: string): Promise<PaymentQueryResult> {
    return {
      isSuccess: true,
      status: PaymentStatus.PENDING,
      providerTransactionId: providerReference,
    };
  }

  async initiateRefund(params: RefundParams): Promise<RefundResult> {
    return {
      isSuccess: true,
      providerRefundId: `BT-REF-${params.refundNumber}`,
      status: 'PENDING',
      rawResponse: {
        note: 'Bank transfer refund must be executed via manual bank transfer and audited.',
      },
    };
  }
}
