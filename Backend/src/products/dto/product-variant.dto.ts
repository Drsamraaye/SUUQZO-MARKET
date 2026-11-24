import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  Min,
  MaxLength,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ProductImageDto {
  @IsString()
  @IsNotEmpty()
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  altText?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sortOrder?: number = 0;

  @IsOptional()
  isPrimary?: boolean = false;

  @IsOptional()
  @IsString()
  variantId?: string;
}

export class CreateVariantDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'SKU must be alphanumeric with optional hyphens or underscores',
  })
  sku?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  compareAtPrice?: number;

  @IsOptional()
  attributes?: Record<string, any>;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  weightKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  initialStock?: number = 0;
}
