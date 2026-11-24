import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AccountSuspendedException } from '../common/exceptions/security.exception.js';
import { ListUsersDto } from './dto/list-users.dto.js';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto.js';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';
import { AssignUserRoleDto } from './dto/assign-user-role.dto.js';
import { UserRole, UserStatus } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Loads minimal user auth context for JwtAuthGuard validation.
   */
  async findForAuth(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        email: true,
        role: true,
        status: true,
        isPhoneVerified: true,
        isEmailVerified: true,
        twoFactorEnabled: true,
        assignedRoles: true,
      },
    });
  }

  /**
   * Loads complete safe user profile including associated domain profiles.
   */
  async findProfileById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        email: true,
        role: true,
        status: true,
        isPhoneVerified: true,
        isEmailVerified: true,
        twoFactorEnabled: true,
        assignedRoles: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        customerProfile: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            preferredLanguage: true,
            preferredCurrency: true,
            loyaltyPoints: true,
            totalSpent: true,
            totalOrdersCount: true,
          },
        },
        sellerProfile: {
          select: {
            id: true,
            businessName: true,
            verificationStatus: true,
            rating: true,
          },
        },
        riderProfile: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            status: true,
            verificationStatus: true,
          },
        },
        adminProfile: {
          select: {
            id: true,
            fullName: true,
            department: true,
            permissions: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found.`);
    }

    return user;
  }

  /**
   * Finds user by phone or email including credentials for login verification.
   */
  async findByIdentifier(identifier: string) {
    const byPhone = await this.prisma.user.findUnique({ where: { phone: identifier } });
    if (byPhone) return byPhone;
    return this.prisma.user.findUnique({ where: { email: identifier } });
  }

  async findByPhone(phone: string) {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string) {
    return this.findProfileById(id);
  }

  /**
   * Validates account status and throws AccountSuspendedException if restricted.
   */
  assertAccountActive(status: string): void {
    if (['SUSPENDED', 'BANNED', 'DEACTIVATED'].includes(status)) {
      throw new AccountSuspendedException(`Account is ${status.toLowerCase()}.`);
    }
  }

  /**
   * Paginated user list with multi-field search and role/status filtering.
   * Restricted to administrative roles.
   */
  async listUsers(dto: ListUsersDto) {
    const page = Math.max(1, dto.page || 1);
    const limit = Math.min(100, Math.max(1, dto.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (dto.status) {
      where.status = dto.status;
    }

    if (dto.role) {
      where.OR = [
        { role: dto.role },
        { assignedRoles: { has: dto.role } },
      ];
    }

    if (dto.search && dto.search.trim()) {
      const q = dto.search.trim();
      const searchConditions = [
        { phone: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { customerProfile: { firstName: { contains: q, mode: 'insensitive' } } },
        { customerProfile: { lastName: { contains: q, mode: 'insensitive' } } },
        { sellerProfile: { businessName: { contains: q, mode: 'insensitive' } } },
      ];

      if (where.OR) {
        where.AND = [
          { OR: where.OR },
          { OR: searchConditions },
        ];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
    }

    const [total, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          phone: true,
          email: true,
          role: true,
          status: true,
          assignedRoles: true,
          isPhoneVerified: true,
          isEmailVerified: true,
          createdAt: true,
          customerProfile: {
            select: {
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
          sellerProfile: {
            select: {
              businessName: true,
              verificationStatus: true,
            },
          },
        },
      }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Updates permitted user profile fields.
   * Standard users can only update their own profile; admins can update any profile.
   */
  async updateProfile(
    targetUserId: string,
    actorId: string,
    actorRole: string,
    dto: UpdateUserProfileDto,
  ) {
    const isSelf = targetUserId === actorId;
    const isAdmin = actorRole === UserRole.ADMIN || actorRole === UserRole.SUPER_ADMIN;

    if (!isSelf && !isAdmin) {
      throw new ForbiddenException('You do not have permission to update this profile.');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: { customerProfile: true },
    });

    if (!targetUser) {
      throw new NotFoundException(`User with ID "${targetUserId}" not found.`);
    }

    // Check email uniqueness if email is changed
    if (dto.email && dto.email !== targetUser.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing && existing.id !== targetUserId) {
        throw new ConflictException('Email address is already in use by another account.');
      }
    }

    const oldValues = {
      email: targetUser.email,
      customerProfile: targetUser.customerProfile
        ? {
            firstName: targetUser.customerProfile.firstName,
            lastName: targetUser.customerProfile.lastName,
            avatarUrl: targetUser.customerProfile.avatarUrl,
            preferredLanguage: targetUser.customerProfile.preferredLanguage,
            preferredCurrency: targetUser.customerProfile.preferredCurrency,
          }
        : null,
    };

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      // Update email on user record if supplied
      if (dto.email !== undefined) {
        await tx.user.update({
          where: { id: targetUserId },
          data: { email: dto.email },
        });
      }

      // Upsert CustomerProfile
      if (
        dto.firstName !== undefined ||
        dto.lastName !== undefined ||
        dto.avatarUrl !== undefined ||
        dto.preferredLanguage !== undefined ||
        dto.preferredCurrency !== undefined
      ) {
        if (targetUser.customerProfile) {
          await tx.customerProfile.update({
            where: { userId: targetUserId },
            data: {
              ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
              ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
              ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
              ...(dto.preferredLanguage !== undefined ? { preferredLanguage: dto.preferredLanguage } : {}),
              ...(dto.preferredCurrency !== undefined ? { preferredCurrency: dto.preferredCurrency } : {}),
            },
          });
        } else {
          await tx.customerProfile.create({
            data: {
              userId: targetUserId,
              firstName: dto.firstName || 'User',
              lastName: dto.lastName || '',
              avatarUrl: dto.avatarUrl,
              preferredLanguage: dto.preferredLanguage || 'so',
              preferredCurrency: dto.preferredCurrency || 'USD',
            },
          });
        }
      }

      return tx.user.findUnique({
        where: { id: targetUserId },
        select: {
          id: true,
          email: true,
          phone: true,
          role: true,
          customerProfile: true,
        },
      });
    }, { timeout: 30000, maxWait: 10000 });

    // Record audit log
    await this.auditLogsService.log({
      userId: actorId,
      action: 'USER_PROFILE_UPDATED',
      entityName: 'User',
      entityId: targetUserId,
      oldValues,
      newValues: dto,
    });

    return updatedUser;
  }

  /**
   * Modifies account status (ACTIVE, SUSPENDED, BANNED, DEACTIVATED).
   * Strict security checks:
   * 1. Self-status modification is forbidden.
   * 2. Only SUPER_ADMIN can suspend or ban another SUPER_ADMIN or ADMIN.
   * 3. Sessions and tokens are immediately revoked when suspended/banned.
   */
  async updateStatus(
    targetUserId: string,
    actorId: string,
    actorRole: string,
    dto: UpdateUserStatusDto,
  ) {
    if (targetUserId === actorId) {
      throw new BadRequestException('Administrators cannot modify their own account status.');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundException(`User with ID "${targetUserId}" not found.`);
    }

    // Protection of privileged accounts
    if (targetUser.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('SUPER_ADMIN accounts cannot be suspended or banned.');
    }

    if (targetUser.role === UserRole.ADMIN && actorRole !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only a SUPER_ADMIN can modify the status of an ADMIN account.');
    }

    const oldStatus = targetUser.status;

    await this.prisma.$transaction(async (tx) => {
      // 1. Update status
      await tx.user.update({
        where: { id: targetUserId },
        data: { status: dto.status },
      });

      // 2. Revoke sessions & refresh tokens if restricting account
      if (([UserStatus.SUSPENDED, UserStatus.BANNED, UserStatus.DEACTIVATED] as UserStatus[]).includes(dto.status)) {
        await tx.userSession.updateMany({
          where: { userId: targetUserId, isRevoked: false },
          data: { isRevoked: true },
        });

        await tx.refreshToken.updateMany({
          where: { userId: targetUserId, isRevoked: false },
          data: { isRevoked: true },
        });
      }
    }, { timeout: 30000, maxWait: 10000 });

    // 3. Create AuditLog
    await this.auditLogsService.log({
      userId: actorId,
      action: `USER_STATUS_${dto.status}`,
      entityName: 'User',
      entityId: targetUserId,
      oldValues: { status: oldStatus },
      newValues: { status: dto.status, reason: dto.reason },
    });

    // 4. Send notification
    await this.notificationsService.send({
      userId: targetUserId,
      title: `Account Status Changed`,
      body: `Your account status has been updated to ${dto.status}. Reason: ${dto.reason}`,
      data: { status: dto.status, reason: dto.reason },
    });

    return {
      userId: targetUserId,
      previousStatus: oldStatus,
      newStatus: dto.status,
      reason: dto.reason,
    };
  }

  /**
   * Assigns or revokes roles from a user.
   * Strict RBAC rules:
   * 1. Self-role modification is completely forbidden.
   * 2. Only SUPER_ADMIN can assign or revoke ADMIN / SUPER_ADMIN roles.
   * 3. Users cannot have an empty role set.
   */
  async assignRole(
    targetUserId: string,
    actorId: string,
    actorRole: string,
    dto: AssignUserRoleDto,
  ) {
    if (targetUserId === actorId) {
      throw new BadRequestException('Users cannot modify their own roles.');
    }

    const isPrivilegedRole = dto.role === UserRole.ADMIN || dto.role === UserRole.SUPER_ADMIN;
    if (isPrivilegedRole && actorRole !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only a SUPER_ADMIN can assign or revoke administrative roles.');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundException(`User with ID "${targetUserId}" not found.`);
    }

    let currentRoles = targetUser.assignedRoles || [];
    if (!currentRoles.includes(targetUser.role)) {
      currentRoles = [targetUser.role, ...currentRoles];
    }
    const currentRolesSet = new Set(currentRoles);

    if (dto.action === 'ADD') {
      currentRolesSet.add(dto.role);
    } else if (dto.action === 'REMOVE') {
      if (currentRolesSet.size <= 1 && currentRolesSet.has(dto.role)) {
        throw new BadRequestException('Cannot remove the only remaining role from a user.');
      }
      currentRolesSet.delete(dto.role);
    }

    const updatedRoles = Array.from(currentRolesSet);
    const primaryRole = updatedRoles.includes(targetUser.role)
      ? targetUser.role
      : updatedRoles[0];

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        role: primaryRole,
        assignedRoles: updatedRoles,
      },
      select: {
        id: true,
        phone: true,
        email: true,
        role: true,
        assignedRoles: true,
      },
    });

    // Record audit log
    await this.auditLogsService.log({
      userId: actorId,
      action: `USER_ROLE_${dto.action}`,
      entityName: 'User',
      entityId: targetUserId,
      oldValues: { role: targetUser.role, assignedRoles: targetUser.assignedRoles },
      newValues: { role: primaryRole, assignedRoles: updatedRoles, changedRole: dto.role, action: dto.action },
    });

    // Send notification
    await this.notificationsService.send({
      userId: targetUserId,
      title: 'Role Assignment Updated',
      body: `Your account roles have been updated: ${dto.action} ${dto.role}.`,
      data: { updatedRoles },
    });

    return updated;
  }

  /**
   * Retrieves audit trail for a user.
   */
  async getUserAuditHistory(targetUserId: string, actorId: string, actorRole: string) {
    const isSelf = targetUserId === actorId;
    const isAdmin = actorRole === UserRole.ADMIN || actorRole === UserRole.SUPER_ADMIN;

    if (!isSelf && !isAdmin) {
      throw new ForbiddenException('You do not have permission to view this audit history.');
    }

    return this.auditLogsService.findByUser(targetUserId);
  }
}
