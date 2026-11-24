import { IsOptional, IsInt, Min, Max, IsEnum, IsString, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { StoreStatus } from '@prisma/client';

export class ListStoresDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsEnum(StoreStatus)
  status?: StoreStatus;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isFeatured?: boolean;
}
