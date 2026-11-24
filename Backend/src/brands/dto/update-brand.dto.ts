import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class UpdateBrandDto {
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
  logoUrl?: string | null;
}
