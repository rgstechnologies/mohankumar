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
  MaxLength,
  Min,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { InvoiceLineDto } from '../../invoices/dto/invoice.dto';

export class CreatePurchaseBillDto {
  @ApiProperty({ description: 'Vendor party id' })
  @IsUUID()
  partyId: string;

  @ApiPropertyOptional({ description: 'Branch this document belongs to' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({ example: '2026-06-11' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: "The vendor's own bill number" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  supplierBillNo?: string;

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

  @ApiProperty({ type: [InvoiceLineDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines: InvoiceLineDto[];
}
