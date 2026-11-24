import { UserRole, UserStatus } from '@prisma/client';
import { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  phone: string;
  role: UserRole;
  assignedRoles: UserRole[];
  status: UserStatus;
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  twoFactorEnabled: boolean;
  customerProfileId?: string;
  sellerProfileId?: string;
  riderProfileId?: string;
  adminProfileId?: string;
  permissions?: string[];
}

export interface RequestContext {
  requestId: string;
  ip: string;
  userAgent: string;
  startTime: number;
}

export interface AppRequest extends Request {
  context?: RequestContext;
  user?: AuthenticatedUser;
  activeRole?: UserRole;
  sessionId?: string;
}

export interface JwtPayload {
  sub: string;
  phone: string;
  email?: string | null;
  role: UserRole;
  activeRole: UserRole;
  sessionId: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}
