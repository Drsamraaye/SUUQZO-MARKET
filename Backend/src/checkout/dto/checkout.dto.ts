import {
  IsOptional,
  IsString,
  IsObject,
  ValidateNested,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ShippingAddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  recipientName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  street!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  landmark?: string;
}

export class CheckoutDto {
  @IsOptional()
  @IsString()
  shippingAddressId?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress?: ShippingAddressDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
