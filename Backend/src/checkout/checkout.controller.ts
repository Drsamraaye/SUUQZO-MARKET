import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CheckoutService } from './checkout.service.js';
import { CheckoutDto } from './dto/checkout.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/interfaces/request-context.interface.js';

@Controller('api/v1/checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  /**
   * Executes atomic multi-vendor checkout for the authenticated customer.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckoutDto,
  ) {
    return this.checkoutService.checkout(user.id, dto);
  }
}
