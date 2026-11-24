import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { StoresService } from './stores.service.js';
import { CreateStoreDto } from './dto/create-store.dto.js';
import { UpdateStoreDto } from './dto/update-store.dto.js';
import { AdminReviewStoreDto } from './dto/admin-review-store.dto.js';
import { ListStoresDto } from './dto/list-stores.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RequirePermissions } from '../common/decorators/permissions.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { PERMISSIONS } from '../authorization/permissions/permission.constants.js';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../common/interfaces/request-context.interface.js';

@Controller('api/v1/stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  /**
   * Public store catalog listing (only active stores).
   */
  @Public()
  @Get()
  async listPublicStores(@Query() query: ListStoresDto) {
    return this.storesService.listStores(query, true);
  }

  /**
   * Current seller lists their own stores.
   */
  @Get('seller/my-stores')
  async listMyStores(@CurrentUser() user: AuthenticatedUser) {
    return this.storesService.listMyStores(user.id);
  }

  /**
   * Admin lists all stores across all statuses.
   */
  @Get('admin/all')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_STORES_VIEW)
  async adminListStores(@Query() query: ListStoresDto) {
    return this.storesService.listStores(query, false);
  }

  /**
   * Public lookup by unique URL slug.
   */
  @Public()
  @Get('slug/:slug')
  async getBySlug(@Param('slug') slug: string) {
    return this.storesService.getBySlug(slug);
  }

  /**
   * Store details by ID.
   */
  @Public()
  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.storesService.getById(id);
  }

  /**
   * Create a new store for an approved seller.
   */
  @Post()
  @Roles(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async createStore(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStoreDto,
  ) {
    return this.storesService.createStore(user.id, dto);
  }

  /**
   * Update store details (enforces seller ownership).
   */
  @Patch(':id')
  async updateStore(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.storesService.updateStore(id, user.id, user.role, dto);
  }

  /**
   * Admin reviews store, controls status (ACTIVE / SUSPENDED), and features store.
   */
  @Patch(':id/admin-review')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_STORES_APPROVE)
  async adminReviewStore(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: AdminReviewStoreDto,
  ) {
    return this.storesService.adminReviewStore(id, admin.id, dto);
  }
}
