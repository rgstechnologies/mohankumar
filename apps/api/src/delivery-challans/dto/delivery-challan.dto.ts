import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { STATE_CODE_REGEX } from '../../common/validation';
import { EstimateLineDto } from '../../estimates/dto/estimate.dto';

export class CreateDeliveryChallanDto {
  @ApiProperty()
  @IsUUID()
  partyId: string;

  @ApiPropertyOptional({ description: 'Branch this challan belongs to' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({ example: '2026-06-14' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ description: 'Override place-of-supply state code' })
  @IsOptional()
  @Matches(STATE_CODE_REGEX, { message: 'State code must be 2 digits' })
  placeOfSupply?: string;

  @ApiPropertyOptional({ description: 'Transport vehicle number, printed on the challan' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  vehicleNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

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
