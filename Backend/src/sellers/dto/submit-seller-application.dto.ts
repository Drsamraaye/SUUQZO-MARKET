import { IsNotEmpty, IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { PayoutMethodType } from '@prisma/client';

export class SubmitSellerApplicationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  businessName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  businessRegistrationNo?: string;

  @IsOptional()
  @IsEnum(PayoutMethodType)
  defaultPayoutMethod?: PayoutMethodType = PayoutMethodType.EVC_PLUS;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  payoutAccountIdentifier!: string;

  @IsOptional()
  payoutAccountDetails?: Record<string, any>;
}
