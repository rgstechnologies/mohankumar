import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ParseBillDto {
  @ApiProperty({ example: 'bill-scan.jpg' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fileName: string;

  @ApiProperty({ description: 'Bill image/PDF, base64-encoded' })
  @IsString()
  @IsNotEmpty()
  content: string;
}

export class RecoSuggestDto {
  @ApiProperty({ description: 'Bank/cash ledger being reconciled' })
  @IsUUID()
  ledgerId: string;
}

export class AskReportsDto {
  @ApiProperty({
    example: 'Who are my top customers by outstanding amount?',
    description: 'Plain-language question about the books, English or Tamil',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  question?: string;

  @ApiProperty({
    required: false,
    description: 'Spoken question as base64 WAV — alternative to `question`',
  })
  @IsOptional()
  @IsString()
  audio?: string;
}

export class ParseVoucherDto {
  @ApiProperty({
    example: 'Paid ₹12,000 office rent for June by HDFC bank transfer',
    description: 'Plain-language transaction, English or Tamil',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  text?: string;

  @ApiProperty({
    required: false,
    description: 'Spoken transaction as base64 WAV — alternative to `text`',
  })
  @IsOptional()
  @IsString()
  audio?: string;
}
