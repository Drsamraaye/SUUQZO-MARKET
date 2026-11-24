import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Decodes the JWT Bearer token without verification (signature verified by JwtAuthGuard).
 * Attaches partial decoded payload to the request for middleware-layer logging/tracing.
 * Never trusts this for access control — guard layer is authoritative.
 */
@Injectable()
export class AuthenticationContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        // Decode only — no verification. Guards verify.
        const [, payloadB64] = token.split('.');
        if (payloadB64) {
          const decoded = JSON.parse(
            Buffer.from(payloadB64, 'base64url').toString('utf-8'),
          ) as Record<string, unknown>;

          (req as any).authContext = {
            sub: decoded['sub'] ?? null,
            role: decoded['role'] ?? null,
            sessionId: decoded['sessionId'] ?? null,
          };
        }
      } catch {
        // Malformed token — authContext stays undefined; guard will reject it
      }
    }

    next();
  }
}
