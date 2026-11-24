import { describe, it, expect, beforeAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PasswordService } from '../../src/security/password.service.js';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PasswordService],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
  });

  describe('hash()', () => {
    it('should produce an argon2id hash string', async () => {
      const hash = await service.hash('MySecureP@ssw0rd!');
      expect(hash).toMatch(/^\$argon2id\$/);
    });

    it('should produce different hashes for the same password (salt randomness)', async () => {
      const hash1 = await service.hash('SameP@ssword1!');
      const hash2 = await service.hash('SameP@ssword1!');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verify()', () => {
    it('should verify a correct password', async () => {
      const hash = await service.hash('CorrectP@ssw0rd!');
      const result = await service.verify(hash, 'CorrectP@ssw0rd!');
      expect(result).toBe(true);
    });

    it('should reject an incorrect password', async () => {
      const hash = await service.hash('CorrectP@ssw0rd!');
      const result = await service.verify(hash, 'WrongPassword1!');
      expect(result).toBe(false);
    });
  });

  describe('validateStrengthOrThrow()', () => {
    it('should accept a strong password', () => {
      expect(() => service.validateStrengthOrThrow('StrongP@ssw0rd!')).not.toThrow();
    });

    it('should reject a password shorter than 8 characters', () => {
      expect(() => service.validateStrengthOrThrow('Ab1!')).toThrow();
    });

    it('should reject a password without uppercase', () => {
      expect(() => service.validateStrengthOrThrow('weakp@ssw0rd!')).toThrow();
    });

    it('should reject a password without a number', () => {
      expect(() => service.validateStrengthOrThrow('WeakPassword!')).toThrow();
    });

    it('should reject a password without a special character', () => {
      expect(() => service.validateStrengthOrThrow('WeakPassword1')).toThrow();
    });
  });
});
