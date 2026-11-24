import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { TokenService } from '../../security/token.service.js';
import { SessionsService } from '../../sessions/sessions.service.js';
import { UsersService } from '../../users/users.service.js';
import type { Request } from 'express';

/**
 * Optional authentication guard for public endpoints that can optionally personalize
 * responses when a valid authentication token is provided (e.g. public product catalogue,
 * anonymous checkout session merging). Never throws UnauthorizedException.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly sessionsService: SessionsService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);
    if (!token) return true;

    try {
      const payload = this.tokenService.verifyAccessToken(token);
      const sessionValid = await this.sessionsService.validateSession(payload.sessionId);
      if (!sessionValid) return true;

      const user = await this.usersService.findForAuth(payload.sub);

      if (user && !['SUSPENDED', 'BANNED', 'DEACTIVATED'].includes(user.status as string)) {
        (request as any).user = {
          ...user,
          sessionId: payload.sessionId,
          activeRole: payload.activeRole ?? user.role,
        };
      }
    } catch {
      // Silently ignore — optional guard permits unauthenticated browsing
    }

    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;
    return authHeader.slice(7);
  }
}
