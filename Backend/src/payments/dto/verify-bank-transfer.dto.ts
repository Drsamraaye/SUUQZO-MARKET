import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class VerifyBankTransferDto {
  @IsString()
  @IsNotEmpty()
  bankReference!: string;

  @IsOptional()
  @IsString()
  adminNotes?: string;
}

export class CollectCodDto {
  @IsOptional()
  @IsString()
  collectedByRiderId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
