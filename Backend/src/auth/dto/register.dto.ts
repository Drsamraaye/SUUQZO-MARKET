import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsEnum,
  IsOptional,
  Matches,
} from 'class-validator';

export enum RegisterRole {
  CUSTOMER = 'CUSTOMER',
  SELLER = 'SELLER',
  RIDER = 'RIDER',
}

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{7,14}$/, { message: 'phone must be a valid phone number' })
  phone: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @IsEnum(RegisterRole, {
    message: 'role must be one of: CUSTOMER, SELLER, RIDER',
  })
  role: RegisterRole;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @IsString()
  @IsOptional()
  @MaxLength(254)
  email?: string;
}
