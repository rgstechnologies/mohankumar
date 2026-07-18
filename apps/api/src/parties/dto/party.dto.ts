import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { EntryType, PartyType, PaymentMethod } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  GST_RATES,
  GSTIN_REGEX,
  HSN_REGEX,
  ITEM_UNITS,
  PINCODE_REGEX,
} from '../../common/validation';

export class CreatePartyDto {
  @ApiProperty({ enum: PartyType })
  @IsEnum(PartyType)
  type: PartyType;

  @ApiProperty({ example: 'Lakshmi Fabrics' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'Lakshmi', description: 'Alias / short name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  aliasName?: string;

  @ApiPropertyOptional({ example: '33AABCL4567C1ZD' })
  @IsOptional()
  @Matches(GSTIN_REGEX, { message: 'Invalid GSTIN format' })
  gstin?: string;

  @ApiPropertyOptional({ example: 'Tamil Nadu', description: 'Indian state; sets the GST state code and CGST/SGST-vs-IGST' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+91 98765 43210' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(PINCODE_REGEX, { message: 'Pincode must be 6 digits' })
  pincode?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Party photo/logo as a data: URL (PNG/JPEG/WEBP); null clears it',
  })
  @IsOptional()
  @Matches(/^data:image\/(png|jpe?g|webp);base64,/, {
    message: 'Image must be a PNG, JPEG or WEBP image',
  })
  @MaxLength(400_000, { message: 'Image too large (max ~300KB)' })
  image?: string | null;

  @ApiPropertyOptional({
    enum: ['invoice', 'estimate', 'purchase', 'purchaseEstimate'],
    description:
      "Document type this party's outstanding is tracked against. Customers: " +
      "'invoice' | 'estimate'; vendors: 'purchase' | 'purchaseEstimate'. " +
      'Omit/null to inherit the company default.',
  })
  @IsOptional()
  @ValidateIf((o) => o.balanceDocType != null)
  @IsIn(['invoice', 'estimate', 'purchase', 'purchaseEstimate'])
  balanceDocType?: string | null;

  @ApiPropertyOptional({ description: 'Opening receivable/payable amount' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingBalance?: number;

  @ApiPropertyOptional({
    enum: EntryType,
    description:
      'Defaults by party type: customers DEBIT (receivable), vendors CREDIT (payable)',
  })
  @IsOptional()
  @IsEnum(EntryType)
  openingType?: EntryType;
}

/**
 * Party type and opening balance are immutable after creation — type drives
 * the ledger group, and opening edits would silently rewrite history.
 */
export class UpdatePartyDto extends PartialType(
  OmitType(CreatePartyDto, ['type', 'openingBalance', 'openingType'] as const),
) {}

/**
 * Record a receipt (from a customer) or payment (to a vendor) directly against
 * a party's ledger — independent of any single invoice/bill. Reduces the
 * party's outstanding balance. Optionally links the money as an advance against
 * a sales estimate (customers) or purchase order (vendors).
 */
export class RecordPartyPaymentDto {
  @ApiProperty({ example: 5000, description: 'Amount received/paid' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiProperty({ example: '2026-06-16', description: 'Payment date (ISO)' })
  @IsDateString()
  date: string;

  @ApiProperty({ description: 'Cash/bank ledger that receives or pays the money' })
  @IsUUID()
  ledgerId: string;

  @ApiPropertyOptional({ enum: PaymentMethod, default: PaymentMethod.CASH })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({ example: 'UPI ref 4521' })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @ApiPropertyOptional({ description: 'Sales estimate this is an advance against (customers)' })
  @IsOptional()
  @IsUUID()
  estimateId?: string;

  @ApiPropertyOptional({ description: 'Purchase order this is an advance against (vendors)' })
  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  @ApiPropertyOptional({ description: 'Purchase estimate this is an advance against (vendors)' })
  @IsOptional()
  @IsUUID()
  purchaseEstimateId?: string;

  @ApiPropertyOptional({
    description:
      "Banking screen that created this receipt: 'estimate' | 'invoice'. " +
      "Used by reports to route unlinked advances to the correct report section.",
    example: 'estimate',
  })
  @IsOptional()
  @IsString()
  source?: string;
}

/** One variant of an item (e.g. a colour/size) — created as a child item. */
export class ItemVariantDto {
  @ApiProperty({ example: 'Red / M' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  variantLabel: string;

  @ApiPropertyOptional({ example: 'CS-RM' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sku?: string;

  @ApiPropertyOptional({ example: 499 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salePrice?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  openingStock?: number;
}

export class ItemCustomFieldDto {
  @ApiProperty({ example: 'Brand' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name: string;

  @ApiPropertyOptional({ example: 'Premium' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  value?: string;
}

export class CreateItemDto {
  @ApiProperty({ example: 'Cotton Fabric 40s' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({
    type: [ItemVariantDto],
    description: 'Optional variants (colour/size); each becomes a child item',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemVariantDto)
  variants?: ItemVariantDto[];

  @ApiPropertyOptional({ example: 'CF-40S' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sku?: string;

  @ApiPropertyOptional({ example: '5208' })
  @IsOptional()
  @Matches(HSN_REGEX, { message: 'HSN code must be 2-8 digits' })
  hsnCode?: string;

  @ApiPropertyOptional({ enum: ITEM_UNITS, default: 'PCS' })
  @IsOptional()
  @IsIn(ITEM_UNITS as unknown as string[])
  unit?: string;

  @ApiPropertyOptional({ enum: GST_RATES, default: 0, example: 5 })
  @IsOptional()
  @IsIn(GST_RATES as unknown as number[])
  gstRate?: number;

  @ApiPropertyOptional({ example: 250 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salePrice?: number;

  @ApiPropertyOptional({ example: 180 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  purchasePrice?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  openingStock?: number;

  @ApiPropertyOptional({ description: 'Low-stock alert threshold' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  reorderLevel?: number;

  @ApiPropertyOptional({ example: '8901234567890', description: 'EAN/UPC or internal barcode' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @ApiPropertyOptional({ default: false, description: 'Track stock per batch with expiry' })
  @IsOptional()
  @IsBoolean()
  trackBatches?: boolean;

  // ---- User-defined attributes (free-form columns) ----

  @ApiPropertyOptional({
    type: [ItemCustomFieldDto],
    description: 'Business-named attributes, e.g. [{name:"Brand",value:"X"}]',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemCustomFieldDto)
  @ArrayMaxSize(30)
  customFields?: ItemCustomFieldDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateItemDto extends PartialType(CreateItemDto) {}
