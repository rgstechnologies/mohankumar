import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PoLineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Required when no itemId is given' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty({ example: 100 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional({ description: 'Defaults to the item purchase price' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rate?: number;
}

export class CreatePoDto {
  @ApiProperty({ description: 'Vendor party id' })
  @IsUUID()
  partyId: string;

  @ApiPropertyOptional({ description: 'Branch this order belongs to' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({ example: '2026-06-15' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ example: '2026-06-25' })
  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiProperty({ type: [PoLineDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => PoLineDto)
  lines: PoLineDto[];
}

export class GrnLineDto {
  @ApiProperty()
  @IsUUID()
  poLineId: string;

  @ApiProperty({ example: 50 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity: number;
}

export class CreateGrnDto {
  @ApiProperty({ example: '2026-06-20' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ example: 'Received at main godown' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ type: [GrnLineDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => GrnLineDto)
  lines: GrnLineDto[];
}

export class ConvertPoDto {
  @ApiProperty({ example: '2026-06-20' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ description: "The vendor's bill number" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  supplierBillNo?: string;
}
