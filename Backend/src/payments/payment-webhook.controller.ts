import {
  Controller,
  Post,
  Param,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { Public } from '../common/decorators/public.decorator.js';

@Controller('api/v1/webhooks/payment')
export class PaymentWebhookController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Universal Payment Webhook Receiver.
   * Public endpoint verified via cryptographic HMAC signatures.
   * POST /api/v1/webhooks/payment
   */
  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() payload: any,
    @Headers() headers: Record<string, string>,
  ) {
    const providerName = headers['x-payment-provider'] || 'CENTRALIZED_AGGREGATOR';
    return this.paymentsService.processWebhookEvent(providerName, payload, headers);
  }

  /**
   * Provider-specific Webhook Receiver.
   * POST /api/v1/webhooks/payment/:provider
   */
  @Post(':provider')
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleProviderWebhook(
    @Param('provider') provider: string,
    @Body() payload: any,
    @Headers() headers: Record<string, string>,
  ) {
    return this.paymentsService.processWebhookEvent(provider, payload, headers);
  }
}
