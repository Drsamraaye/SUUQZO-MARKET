import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { BrandsService } from './brands.service.js';
import { CreateBrandDto } from './dto/create-brand.dto.js';
import { UpdateBrandDto } from './dto/update-brand.dto.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RequirePermissions } from '../common/decorators/permissions.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { PERMISSIONS } from '../authorization/permissions/permission.constants.js';
import { UserRole } from '@prisma/client';

@Controller('api/v1/brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Public()
  @Get()
  async getBrands() {
    return this.brandsService.findAll();
  }

  @Public()
  @Get(':id')
  async getBrandById(@Param('id') id: string) {
    return this.brandsService.findById(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_PRODUCTS_EDIT)
  async createBrand(@Body() dto: CreateBrandDto) {
    return this.brandsService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_PRODUCTS_EDIT)
  async updateBrand(@Param('id') id: string, @Body() dto: UpdateBrandDto) {
    return this.brandsService.update(id, dto);
  }
}
