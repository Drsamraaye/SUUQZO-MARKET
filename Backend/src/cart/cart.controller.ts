import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CartService } from './cart.service.js';
import { AddToCartDto } from './dto/add-to-cart.dto.js';
import { UpdateCartItemDto } from './dto/update-cart-item.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/interfaces/request-context.interface.js';

@Controller('api/v1/cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  /**
   * Adds an item / variant to the customer's active cart.
   */
  @Post('items')
  @HttpCode(HttpStatus.OK)
  async addItem(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddToCartDto,
  ) {
    return this.cartService.addItem(user.id, dto);
  }

  /**
   * Retrieves the customer's active shopping cart.
   */
  @Get()
  async getCart(@CurrentUser() user: AuthenticatedUser) {
    return this.cartService.getCart(user.id);
  }

  /**
   * Updates the quantity of a specific item in the cart.
   */
  @Patch('items/:itemId')
  async updateItemQuantity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItemQuantity(user.id, itemId, dto);
  }

  /**
   * Removes a specific item from the cart.
   */
  @Delete('items/:itemId')
  async removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId') itemId: string,
  ) {
    return this.cartService.removeItem(user.id, itemId);
  }

  /**
   * Clears the entire cart for the customer.
   */
  @Delete()
  async clearCart(@CurrentUser() user: AuthenticatedUser) {
    return this.cartService.clearCart(user.id);
  }
}
