import {
  IsNotEmpty,
  IsString,
  IsInt,
  IsEnum,
  IsOptional,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StockMovementType } from '@prisma/client';

export class AdjustStockDto {
  @IsString()
  @IsNotEmpty()
  variantId!: string;

  @IsString()
  @IsNotEmpty()
  storeId!: string;

  @Type(() => Number)
  @IsInt()
  quantityChange!: number;

  @IsEnum(StockMovementType)
  type!: StockMovementType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;
}
