import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { ListUsersDto } from './dto/list-users.dto.js';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto.js';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';
import { AssignUserRoleDto } from './dto/assign-user-role.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RequirePermissions } from '../common/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../authorization/permissions/permission.constants.js';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../common/interfaces/request-context.interface.js';

@Controller('api/v1/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Lists users with pagination, multi-field search, and status/role filtering.
   * Access: ADMIN, SUPER_ADMIN with admin.users.view permission.
   */
  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_USERS_VIEW)
  async listUsers(@Query() query: ListUsersDto) {
    return this.usersService.listUsers(query);
  }

  /**
   * Returns a user profile.
   * Access: Self user or ADMIN / SUPER_ADMIN.
   */
  @Get(':id')
  async getUserProfile(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const isSelf = user.id === id;
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;

    if (!isSelf && !isAdmin) {
      throw new ForbiddenException('Access denied. You can only view your own user profile.');
    }

    return this.usersService.findProfileById(id);
  }

  /**
   * Updates allowed profile attributes.
   * Access: Self user or ADMIN / SUPER_ADMIN.
   */
  @Patch(':id')
  async updateProfile(
    @Param('id') id: string,
    @Body() dto: UpdateUserProfileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.updateProfile(id, user.id, user.role, dto);
  }

  /**
   * Updates account status (ACTIVE, SUSPENDED, BANNED, DEACTIVATED).
   * Access: ADMIN, SUPER_ADMIN with admin.users.suspend permission.
   */
  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_USERS_SUSPEND)
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.updateStatus(id, user.id, user.role, dto);
  }

  /**
   * Manages user role assignments.
   * Access: Strictly SUPER_ADMIN with admin.users.roles permission.
   */
  @Post(':id/roles')
  @Roles(UserRole.SUPER_ADMIN)
  @RequirePermissions(PERMISSIONS.ADMIN_USERS_ROLES)
  async assignRole(
    @Param('id') id: string,
    @Body() dto: AssignUserRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.assignRole(id, user.id, user.role, dto);
  }

  /**
   * Retrieves audit trail for a user account.
   * Access: Self user or ADMIN / SUPER_ADMIN.
   */
  @Get(':id/audit')
  async getAuditHistory(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.getUserAuditHistory(id, user.id, user.role);
  }
}
