import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../src/authorization/guards/roles.guard.js';
import { PermissionsGuard } from '../../src/authorization/guards/permissions.guard.js';
import { AuthorizationService } from '../../src/authorization/authorization.service.js';
import { RoleContextMiddleware } from '../../src/middleware/role-context.middleware.js';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator.js';
import { PERMISSIONS_KEY } from '../../src/common/decorators/permissions.decorator.js';
import { IS_PUBLIC_KEY } from '../../src/common/decorators/public.decorator.js';
import { PrismaService } from '../../src/database/prisma.service.js';

function makeContext(user: any, isPublic = false): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RBAC, Permissions and Resource Ownership Suite', () => {
  let rolesGuard: RolesGuard;
  let permissionsGuard: PermissionsGuard;
  let authService: AuthorizationService;
  let reflector: Reflector;

  const mockPrisma = {
    adminProfile: {
      findUnique: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        PermissionsGuard,
        AuthorizationService,
        Reflector,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    rolesGuard = module.get<RolesGuard>(RolesGuard);
    permissionsGuard = module.get<PermissionsGuard>(PermissionsGuard);
    authService = module.get<AuthorizationService>(AuthorizationService);
    reflector = module.get<Reflector>(Reflector);
  });

  // ─────────────────────────────────────────────
  // 1. ROLES GUARD TESTS
  // ─────────────────────────────────────────────
  describe('RolesGuard', () => {
    it('should allow access when route is @Public()', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) =>
        key === IS_PUBLIC_KEY ? true : undefined,
      );
      expect(rolesGuard.canActivate(makeContext({ role: 'CUSTOMER', assignedRoles: ['CUSTOMER'] }))).toBe(true);
    });

    it('should allow CUSTOMER to access a CUSTOMER-only route', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === ROLES_KEY) return ['CUSTOMER'];
      });
      expect(rolesGuard.canActivate(makeContext({ role: 'CUSTOMER', assignedRoles: ['CUSTOMER'] }))).toBe(true);
    });

    it('should block CUSTOMER from a SELLER-only route', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === ROLES_KEY) return ['SELLER'];
      });
      expect(() =>
        rolesGuard.canActivate(makeContext({ role: 'CUSTOMER', assignedRoles: ['CUSTOMER'] })),
      ).toThrow(ForbiddenException);
    });

    it('should block ADMIN from a SUPER_ADMIN-only route', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === ROLES_KEY) return ['SUPER_ADMIN'];
      });
      expect(() =>
        rolesGuard.canActivate(makeContext({ role: 'ADMIN', assignedRoles: ['ADMIN'] })),
      ).toThrow(ForbiddenException);
    });

    it('should allow SUPER_ADMIN through any role gate', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === ROLES_KEY) return ['SELLER'];
      });
      expect(rolesGuard.canActivate(makeContext({ role: 'SUPER_ADMIN', assignedRoles: ['SUPER_ADMIN'] }))).toBe(true);
    });

    it('should deny access when user is not present (deny-by-default)', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === ROLES_KEY) return ['CUSTOMER'];
      });
      expect(rolesGuard.canActivate(makeContext(null))).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // 2. PERMISSIONS GUARD TESTS
  // ─────────────────────────────────────────────
  describe('PermissionsGuard', () => {
    it('should allow ADMIN with all required permissions', async () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === PERMISSIONS_KEY) return ['admin.users.view', 'admin.users.edit'];
      });

      mockPrisma.adminProfile.findUnique.mockResolvedValue({
        permissions: ['admin.users.view', 'admin.users.edit', 'admin.sellers.view'],
      });

      const result = await permissionsGuard.canActivate(
        makeContext({ id: 'admin-1', role: 'ADMIN', assignedRoles: ['ADMIN'] }),
      );
      expect(result).toBe(true);
    });

    it('should block ADMIN missing one of multiple required permissions', async () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === PERMISSIONS_KEY) return ['admin.users.view', 'admin.orders.refund'];
      });

      mockPrisma.adminProfile.findUnique.mockResolvedValue({
        permissions: ['admin.users.view'], // Missing admin.orders.refund
      });

      await expect(
        permissionsGuard.canActivate(
          makeContext({ id: 'admin-1', role: 'ADMIN', assignedRoles: ['ADMIN'] }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject non-admin users attempting permission-guarded routes', async () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === PERMISSIONS_KEY) return ['admin.users.view'];
      });

      await expect(
        permissionsGuard.canActivate(
          makeContext({ id: 'cust-1', role: 'CUSTOMER', assignedRoles: ['CUSTOMER'] }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('SUPER_ADMIN should bypass all permissions checks without DB query', async () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === PERMISSIONS_KEY) return ['admin.super_secret.action'];
      });

      const result = await permissionsGuard.canActivate(
        makeContext({ id: 'sa-1', role: 'SUPER_ADMIN', assignedRoles: ['SUPER_ADMIN'] }),
      );
      expect(result).toBe(true);
      expect(mockPrisma.adminProfile.findUnique).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // 3. RESOURCE OWNERSHIP ISOLATION TESTS
  // ─────────────────────────────────────────────
  describe('Resource Ownership Isolation', () => {
    it('CUSTOMER A cannot access CUSTOMER B private records', () => {
      const customerAId = 'customer-a-uuid';
      const customerBId = 'customer-b-uuid';

      expect(authService.checkOwnership(customerAId, customerBId, 'CUSTOMER')).toBe(false);
      expect(authService.checkOwnership(customerAId, customerAId, 'CUSTOMER')).toBe(true);
    });

    it('SELLER A cannot access SELLER B products or financial records', () => {
      const sellerAId = 'seller-a-uuid';
      const sellerBId = 'seller-b-uuid';

      expect(authService.checkOwnership(sellerAId, sellerBId, 'SELLER')).toBe(false);
      expect(authService.checkOwnership(sellerAId, sellerAId, 'SELLER')).toBe(true);
    });

    it('RIDER A cannot access delivery assignments of RIDER B', () => {
      const riderAId = 'rider-a-uuid';
      const riderBId = 'rider-b-uuid';

      expect(authService.checkOwnership(riderAId, riderBId, 'RIDER')).toBe(false);
      expect(authService.checkOwnership(riderAId, riderAId, 'RIDER')).toBe(true);
    });

    it('ADMIN and SUPER_ADMIN have multi-tenant cross-account inspection access', () => {
      const targetUserId = 'target-user-uuid';
      const adminUserId = 'admin-user-uuid';

      expect(authService.checkOwnership(targetUserId, adminUserId, 'ADMIN')).toBe(true);
      expect(authService.checkOwnership(targetUserId, adminUserId, 'SUPER_ADMIN')).toBe(true);
    });
  });

  // ─────────────────────────────────────────────
  // 4. CRITICAL ROLE HEADER FORGERY TESTS
  // ─────────────────────────────────────────────
  describe('Role Context Middleware Hardening', () => {
    const middleware = new RoleContextMiddleware();

    it('should strictly reject header specifying ADMIN role', () => {
      const req: any = { headers: { 'x-active-role': 'ADMIN' } };
      expect(() => middleware.use(req, {} as any, () => {})).toThrow(ForbiddenException);
    });

    it('should strictly reject header specifying SUPER_ADMIN role', () => {
      const req: any = { headers: { 'x-active-role': 'SUPER_ADMIN' } };
      expect(() => middleware.use(req, {} as any, () => {})).toThrow(ForbiddenException);
    });

    it('should reject unknown arbitrary role names', () => {
      const req: any = { headers: { 'x-active-role': 'MANAGER' } };
      expect(() => middleware.use(req, {} as any, () => {})).toThrow(BadRequestException);
    });

    it('should permit allowed tenant roles (SELLER, RIDER, CUSTOMER)', () => {
      const req: any = { headers: { 'x-active-role': 'SELLER' } };
      middleware.use(req, {} as any, () => {});
      expect(req.requestedActiveRole).toBe('SELLER');
    });
  });
});
