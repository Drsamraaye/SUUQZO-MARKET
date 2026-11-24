import {
  IsOptional,
  IsString,
  IsEmail,
  IsNumber,
  IsEnum,
  MaxLength,
  Matches,
} from 'class-validator';
import { StoreStatus } from '@prisma/client';

export class UpdateStoreDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug must be lower-case alphanumeric with optional hyphens',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  bannerUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  openingHours?: Record<string, any>;

  @IsOptional()
  @IsEnum(StoreStatus)
  status?: StoreStatus;
}
