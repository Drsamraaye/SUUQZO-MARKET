import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ModerateProductDto {
  @IsIn(['APPROVE', 'REJECT', 'SUSPEND', 'REQUEST_CHANGES'])
  action!: 'APPROVE' | 'REJECT' | 'SUSPEND' | 'REQUEST_CHANGES';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
