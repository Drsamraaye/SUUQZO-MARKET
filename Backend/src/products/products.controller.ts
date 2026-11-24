import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { QueryProductsDto } from './dto/query-products.dto.js';
import { ModerateProductDto } from './dto/moderate-product.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RequirePermissions } from '../common/decorators/permissions.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { PERMISSIONS } from '../authorization/permissions/permission.constants.js';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../common/interfaces/request-context.interface.js';

@Controller('api/v1/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * Public product catalog discovery, search, filter and pagination.
   */
  @Public()
  @Get()
  async getPublicProducts(@Query() query: QueryProductsDto) {
    return this.productsService.queryProducts(query, true);
  }

  /**
   * Admin queries all products across all statuses and stores.
   */
  @Get('admin/all')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_PRODUCTS_VIEW)
  async getAdminProducts(@Query() query: QueryProductsDto) {
    return this.productsService.queryProducts(query, false);
  }

  /**
   * Public lookup by storeSlug and productSlug.
   */
  @Public()
  @Get(':storeSlug/:productSlug')
  async getBySlug(
    @Param('storeSlug') storeSlug: string,
    @Param('productSlug') productSlug: string,
  ) {
    return this.productsService.findBySlug(storeSlug, productSlug);
  }

  /**
   * Public lookup by Product ID.
   */
  @Public()
  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.productsService.findById(id, true);
  }

  /**
   * Create a new product in an owned store.
   */
  @Post()
  @Roles(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async createProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.create(user.id, user.role, dto);
  }

  /**
   * Update product details. Enforces store ownership.
   */
  @Patch(':id')
  @Roles(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateProduct(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(id, user.id, user.role, dto);
  }

  /**
   * Seller submits product for platform moderation.
   */
  @Post(':id/submit-review')
  @Roles(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async submitForReview(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.submitForReview(id, user.id);
  }

  /**
   * Administrative moderation (Approve, Reject, Suspend, Request Changes).
   */
  @Patch(':id/moderate')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_PRODUCTS_APPROVE)
  async moderateProduct(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: ModerateProductDto,
  ) {
    return this.productsService.moderateProduct(id, admin.id, dto);
  }

  /**
   * Archives a product (soft delete).
   */
  @Delete(':id')
  @Roles(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async archiveProduct(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.archive(id, user.id, user.role);
  }
}
