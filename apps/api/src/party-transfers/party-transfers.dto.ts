import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreatePartyTransferDto {
  @ApiProperty({ description: 'Source party — its balance is reduced (credited)' })
  @IsUUID()
  fromPartyId: string;

  @ApiProperty({ description: 'Destination party — its balance is increased (debited)' })
  @IsUUID()
  toPartyId: string;

  @ApiProperty({ example: 5000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiProperty({ example: '2026-06-14' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
