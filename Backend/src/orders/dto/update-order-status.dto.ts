import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ParentOrderStatus } from '@prisma/client';

export class UpdateOrderStatusDto {
  @IsEnum(ParentOrderStatus, {
    message: `status must be one of: ${Object.values(ParentOrderStatus).join(', ')}`,
  })
  status!: ParentOrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
