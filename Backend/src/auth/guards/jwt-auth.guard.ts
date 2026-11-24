import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import { TokenService } from '../../security/token.service.js';
import { SessionsService } from '../../sessions/sessions.service.js';
import { UsersService } from '../../users/users.service.js';
import type { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly sessionsService: SessionsService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('No authentication token provided.');
    }

    let payload: ReturnType<TokenService['verifyAccessToken']>;
    try {
      payload = this.tokenService.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    const sessionValid = await this.sessionsService.validateSession(payload.sessionId);
    if (!sessionValid) {
      throw new UnauthorizedException('Session has been revoked or expired.');
    }

    const user = await this.usersService.findForAuth(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User account not found.');
    }

    this.usersService.assertAccountActive(user.status as string);

    // Active role resolution: client request header cannot elevate role
    const requestedActiveRole = (request as any).requestedActiveRole;
    let effectiveActiveRole = payload.activeRole ?? user.role;

    if (requestedActiveRole) {
      const assigned = (user.assignedRoles as string[]) ?? [];
      if (requestedActiveRole === user.role || assigned.includes(requestedActiveRole)) {
        effectiveActiveRole = requestedActiveRole;
      }
    }

    (request as any).user = {
      ...user,
      sessionId: payload.sessionId,
      activeRole: effectiveActiveRole,
    };

    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;
    return authHeader.slice(7);
  }
}
