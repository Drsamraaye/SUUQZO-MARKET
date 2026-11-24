import { IsIn, IsOptional, IsString, IsNumber, Min, Max, MaxLength } from 'class-validator';

export class ReviewSellerApplicationDto {
  @IsIn(['APPROVE', 'REJECT', 'SUSPEND'])
  decision!: 'APPROVE' | 'REJECT' | 'SUSPEND';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  commissionRate?: number;
}
