import { IsEnum, IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { UserStatus } from '@prisma/client';

export class UpdateUserStatusDto {
  @IsEnum(UserStatus)
  status!: UserStatus;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
