import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { QueryOrdersDto } from './dto/query-orders.dto.js';
import { CancelOrderDto } from './dto/cancel-order.dto.js';
import { UpdateSubOrderStatusDto } from './dto/update-suborder-status.dto.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RequirePermissions } from '../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../authorization/permissions/permission.constants.js';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../common/interfaces/request-context.interface.js';

// ============================================================================
// CUSTOMER ORDER ENDPOINTS  — /api/v1/orders
// ============================================================================
@Controller('api/v1/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Customer: list own orders (paginated, filterable by status).
   * GET /api/v1/orders
   */
  @Get()
  @Roles(UserRole.CUSTOMER)
  async listMyOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryOrdersDto,
  ) {
    return this.ordersService.findCustomerOrders(user.id, query);
  }

  /**
   * Customer: get a single order with full detail.
   * GET /api/v1/orders/:id
   */
  @Get(':id')
  @Roles(UserRole.CUSTOMER)
  async getMyOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.ordersService.findCustomerOrderById(user.id, id);
  }

  /**
   * Customer: request cancellation of an eligible order.
   * POST /api/v1/orders/:id/cancel
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.CUSTOMER)
  async cancelMyOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancelCustomerOrder(user.id, id, dto);
  }

  /**
   * Customer: live tracking — suborder statuses per store.
   * GET /api/v1/orders/:id/tracking
   */
  @Get(':id/tracking')
  @Roles(UserRole.CUSTOMER)
  async trackMyOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.ordersService.getCustomerOrderTracking(user.id, id);
  }
}

// ============================================================================
// SELLER SUBORDER ENDPOINTS  — /api/v1/seller/orders
// ============================================================================
@Controller('api/v1/seller/orders')
export class SellerOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Seller: list suborders for all their stores (paginated).
   * GET /api/v1/seller/orders
   */
  @Get()
  @Roles(UserRole.SELLER)
  async listMySuborders(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryOrdersDto,
  ) {
    return this.ordersService.findSellerSuborders(user.id, query);
  }

  /**
   * Seller: get a single suborder (must belong to their store).
   * GET /api/v1/seller/orders/:id
   */
  @Get(':id')
  @Roles(UserRole.SELLER)
  async getMySuborder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.ordersService.findSellerSuborderById(user.id, id);
  }

  /**
   * Seller: advance a suborder through its lifecycle.
   * PATCH /api/v1/seller/orders/:id/status
   */
  @Patch(':id/status')
  @Roles(UserRole.SELLER)
  async updateSuborderStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSubOrderStatusDto,
  ) {
    return this.ordersService.updateSellerSuborderStatus(user.id, id, dto);
  }

  /**
   * Seller: reject / cancel an incoming suborder.
   * POST /api/v1/seller/orders/:id/reject
   */
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SELLER)
  async rejectSuborder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.rejectSellerSuborder(user.id, id, dto);
  }
}

// ============================================================================
// ADMIN ORDER ENDPOINTS  — /api/v1/admin/orders
// ============================================================================
@Controller('api/v1/admin/orders')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Admin: list all orders across all customers and stores.
   * GET /api/v1/admin/orders
   */
  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_ORDERS_VIEW)
  async listAllOrders(@Query() query: QueryOrdersDto) {
    return this.ordersService.adminFindAllOrders(query);
  }

  /**
   * Admin: get a single order with full audit detail.
   * GET /api/v1/admin/orders/:id
   */
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_ORDERS_VIEW)
  async getOrder(@Param('id') id: string) {
    return this.ordersService.adminFindOrderById(id);
  }

  /**
   * Admin: update parent order status (e.g. confirm payment manually).
   * PATCH /api/v1/admin/orders/:id/status
   */
  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_ORDERS_MANAGE)
  async updateOrderStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.adminUpdateOrderStatus(user.id, id, dto);
  }

  /**
   * Admin: cancel any order and release all inventory reservations.
   * POST /api/v1/admin/orders/:id/cancel
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_ORDERS_MANAGE)
  async cancelOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.adminCancelOrder(user.id, id, dto);
  }
}
