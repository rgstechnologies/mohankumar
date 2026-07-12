import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const DIRECTIONS = ['RECEIVED', 'ISSUED'] as const;
const STATUSES = ['PENDING', 'CLEARED', 'BOUNCED', 'CANCELLED'] as const;

export class CreateChequeDto {
  @ApiProperty({ enum: DIRECTIONS })
  @IsIn(DIRECTIONS as unknown as string[])
  direction: (typeof DIRECTIONS)[number];

  @ApiPropertyOptional({ description: 'Linked party (customer for received, vendor for issued)' })
  @IsOptional()
  @IsUUID()
  partyId?: string;

  @ApiPropertyOptional({ description: 'Free-text name when no party is linked' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  partyName?: string;

  @ApiProperty({ example: '004521' })
  @IsString()
  @MaxLength(30)
  chequeNo: string;

  @ApiPropertyOptional({ example: 'HDFC Bank' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @ApiProperty({ example: 12500 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiProperty({ example: '2026-06-30', description: 'Date on the cheque' })
  @IsDateString()
  chequeDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class SetChequeStatusDto {
  @ApiProperty({ enum: STATUSES })
  @IsIn(STATUSES as unknown as string[])
  status: (typeof STATUSES)[number];

  @ApiPropertyOptional({ description: 'Clearing/bounce date; defaults to today' })
  @IsOptional()
  @IsDateString()
  date?: string;
}
