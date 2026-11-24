import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { SellersService } from './sellers.service.js';
import { SubmitSellerApplicationDto } from './dto/submit-seller-application.dto.js';
import { SubmitKycDocumentDto } from './dto/submit-kyc-document.dto.js';
import { ReviewSellerApplicationDto } from './dto/review-seller-application.dto.js';
import { ReviewKycDocumentDto } from './dto/review-kyc-document.dto.js';
import { ListApplicationsDto } from './dto/list-applications.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RequirePermissions } from '../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../authorization/permissions/permission.constants.js';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../common/interfaces/request-context.interface.js';

@Controller('api/v1/sellers')
export class SellersController {
  constructor(private readonly sellersService: SellersService) {}

  /**
   * Submit or update a seller onboarding application.
   */
  @Post('apply')
  async apply(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitSellerApplicationDto,
  ) {
    return this.sellersService.submitApplication(user.id, dto);
  }

  /**
   * Retrieve current user's seller application and KYC status.
   */
  @Get('me')
  async getMyApplication(@CurrentUser() user: AuthenticatedUser) {
    return this.sellersService.getMyApplication(user.id);
  }

  /**
   * Upload a KYC verification document.
   */
  @Post('kyc-documents')
  async uploadKycDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitKycDocumentDto,
  ) {
    return this.sellersService.uploadKycDocument(user.id, dto);
  }

  /**
   * Admin lists seller onboarding applications.
   */
  @Get('applications')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_SELLERS_VIEW)
  async listApplications(@Query() query: ListApplicationsDto) {
    return this.sellersService.listApplications(query);
  }

  /**
   * Admin retrieves a specific application details.
   */
  @Get('applications/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_SELLERS_VIEW)
  async getApplicationById(@Param('id') id: string) {
    return this.sellersService.getApplicationById(id);
  }

  /**
   * Admin reviews seller application (Approve, Reject, Suspend).
   */
  @Patch('applications/:id/review')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_SELLERS_APPROVE)
  async reviewApplication(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: ReviewSellerApplicationDto,
  ) {
    return this.sellersService.reviewApplication(id, admin.id, dto);
  }

  /**
   * Admin reviews a specific KYC document.
   */
  @Patch('kyc-documents/:id/review')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_SELLERS_REVIEW)
  async reviewKycDocument(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: ReviewKycDocumentDto,
  ) {
    return this.sellersService.reviewKycDocument(id, admin.id, dto);
  }

  /**
   * Retrieves KYC documents for a seller.
   * Access: Owner seller or Admin.
   */
  @Get(':id/documents')
  async getSellerDocuments(
    @Param('id') sellerId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sellersService.getSellerDocuments(sellerId, user.id, user.role);
  }
}
