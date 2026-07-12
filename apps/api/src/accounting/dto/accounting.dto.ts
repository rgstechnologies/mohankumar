import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntryType, VoucherType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreateLedgerDto {
  @ApiProperty({ example: 'HDFC Bank Current A/c' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiProperty({ description: 'Account group id' })
  @IsUUID()
  groupId: string;

  @ApiPropertyOptional({ default: 0, example: 50000 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  openingBalance?: number;

  @ApiPropertyOptional({ enum: EntryType, default: EntryType.DEBIT })
  @IsOptional()
  @IsEnum(EntryType)
  openingType?: EntryType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class VoucherLineDto {
  @ApiProperty()
  @IsUUID()
  ledgerId: string;

  @ApiProperty({ enum: EntryType })
  @IsEnum(EntryType)
  type: EntryType;

  @ApiProperty({ example: 25000, description: 'Positive amount in rupees' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;
}

export class CreateVoucherDto {
  @ApiProperty({ enum: VoucherType })
  @IsEnum(VoucherType)
  type: VoucherType;

  @ApiProperty({ example: '2026-06-11' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ example: 'Being rent paid for June' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  narration?: string;

  @ApiProperty({ type: [VoucherLineDto], minItems: 2 })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => VoucherLineDto)
  lines: VoucherLineDto[];
}
