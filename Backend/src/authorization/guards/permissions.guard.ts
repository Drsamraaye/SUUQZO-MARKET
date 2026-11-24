import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator.js';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuthorizationService } from '../authorization.service.js';
import { Permission } from '../permissions/permission.constants.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService = new AuthorizationService(),
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;

    // Fast path: SUPER_ADMIN bypasses without querying DB
    if (user.role === 'SUPER_ADMIN' || (user.assignedRoles ?? []).includes('SUPER_ADMIN')) {
      return true;
    }

    // Load admin profile permissions from DB
    const adminProfile = await this.prisma.adminProfile.findUnique({
      where: { userId: user.id },
      select: { permissions: true },
    });

    const grantedPermissions: string[] = (adminProfile?.permissions as string[]) ?? [];

    const hasAccess = this.authorizationService.checkPermissionAccess(
      user.role,
      user.assignedRoles ?? [],
      grantedPermissions,
      requiredPermissions as Permission[],
    );

    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions for this action.');
    }

    return true;
  }
}
