import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export class CreateBankDto {
  @ApiProperty({ example: 'HDFC Current A/c', description: 'Label / ledger name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  accountName: string;

  @ApiPropertyOptional({ example: 'HDFC Bank' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @ApiPropertyOptional({ example: '50100123456789' })
  @IsOptional()
  @Matches(/^[0-9]{5,20}$/, { message: 'Account number must be 5-20 digits' })
  accountNo?: string;

  @ApiPropertyOptional({ example: 'HDFC0001234' })
  @IsOptional()
  @Matches(IFSC_REGEX, { message: 'Invalid IFSC code' })
  ifsc?: string;

  @ApiPropertyOptional({ example: 'RS Puram, Coimbatore' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  branch?: string;

  @ApiPropertyOptional({ example: 'shop@okhdfcbank' })
  @IsOptional()
  @Matches(/^[a-zA-Z0-9.\-_]{2,100}@[a-zA-Z]{2,64}$/, { message: 'Invalid UPI ID' })
  upiId?: string;

  @ApiPropertyOptional({ description: 'Print this bank on documents by default' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

/** accountName (ledger) is immutable after creation; the rest can change. */
export class UpdateBankDto extends PartialType(CreateBankDto) {}
