import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators/roles.decorator.js';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import { AuthorizationService } from '../authorization.service.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService = new AuthorizationService(),
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;

    const hasAccess = this.authorizationService.checkRoleAccess(
      user.role,
      user.assignedRoles ?? [],
      requiredRoles,
    );

    if (!hasAccess) {
      throw new ForbiddenException('Insufficient role for this action.');
    }

    return true;
  }
}
