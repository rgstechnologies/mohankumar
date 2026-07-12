import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { DOC_KINDS } from '../invoice-template';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
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
import { InvoiceTemplateDto } from '../../companies/dto/company.dto';

export class InvoiceLineDto {
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

  @ApiPropertyOptional({
    description: 'Required when the item tracks batches (created on purchase, consumed on sale)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  batchNo?: string;

  @ApiPropertyOptional({ description: 'Batch expiry — purchase lines only' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}

export class CreateInvoiceDto {
  @ApiProperty()
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

  @ApiPropertyOptional({ description: 'Override place-of-supply state code' })
  @IsOptional()
  @Matches(STATE_CODE_REGEX, { message: 'State code must be 2 digits' })
  placeOfSupply?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Bank account to print on this invoice' })
  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @ApiPropertyOptional({ description: 'Loyalty points to redeem as a discount on this invoice' })
  @IsOptional()
  @IsInt()
  @Min(0)
  redeemPoints?: number;

  @ApiPropertyOptional({ description: 'Freight/transport charges (not taxed, added after tax)' })
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

export class RecordPaymentDto {
  @ApiProperty({ example: 5000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiProperty({ example: '2026-06-15' })
  @IsDateString()
  date: string;

  @ApiProperty({ description: 'Cash/bank ledger receiving the money' })
  @IsUUID()
  ledgerId: string;

  @ApiPropertyOptional({ enum: PaymentMethod, default: PaymentMethod.CASH })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({ example: 'UPI ref 4521…' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}

/** Body for the live template preview — unsaved layout + logo override. */
export class PreviewTemplateDto {
  @ApiPropertyOptional({ type: InvoiceTemplateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => InvoiceTemplateDto)
  template?: InvoiceTemplateDto;

  @ApiPropertyOptional({ nullable: true, description: 'Logo data URL, or null' })
  @IsOptional()
  @Matches(/^data:image\/(png|jpe?g|webp);base64,/, {
    message: 'Logo must be a PNG, JPEG or WEBP image',
  })
  @MaxLength(400_000)
  logo?: string | null;

  @ApiPropertyOptional({ description: 'Render the thermal/POS receipt instead of the A4/A5 page' })
  @IsOptional()
  @IsBoolean()
  thermal?: boolean;

  @ApiPropertyOptional({ enum: DOC_KINDS, description: 'Which document type to preview' })
  @IsOptional()
  @IsIn(DOC_KINDS as unknown as string[])
  docKind?: string;
}
