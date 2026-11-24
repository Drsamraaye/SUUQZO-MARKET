import { Injectable, UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { JwtPayload, AuthenticatedUser } from '../common/interfaces/request-context.interface.js';
import { UserRole } from '@prisma/client';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class TokenService {
  private readonly jwtSecret: string;
  private readonly jwtIssuer: string = 'suuqzo-mall';
  private readonly jwtAudience: string = 'suuqzo-client';
  private readonly accessTokenTtlSeconds: number = 900; // 15 minutes
  private readonly refreshTokenTtlDays: number = 30; // 30 days

  constructor() {
    this.jwtSecret =
      process.env.JWT_SECRET || 'suuqzo-development-secret-must-be-rotated-in-prod';
  }

  /**
   * Generates a short-lived signed JWT access token.
   */
  generateAccessToken(
    user: AuthenticatedUser,
    activeRole: UserRole,
    sessionId: string,
  ): { token: string; expiresIn: number } {
    const payload: JwtPayload = {
      sub: user.id,
      phone: user.phone,
      email: user.email,
      role: user.role,
      activeRole,
      sessionId,
    };

    const token = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.accessTokenTtlSeconds,
      issuer: this.jwtIssuer,
      audience: this.jwtAudience,
      algorithm: 'HS256',
    });

    return { token, expiresIn: this.accessTokenTtlSeconds };
  }

  /**
   * Verifies and decodes a signed JWT access token.
   */
  verifyAccessToken(token: string): JwtPayload {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: this.jwtIssuer,
        audience: this.jwtAudience,
        algorithms: ['HS256'],
      }) as JwtPayload;

      return decoded;
    } catch (err: unknown) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException('Access token has expired.');
      }
      throw new UnauthorizedException('Invalid or malformed access token.');
    }
  }

  /**
   * Generates a secure, cryptographically random raw refresh token.
   */
  generateRawRefreshToken(): string {
    return crypto.randomBytes(48).toString('hex');
  }

  /**
   * Calculates a SHA-256 hash of a refresh token for storage.
   * Plaintext refresh tokens are never persisted in the database.
   */
  hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Calculates refresh token expiration date.
   */
  getRefreshTokenExpiry(): Date {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + this.refreshTokenTtlDays);
    return expiry;
  }
}
