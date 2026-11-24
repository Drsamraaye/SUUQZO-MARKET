import { IsNotEmpty, IsOptional, IsString, IsEnum, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { RefundReason } from '@prisma/client';

export class CreateRefundDto {
  @IsString()
  @IsNotEmpty()
  paymentId!: string;

  @IsOptional()
  @IsString()
  subOrderId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsEnum(RefundReason)
  reason!: RefundReason;

  @IsOptional()
  @IsString()
  adminNotes?: string;
}

export class CreatePayoutBatchDto {
  @IsOptional()
  @IsString()
  cycleDate?: string;

  @IsOptional()
  @IsString()
  sellerId?: string;
}
