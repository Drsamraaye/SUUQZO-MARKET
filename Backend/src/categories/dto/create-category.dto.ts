import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsNumber,
  Min,
  Max,
  MaxLength,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug must be lower-case alphanumeric with hyphens (e.g. "electronics-phones")',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  iconUrl?: string;

  @IsOptional()
  @IsString()
  bannerUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  commissionRateOverride?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
