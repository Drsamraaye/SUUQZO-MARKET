import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  Min,
  MaxLength,
  Matches,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateVariantDto, ProductImageDto } from './product-variant.dto.js';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  storeId!: string;

  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug must be lower-case alphanumeric with hyphens',
  })
  slug?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  description!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  compareAtPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string = 'USD';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageDto)
  images?: ProductImageDto[];
}
