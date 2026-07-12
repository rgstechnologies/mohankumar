import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { EstimateLineDto } from '../../estimates/dto/estimate.dto';

export class CreatePurchaseEstimateDto {
  @ApiProperty({ description: 'Vendor party id' })
  @IsUUID()
  partyId: string;

  @ApiPropertyOptional({ description: 'Branch this quotation belongs to' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({ example: '2026-06-13' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ description: 'Quote validity date' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Print the company name on the document', default: true })
  @IsOptional()
  @IsBoolean()
  showCompanyName?: boolean;

  @ApiPropertyOptional({ description: 'Freight charges (not taxed, added after tax)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  freightCharges?: number;

  @ApiPropertyOptional({ description: 'Other charges (not taxed, added after tax)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  otherCharges?: number;

  @ApiProperty({ type: [EstimateLineDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => EstimateLineDto)
  lines: EstimateLineDto[];
}

export { SetEstimateStatusDto as SetPurchaseEstimateStatusDto } from '../../estimates/dto/estimate.dto';
