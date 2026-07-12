import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NoteType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { InvoiceLineDto } from '../../invoices/dto/invoice.dto';

export class CreateNoteDto {
  @ApiProperty({ enum: NoteType })
  @IsEnum(NoteType)
  type: NoteType;

  @ApiPropertyOptional({ description: 'Source invoice (CREDIT_NOTE)' })
  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @ApiPropertyOptional({ description: 'Source purchase bill (DEBIT_NOTE)' })
  @IsOptional()
  @IsUUID()
  purchaseBillId?: string;

  @ApiProperty({ example: '2026-06-15' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ example: 'Goods returned — damaged in transit' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiProperty({ type: [InvoiceLineDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines: InvoiceLineDto[];
}
