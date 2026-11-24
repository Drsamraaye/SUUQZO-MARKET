import { IsOptional, IsString, IsEmail, MaxLength } from 'class-validator';

export class UpdateUserProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  preferredLanguage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  preferredCurrency?: string;
}
