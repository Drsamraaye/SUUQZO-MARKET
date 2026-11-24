import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { InventoryService } from './inventory.service.js';
import { AdjustStockDto } from './dto/adjust-stock.dto.js';
import { ListInventoryDto } from './dto/list-inventory.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../common/interfaces/request-context.interface.js';

@Controller('api/v1/inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  /**
   * Public stock availability inquiry.
   */
  @Public()
  @Get('availability/:variantId/:storeId')
  async getAvailability(
    @Param('variantId') variantId: string,
    @Param('storeId') storeId: string,
  ) {
    return this.inventoryService.getAvailability(variantId, storeId);
  }

  /**
   * List inventory items for seller stores or admin overview.
   */
  @Get()
  @Roles(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async listInventory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListInventoryDto,
  ) {
    return this.inventoryService.listInventory(user.id, user.role, query);
  }

  /**
   * View stock movement history for a specific inventory record.
   */
  @Get(':id/movements')
  @Roles(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getMovements(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.getMovements(id, user.id, user.role);
  }

  /**
   * Transactional stock adjustment (Restock, Damaged, Audit Corrections).
   */
  @Post('adjust')
  @Roles(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async adjustStock(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AdjustStockDto,
  ) {
    return this.inventoryService.adjustStock(user.id, user.role, dto);
  }
}
