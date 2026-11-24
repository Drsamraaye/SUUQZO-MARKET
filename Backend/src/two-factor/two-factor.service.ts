import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { PasswordService } from '../security/password.service.js';
import crypto from 'node:crypto';

@Injectable()
export class TwoFactorService {
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {
    const rawKey = process.env.TWO_FACTOR_ENCRYPTION_KEY || 'suuqzo-mall-32-byte-secure-two-factor-key!';
    this.encryptionKey = crypto.createHash('sha256').update(rawKey).digest();
  }

  /**
   * Encrypts the raw TOTP secret before storing it in the database (AES-256-GCM).
   */
  private encryptSecret(plainSecret: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    let encrypted = cipher.update(plainSecret, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Decrypts the stored TOTP secret.
   */
  private decryptSecret(encryptedPayload: string): string {
    const [ivHex, authTagHex, encryptedText] = encryptedPayload.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Generates a Base32-encoded random secret for RFC 6238 TOTP.
   */
  private generateBase32Secret(length = 20): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const bytes = crypto.randomBytes(length);
    let secret = '';
    for (let i = 0; i < bytes.length; i++) {
      secret += charset[bytes[i] % 32];
    }
    return secret;
  }

  /**
   * Generates 6-digit TOTP code for a given timestamp and secret (RFC 6238).
   */
  private generateTotp(secretBase32: string, counter: number): string {
    const key = this.base32Decode(secretBase32);
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64BE(BigInt(counter), 0);

    const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    return (code % 1000000).toString().padStart(6, '0');
  }

  private base32Decode(input: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    const output: number[] = [];

    for (let i = 0; i < input.length; i++) {
      const idx = alphabet.indexOf(input[i].toUpperCase());
      if (idx === -1) continue;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        output.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return Buffer.from(output);
  }

  /**
   * Verifies a 6-digit TOTP token allowing a +/- 1 step clock skew window (30 seconds).
   */
  verifyTotpCode(secretBase32: string, token: string): boolean {
    const timeStep = 30;
    const currentCounter = Math.floor(Date.now() / 1000 / timeStep);

    for (let offset = -1; offset <= 1; offset++) {
      const expectedCode = this.generateTotp(secretBase32, currentCounter + offset);
      if (token === expectedCode) {
        return true;
      }
    }
    return false;
  }

  /**
   * Step 1: Initiates 2FA enrollment for a user.
   */
  async enroll(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found.');
    }

    const secret = this.generateBase32Secret(20);
    const encryptedSecret = this.encryptSecret(secret);

    // Save temporary encrypted secret
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: encryptedSecret },
    });

    const accountIdentifier = encodeURIComponent(user.email || user.phone);
    const otpauthUrl = `otpauth://totp/SUUQZO%20MALL:${accountIdentifier}?secret=${secret}&issuer=SUUQZO%20MALL&algorithm=SHA1&digits=6&period=30`;

    return { secret, otpauthUrl };
  }

  /**
   * Step 2: Confirms 2FA enrollment with an initial code and generates 10 single-use recovery codes.
   */
  async confirmEnrollment(
    userId: string,
    token: string,
  ): Promise<{ enabled: boolean; recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorSecret) {
      throw new BadRequestException('Two-factor enrollment has not been initiated.');
    }

    const plainSecret = this.decryptSecret(user.twoFactorSecret);
    const isValid = this.verifyTotpCode(plainSecret, token);

    if (!isValid) {
      throw new BadRequestException('Invalid TOTP verification code.');
    }

    // Generate 10 cryptographically random 8-character recovery codes
    const plainRecoveryCodes: string[] = [];
    const hashedRecoveryCodes: string[] = [];

    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 chars
      plainRecoveryCodes.push(code);
      const hashed = crypto.createHash('sha256').update(code).digest('hex');
      hashedRecoveryCodes.push(hashed);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorRecoveryCodes: hashedRecoveryCodes,
      },
    });

    return {
      enabled: true,
      recoveryCodes: plainRecoveryCodes,
    };
  }

  /**
   * Verifies 2FA via TOTP token or single-use recovery code during login.
   */
  async verifyLogin2Fa(userId: string, codeOrRecovery: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return false;
    }

    // Check TOTP code first
    const plainSecret = this.decryptSecret(user.twoFactorSecret);
    if (this.verifyTotpCode(plainSecret, codeOrRecovery)) {
      return true;
    }

    // Check Recovery Code
    const inputHash = crypto.createHash('sha256').update(codeOrRecovery.trim().toUpperCase()).digest('hex');
    const recoveryIndex = user.twoFactorRecoveryCodes.indexOf(inputHash);

    if (recoveryIndex !== -1) {
      // Consume the recovery code (single-use)
      const updatedCodes = [...user.twoFactorRecoveryCodes];
      updatedCodes.splice(recoveryIndex, 1);

      await this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorRecoveryCodes: updatedCodes },
      });

      return true;
    }

    return false;
  }

  /**
   * Disables 2FA after password re-authentication.
   */
  async disable(userId: string, currentPassword: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Authentication required to disable 2FA.');
    }

    const isMatch = await this.passwordService.verify(user.passwordHash, currentPassword);
    if (!isMatch) {
      throw new UnauthorizedException('Incorrect password.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorRecoveryCodes: [],
      },
    });

    return true;
  }
}
