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
import { CategoriesService } from './categories.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { ListCategoriesDto } from './dto/list-categories.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RequirePermissions } from '../common/decorators/permissions.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { PERMISSIONS } from '../authorization/permissions/permission.constants.js';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../common/interfaces/request-context.interface.js';

@Controller('api/v1/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  /**
   * Public active categories listing (flat or nested tree).
   */
  @Public()
  @Get()
  async getPublicCategories(@Query() query: ListCategoriesDto) {
    return this.categoriesService.findAll(query, true);
  }

  /**
   * Admin lists all categories across active/inactive states.
   */
  @Get('admin/all')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_CATEGORIES_MANAGE)
  async getAdminCategories(@Query() query: ListCategoriesDto) {
    return this.categoriesService.findAll(query, false);
  }

  /**
   * Public lookup by category slug.
   */
  @Public()
  @Get('slug/:slug')
  async getBySlug(@Param('slug') slug: string) {
    return this.categoriesService.findBySlug(slug);
  }

  /**
   * Lookup category by ID.
   */
  @Public()
  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.categoriesService.findById(id);
  }

  /**
   * Admin creates a new category.
   */
  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_CATEGORIES_MANAGE)
  async createCategory(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoriesService.create(dto, admin.id);
  }

  /**
   * Admin updates a category.
   */
  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_CATEGORIES_MANAGE)
  async updateCategory(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, dto, admin.id);
  }

  /**
   * Admin deletes an empty category.
   */
  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_CATEGORIES_MANAGE)
  async deleteCategory(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.categoriesService.delete(id, admin.id);
  }
}
