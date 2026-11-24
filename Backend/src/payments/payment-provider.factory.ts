import { Injectable, BadRequestException } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { IPaymentProvider } from './payment-provider.interface.js';
import { AggregatorPaymentAdapter } from './providers/aggregator.adapter.js';
import { BankTransferPaymentAdapter } from './providers/bank-transfer.adapter.js';
import { CashOnDeliveryPaymentAdapter } from './providers/cash-on-delivery.adapter.js';

@Injectable()
export class PaymentProviderFactory {
  constructor(
    private readonly aggregatorAdapter: AggregatorPaymentAdapter,
    private readonly bankTransferAdapter: BankTransferPaymentAdapter,
    private readonly codAdapter: CashOnDeliveryPaymentAdapter,
  ) {}

  getProviderForMethod(method: PaymentMethod): IPaymentProvider {
    switch (method) {
      case PaymentMethod.EVC_PLUS:
      case PaymentMethod.ZAAD:
      case PaymentMethod.EDAHAB:
      case PaymentMethod.PREMIER_WALLET:
        return this.aggregatorAdapter;

      case PaymentMethod.BANK_TRANSFER:
        return this.bankTransferAdapter;

      case PaymentMethod.CASH_ON_DELIVERY:
        return this.codAdapter;

      default:
        throw new BadRequestException(`Unsupported payment method: "${method}"`);
    }
  }

  getProviderByName(providerName: string): IPaymentProvider {
    const normalized = providerName.toUpperCase();
    if (normalized.includes('AGGREGATOR') || normalized.includes('WAAFI') || normalized.includes('HORMUUD')) {
      return this.aggregatorAdapter;
    }
    if (normalized.includes('BANK')) {
      return this.bankTransferAdapter;
    }
    if (normalized.includes('COD') || normalized.includes('DELIVERY')) {
      return this.codAdapter;
    }
    // Default fallback to aggregator
    return this.aggregatorAdapter;
  }
}
