import { IsNotEmpty, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class AddToCartDto {
  @IsString()
  @IsNotEmpty()
  variantId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity: number = 1;
}
