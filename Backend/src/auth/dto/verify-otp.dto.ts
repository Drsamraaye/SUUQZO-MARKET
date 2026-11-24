import { IsString, IsNotEmpty, MaxLength, IsEnum } from 'class-validator';

export enum OtpPurposeDto {
  PHONE_VERIFICATION = 'PHONE_VERIFICATION',
  EMAIL_VERIFICATION = 'EMAIL_VERIFICATION',
  LOGIN = 'LOGIN',
  PASSWORD_RESET = 'PASSWORD_RESET',
  SENSITIVE_ACTION = 'SENSITIVE_ACTION',
}

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  target: string;

  @IsEnum(OtpPurposeDto)
  purpose: OtpPurposeDto;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  code: string;
}
