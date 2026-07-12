import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { GST_RATES, STATE_CODE_REGEX } from '../../common/validation';

export class EstimateLineDto {
  @ApiPropertyOptional({ description: 'Item id — autofills description/HSN/unit/GST rate' })
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Required when no itemId is given' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty({ example: 10 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional({ description: 'Defaults to the item sale price' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rate?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPct?: number;

  @ApiPropertyOptional({ enum: GST_RATES, description: 'Defaults to the item GST rate' })
  @IsOptional()
  @IsIn(GST_RATES as unknown as number[])
  gstRate?: number;
}

export class CreateEstimateDto {
  @ApiProperty()
  @IsUUID()
  partyId: string;

  @ApiPropertyOptional({ description: 'Branch this estimate belongs to' })
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

  @ApiPropertyOptional({ description: 'Override place-of-supply state code' })
  @IsOptional()
  @Matches(STATE_CODE_REGEX, { message: 'State code must be 2 digits' })
  placeOfSupply?: string;

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

/** Accept/decline/reopen an open estimate. */
export class SetEstimateStatusDto {
  @ApiProperty({ enum: ['OPEN', 'ACCEPTED', 'DECLINED'] })
  @IsIn(['OPEN', 'ACCEPTED', 'DECLINED'])
  status: 'OPEN' | 'ACCEPTED' | 'DECLINED';
}
