import { PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';

export interface InitPaymentParams {
  paymentNumber: string;
  orderNumber: string;
  amount: Prisma.Decimal;
  currency: string;
  paymentMethod: PaymentMethod;
  payerPhone?: string;
  payerAccount?: string;
  callbackUrl?: string;
  metadata?: Record<string, any>;
}

export interface InitPaymentResult {
  isSuccess: boolean;
  providerTransactionId?: string;
  providerReference?: string;
  redirectUrl?: string;
  actionRequired?: boolean;
  status: PaymentStatus;
  rawResponse?: any;
  errorMessage?: string;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  provider: string;
  eventId?: string;
  eventType?: string;
  providerTransactionId?: string;
  providerReference?: string;
  amount?: Prisma.Decimal;
  currency?: string;
  status?: PaymentStatus;
  rawPayload?: any;
  errorMessage?: string;
}

export interface PaymentQueryResult {
  isSuccess: boolean;
  status: PaymentStatus;
  providerTransactionId?: string;
  paidAt?: Date;
  rawResponse?: any;
}

export interface RefundParams {
  refundNumber: string;
  paymentNumber: string;
  providerTransactionId?: string;
  amount: Prisma.Decimal;
  currency: string;
  reason: string;
}

export interface RefundResult {
  isSuccess: boolean;
  providerRefundId?: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  rawResponse?: any;
  errorMessage?: string;
}

export interface IPaymentProvider {
  readonly providerName: string;
  readonly supportedMethods: PaymentMethod[];

  initializePayment(params: InitPaymentParams): Promise<InitPaymentResult>;
  verifyWebhook(payload: any, headers: Record<string, string>): Promise<WebhookVerificationResult>;
  queryStatus(providerReference: string): Promise<PaymentQueryResult>;
  initiateRefund(params: RefundParams): Promise<RefundResult>;
}
