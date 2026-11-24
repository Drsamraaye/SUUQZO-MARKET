import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class TwoFactorDisableDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(72)
  password: string;
}
