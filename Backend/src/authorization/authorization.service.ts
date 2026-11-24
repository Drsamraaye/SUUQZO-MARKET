import { Injectable } from '@nestjs/common';
import { Permission } from './permissions/permission.constants.js';

@Injectable()
export class AuthorizationService {
  /**
   * Evaluates whether a user satisfies role requirements.
   * SUPER_ADMIN always bypasses.
   * Checks primary role and assignedRoles array.
   */
  checkRoleAccess(
    userRole: string,
    assignedRoles: string[] = [],
    requiredRoles: string[] = [],
  ): boolean {
    if (!requiredRoles || requiredRoles.length === 0) return true;
    if (userRole === 'SUPER_ADMIN' || assignedRoles.includes('SUPER_ADMIN')) return true;

    return (
      requiredRoles.includes(userRole) ||
      assignedRoles.some((r) => requiredRoles.includes(r))
    );
  }

  /**
   * Evaluates whether an admin satisfies required permissions.
   * SUPER_ADMIN always bypasses all permission checks.
   * Non-admin roles are rejected.
   * All required permissions must be present.
   */
  checkPermissionAccess(
    userRole: string,
    assignedRoles: string[] = [],
    grantedPermissions: string[] = [],
    requiredPermissions: string[] = [],
  ): boolean {
    if (!requiredPermissions || requiredPermissions.length === 0) return true;
    if (userRole === 'SUPER_ADMIN' || assignedRoles.includes('SUPER_ADMIN')) return true;

    const isAdmin = userRole === 'ADMIN' || assignedRoles.includes('ADMIN');
    if (!isAdmin) return false;

    return requiredPermissions.every((p) => grantedPermissions.includes(p));
  }

  /**
   * Validates resource ownership (e.g. customer/seller/rider accessing their own resource).
   * Admins and Super Admins can access across tenants.
   */
  checkOwnership(ownerId: string, currentUserId: string, userRole?: string): boolean {
    if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') return true;
    return ownerId === currentUserId;
  }

  /**
   * Check if a user has a specific role by name.
   */
  hasRole(userRoles: string[], roleName: string): boolean {
    return userRoles.includes(roleName);
  }

  /**
   * Check if a user (admin) has a specific permission.
   * SUPER_ADMIN bypasses all permission checks.
   */
  hasPermission(
    userRole: string,
    permissions: string[],
    requiredPermission: Permission,
  ): boolean {
    if (userRole === 'SUPER_ADMIN') return true;
    return permissions.includes(requiredPermission);
  }

  /**
   * Check multiple permissions (all must pass).
   */
  hasAllPermissions(
    userRole: string,
    permissions: string[],
    required: Permission[],
  ): boolean {
    if (userRole === 'SUPER_ADMIN') return true;
    return required.every((p) => permissions.includes(p));
  }
}
