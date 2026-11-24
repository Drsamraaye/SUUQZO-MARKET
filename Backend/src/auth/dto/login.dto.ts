import { IsString, IsNotEmpty, IsOptional, MinLength, MaxLength } from 'class-validator';

export class LoginDto {
  /**
   * Phone number or email address.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  identifier: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(72)
  password: string;

  /**
   * Optional TOTP code or recovery code for 2FA-enabled accounts.
   */
  @IsString()
  @IsOptional()
  @MaxLength(16)
  twoFactorCode?: string;
}
