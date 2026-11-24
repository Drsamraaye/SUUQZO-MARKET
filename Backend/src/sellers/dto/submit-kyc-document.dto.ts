import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SubmitKycDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  documentType!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  documentUrl!: string;
}
