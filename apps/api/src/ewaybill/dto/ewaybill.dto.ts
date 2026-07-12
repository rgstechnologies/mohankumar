import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const TRANSPORT_MODES = ['ROAD', 'RAIL', 'AIR', 'SHIP'] as const;

export class GenerateEWayBillDto {
  @ApiProperty({ enum: TRANSPORT_MODES, default: 'ROAD' })
  @IsIn(TRANSPORT_MODES as unknown as string[])
  transportMode: (typeof TRANSPORT_MODES)[number];

  @ApiProperty({ example: 120, description: 'Approx distance in km (drives validity)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(4000)
  distanceKm: number;

  @ApiPropertyOptional({ example: 'TN01AB1234' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  vehicleNo?: string;

  @ApiPropertyOptional({ description: 'GST transporter ID' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  transporterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  transporterName?: string;

  @ApiPropertyOptional({ description: 'LR / transport document number' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  transportDocNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  transportDocDate?: string;
}

export class CancelEWayBillDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  reason!: string;
}
