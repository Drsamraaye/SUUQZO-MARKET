import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SubOrderStatus } from '@prisma/client';

export class UpdateSubOrderStatusDto {
  @IsEnum(SubOrderStatus, {
    message: `status must be one of: ${Object.values(SubOrderStatus).join(', ')}`,
  })
  status!: SubOrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sellerNotes?: string;
}
