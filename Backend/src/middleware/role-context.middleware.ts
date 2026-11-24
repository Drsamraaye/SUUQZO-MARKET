import { Injectable, NestMiddleware, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

// Clients may ONLY switch between non-administrative tenant roles: CUSTOMER, SELLER, RIDER.
// Clients are strictly forbidden from assuming administrative roles via request headers.
const ALLOWED_CLIENT_ROLES = ['CUSTOMER', 'SELLER', 'RIDER'];
const FORBIDDEN_ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

/**
 * Validates and sanitizes the x-active-role request header.
 * CRITICAL SECURITY CONTROLS:
 * - NEVER trusts client-provided role headers for authentication or privilege assignment.
 * - Explicitly rejects any request attempting to assume ADMIN or SUPER_ADMIN roles via headers.
 * - Stored requestedActiveRole is subsequently verified against DB-backed user.assignedRoles in JwtAuthGuard.
 */
@Injectable()
export class RoleContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const rawHeader = req.headers['x-active-role'];

    if (!rawHeader) {
      next();
      return;
    }

    const requestedRole = (Array.isArray(rawHeader) ? rawHeader[0] : rawHeader)
      .trim()
      .toUpperCase();

    // Security Hardening: Immediately reject elevation to administrative roles
    if (FORBIDDEN_ADMIN_ROLES.includes(requestedRole)) {
      throw new ForbiddenException('Administrative roles cannot be assumed via request headers.');
    }

    // Allowlist validation for client roles
    if (!ALLOWED_CLIENT_ROLES.includes(requestedRole)) {
      throw new BadRequestException(`Invalid role in x-active-role header.`);
    }

    // Store sanitized preference — JwtAuthGuard verifies against user.assignedRoles
    (req as any).requestedActiveRole = requestedRole;

    next();
  }
}
