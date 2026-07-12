import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const DOC_KINDS = [
  'invoice',
  'estimate',
  'proformaInvoice',
  'salesOrder',
  'deliveryChallan',
  'purchaseBill',
  'purchaseEstimate',
  'purchaseOrder',
] as const;

export class CreatePrintTemplateDto {
  @ApiProperty({ example: 'My Custom Invoice' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ enum: DOC_KINDS, default: 'invoice' })
  @IsOptional()
  @IsIn(DOC_KINDS)
  docKind?: (typeof DOC_KINDS)[number];

  @ApiProperty({ description: 'A PrintDesign document (see @bookly/shared)' })
  @IsObject()
  design: Record<string, unknown>;
}

export class UpdatePrintTemplateDto {
  @ApiPropertyOptional({ example: 'My Custom Invoice' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  design?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class PreviewDesignDto {
  @ApiProperty({ description: 'A PrintDesign document to render with sample data' })
  @IsObject()
  design: Record<string, unknown>;

  @ApiPropertyOptional({ enum: DOC_KINDS, default: 'invoice' })
  @IsOptional()
  @IsIn(DOC_KINDS)
  docKind?: (typeof DOC_KINDS)[number];
}
