import { IsNotEmpty, IsOptional, IsString, IsEnum } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsString()
  payerPhone?: string;

  @IsOptional()
  @IsString()
  payerAccount?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
