import { IsString, IsNotEmpty, Length } from 'class-validator';

export class TwoFactorConfirmDto {
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'Verification code must be exactly 6 digits' })
  code: string;
}
