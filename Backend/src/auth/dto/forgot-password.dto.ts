import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  /**
   * Phone number or email address of the account.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  identifier: string;
}
