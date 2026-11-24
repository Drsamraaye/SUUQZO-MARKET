import { Injectable, BadRequestException } from '@nestjs/common';
import argon2 from 'argon2';

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

@Injectable()
export class PasswordService {
  /**
   * Hashes a plaintext password using Argon2id with memory-hard parameters.
   * Note: validateStrengthOrThrow is NOT called here — callers must call it separately
   * before hashing to avoid double-throwing in contexts where hash() is used for
   * dummy-time-burning (e.g. timing attack mitigation on login failure).
   */
  async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
    });
  }

  /**
   * Verifies a plaintext password against an Argon2id hash.
   */
  async verify(hash: string, plaintext: string): Promise<boolean> {
    if (!hash || !plaintext) return false;
    try {
      return await argon2.verify(hash, plaintext);
    } catch {
      return false;
    }
  }

  /**
   * Validates password strength policy:
   * - Minimum 8 characters
   * - At least 1 uppercase letter
   * - At least 1 lowercase letter
   * - At least 1 number
   * - At least 1 special character
   */
  validateStrength(password: string): PasswordValidationResult {
    const errors: string[] = [];

    if (!password || password.length < 8) {
      errors.push('Password must be at least 8 characters long.');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter.');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter.');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number.');
    }
    if (!/[@$!%*?&#^()_+\-=\[\]{}|;:,.<>]/.test(password)) {
      errors.push('Password must contain at least one special character.');
    }

    return { isValid: errors.length === 0, errors };
  }

  validateStrengthOrThrow(password: string): void {
    const { isValid, errors } = this.validateStrength(password);
    if (!isValid) {
      throw new BadRequestException(errors);
    }
  }
}
