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
export class CashOnDeliveryPaymentAdapter implements IPaymentProvider {
  private readonly logger = new Logger(CashOnDeliveryPaymentAdapter.name);
  readonly providerName = 'CASH_ON_DELIVERY';

  readonly supportedMethods: PaymentMethod[] = [PaymentMethod.CASH_ON_DELIVERY];

  async initializePayment(params: InitPaymentParams): Promise<InitPaymentResult> {
    const referenceCode = `SQ-COD-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    this.logger.log(
      `Initialized Cash on Delivery for payment ${params.paymentNumber}, Reference: ${referenceCode}, Amount: $${params.amount}`,
    );

    return {
      isSuccess: true,
      providerReference: referenceCode,
      status: PaymentStatus.PENDING,
      actionRequired: false,
      rawResponse: {
        note: 'Payment will be collected in cash upon physical package delivery.',
        referenceCode,
      },
    };
  }

  async verifyWebhook(_payload: any, _headers: Record<string, string>): Promise<WebhookVerificationResult> {
    return {
      isValid: false,
      provider: this.providerName,
      errorMessage: 'Cash on delivery does not accept webhooks; collection is confirmed by authorized delivery personnel.',
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
      providerRefundId: `COD-REF-${params.refundNumber}`,
      status: 'PENDING',
      rawResponse: {
        note: 'Cash on delivery refund handled via cash payout voucher or store credit.',
      },
    };
  }
}
