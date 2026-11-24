import {
  IsOptional,
  IsString,
  IsBoolean,
  IsInt,
  IsNumber,
  Min,
  Max,
  MaxLength,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug must be lower-case alphanumeric with hyphens',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  iconUrl?: string | null;

  @IsOptional()
  @IsString()
  bannerUrl?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  commissionRateOverride?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
