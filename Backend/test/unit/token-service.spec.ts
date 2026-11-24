import { describe, it, expect, beforeAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TokenService } from '../../src/security/token.service.js';
import jwt from 'jsonwebtoken';

describe('TokenService', () => {
  let service: TokenService;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret-key-for-unit-tests-only';

    const module: TestingModule = await Test.createTestingModule({
      providers: [TokenService],
    }).compile();

    service = module.get<TokenService>(TokenService);
  });

  describe('generateAccessToken()', () => {
    it('should produce a JWT with 3 segments', () => {
      const user: any = {
        id: 'user-123',
        phone: '+1234567890',
        email: null,
        role: 'CUSTOMER',
        assignedRoles: [],
        status: 'ACTIVE',
        isPhoneVerified: true,
        isEmailVerified: false,
        twoFactorEnabled: false,
      };

      const { token, expiresIn } = service.generateAccessToken(user, 'CUSTOMER' as any, 'session-abc');
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
      expect(expiresIn).toBe(900);
    });
  });

  describe('verifyAccessToken()', () => {
    it('should decode a valid token with correct claims', () => {
      const user: any = {
        id: 'user-999',
        phone: '+9876543210',
        email: 'test@test.com',
        role: 'SELLER',
        assignedRoles: [],
        status: 'ACTIVE',
        isPhoneVerified: true,
        isEmailVerified: true,
        twoFactorEnabled: false,
      };

      const { token } = service.generateAccessToken(user, 'SELLER' as any, 'session-xyz');
      const payload = service.verifyAccessToken(token);

      expect(payload.sub).toBe('user-999');
      expect(payload.role).toBe('SELLER');
      expect(payload.sessionId).toBe('session-xyz');
    });

    it('should throw on a tampered token', () => {
      const user: any = {
        id: 'user-1',
        phone: '+1111111111',
        email: null,
        role: 'CUSTOMER',
        assignedRoles: [],
        status: 'ACTIVE',
        isPhoneVerified: true,
        isEmailVerified: false,
        twoFactorEnabled: false,
      };

      const { token } = service.generateAccessToken(user, 'CUSTOMER' as any, 'session-1');
      const tampered = token.slice(0, -5) + 'XXXXX';
      expect(() => service.verifyAccessToken(tampered)).toThrow();
    });

    it('should throw on a token with wrong secret', () => {
      const fakeToken = jwt.sign(
        { sub: 'user-fake', role: 'CUSTOMER', sessionId: 'fake-session' },
        'completely-different-secret',
        { algorithm: 'HS256' },
      );
      expect(() => service.verifyAccessToken(fakeToken)).toThrow();
    });
  });

  describe('hashToken()', () => {
    it('should be deterministic', () => {
      const hash1 = service.hashToken('my-raw-refresh-token');
      const hash2 = service.hashToken('my-raw-refresh-token');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = service.hashToken('token-a');
      const hash2 = service.hashToken('token-b');
      expect(hash1).not.toBe(hash2);
    });

    it('should produce a 64-character hex string (SHA-256)', () => {
      const hash = service.hashToken('any-token');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('generateRawRefreshToken()', () => {
    it('should produce a 96-character hex string (48 bytes)', () => {
      const raw = service.generateRawRefreshToken();
      expect(raw).toMatch(/^[a-f0-9]{96}$/);
    });

    it('should produce unique tokens each time', () => {
      const t1 = service.generateRawRefreshToken();
      const t2 = service.generateRawRefreshToken();
      expect(t1).not.toBe(t2);
    });
  });
});
