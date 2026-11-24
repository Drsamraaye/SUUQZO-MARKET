import { IsEnum, IsOptional, IsString, IsBoolean, MaxLength } from 'class-validator';
import { StoreStatus } from '@prisma/client';

export class AdminReviewStoreDto {
  @IsEnum(StoreStatus)
  status!: StoreStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;
}
