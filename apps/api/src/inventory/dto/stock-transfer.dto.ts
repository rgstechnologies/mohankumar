import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class StockTransferLineDto {
  @ApiProperty()
  @IsUUID()
  itemId: string;

  @ApiProperty({ example: 10 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional({ description: 'Required when the item tracks batches' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  batchNo?: string;
}

export class CreateStockTransferDto {
  @ApiProperty({ example: '2026-06-11' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ description: 'Omit for the Head Office / unassigned pool' })
  @IsOptional()
  @IsUUID()
  fromBranchId?: string;

  @ApiPropertyOptional({ description: 'Omit for the Head Office / unassigned pool' })
  @IsOptional()
  @IsUUID()
  toBranchId?: string;

  @ApiPropertyOptional({ example: 'Festival season replenishment' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  narration?: string;

  @ApiProperty({ type: [StockTransferLineDto] })
  @ValidateNested({ each: true })
  @Type(() => StockTransferLineDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  lines: StockTransferLineDto[];
}
