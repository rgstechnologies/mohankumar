import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const PHONE_REGEX = /^[+0-9][0-9 -]{5,19}$/;

/**
 * Mixin-style decorators shared by create + update. Bank/contact fields are
 * printed on invoices; null clears them on update.
 */
class CompanyContactBankFields {
  @ApiPropertyOptional({ example: '+91 98765 43210' })
  @IsOptional()
  @Matches(PHONE_REGEX, { message: 'Invalid phone number' })
  phone?: string | null;

  @ApiPropertyOptional({ example: 'billing@business.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Invalid email' })
  email?: string | null;

  @ApiPropertyOptional({ example: 'HDFC Bank' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string | null;

  @ApiPropertyOptional({ example: 'Sharma Textiles Pvt Ltd' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  bankAccountName?: string | null;

  @ApiPropertyOptional({ example: '50100123456789' })
  @IsOptional()
  @Matches(/^[0-9]{5,20}$/, { message: 'Account number must be 5-20 digits' })
  bankAccountNo?: string | null;

  @ApiPropertyOptional({ example: 'HDFC0001234' })
  @IsOptional()
  @Matches(IFSC_REGEX, { message: 'Invalid IFSC code' })
  bankIfsc?: string | null;

  @ApiPropertyOptional({ example: 'RS Puram, Coimbatore' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankBranch?: string | null;

  @ApiPropertyOptional({
    description: 'NIC e-way bill API username (from ewaybillgst.gov.in → For GSP)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ewbApiUsername?: string | null;

  @ApiPropertyOptional({
    description: 'NIC e-way bill API password; omit to leave unchanged',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ewbApiPassword?: string | null;

  @ApiPropertyOptional({
    description: 'NIC e-invoice API username (from einvoice1.gst.gov.in → API Registration)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  einvoiceApiUsername?: string | null;

  @ApiPropertyOptional({
    description: 'NIC e-invoice API password; omit to leave unchanged',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  einvoiceApiPassword?: string | null;
}

/** Editable invoice layout — every field optional, merged over defaults. */
export class InvoiceTemplateDto {
  @ApiPropertyOptional({
    example: 'tally',
    enum: ['tally', 'classic', 'modern', 'minimal', 'professional', 'elegant'],
  })
  @IsOptional()
  @IsIn(['tally', 'classic', 'modern', 'minimal', 'professional', 'elegant'])
  templateId?: string;

  @ApiPropertyOptional({ example: 'tax', enum: ['tax', 'simple'] })
  @IsOptional()
  @IsIn(['tax', 'simple'])
  format?: string;

  @ApiPropertyOptional({ example: 'A4', enum: ['A4', 'A5'] })
  @IsOptional()
  @IsIn(['A4', 'A5'])
  paperSize?: string;

  @ApiPropertyOptional({ example: '#4f46e5' })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Accent colour must be a 6-digit hex' })
  accentColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showInfoQr?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showBank?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showUpiQr?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showSignature?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showHsn?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showGstColumns?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showTotalQty?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showReceived?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showBalance?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showAmountInWords?: boolean;

  @ApiPropertyOptional({ enum: ['indian', 'international'] })
  @IsOptional()
  @IsIn(['indian', 'international'])
  amountWordsFormat?: string;

  @ApiPropertyOptional({ enum: ['2in', '3in', '4in'] })
  @IsOptional()
  @IsIn(['2in', '3in', '4in'])
  thermalWidth?: string;

  @ApiPropertyOptional({ example: 'For Sharma Textiles' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  signatureLabel?: string | null;

  @ApiPropertyOptional({ example: 'TAX INVOICE' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  title?: string | null;

  @ApiPropertyOptional({ example: '1. Goods once sold will not be taken back.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  terms?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  footerText?: string | null;

  @ApiPropertyOptional({ description: 'Print the company name in the header' })
  @IsOptional()
  @IsBoolean()
  printName?: boolean;

  @ApiPropertyOptional({ description: 'Print the company address block' })
  @IsOptional()
  @IsBoolean()
  printAddress?: boolean;

  @ApiPropertyOptional({ description: 'Print the company phone' })
  @IsOptional()
  @IsBoolean()
  printPhone?: boolean;

  @ApiPropertyOptional({ description: 'Print the company email' })
  @IsOptional()
  @IsBoolean()
  printEmail?: boolean;

  @ApiPropertyOptional({ description: 'Print the company GSTIN' })
  @IsOptional()
  @IsBoolean()
  printGstin?: boolean;

  @ApiPropertyOptional({ description: 'Text printed instead of the name when printName is off' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  headerNameOverride?: string | null;
}

export class CreateCompanyDto extends CompanyContactBankFields {
  @ApiProperty({ example: 'Sharma Textiles Pvt Ltd' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({
    example: 'SHARMA TEXTILES',
    description: 'Trade/display name printed on documents (falls back to name)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  printName?: string;

  @ApiPropertyOptional({ example: 'Sharma Textiles Private Limited' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @ApiPropertyOptional({ example: '33AAACS1234A1ZB', description: '15-char GSTIN' })
  @IsOptional()
  @Matches(GSTIN_REGEX, { message: 'Invalid GSTIN format' })
  gstin?: string;

  @ApiPropertyOptional({ example: '33', description: 'Indian state code (2 digits)' })
  @IsOptional()
  @Matches(/^[0-9]{2}$/, { message: 'State code must be 2 digits' })
  stateCode?: string;

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

  @ApiPropertyOptional({ example: 'Coimbatore' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: '641001' })
  @IsOptional()
  @Matches(/^[0-9]{6}$/, { message: 'Pincode must be 6 digits' })
  pincode?: string;

  @ApiPropertyOptional({ default: 4, description: 'Fiscal year start month (4 = April)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  fyStartMonth?: number;

  @ApiPropertyOptional({
    example: 'shop@okhdfcbank',
    description: 'UPI ID — printed as a scan-to-pay QR on invoices',
  })
  @IsOptional()
  @Matches(/^[a-zA-Z0-9.\-_]{2,100}@[a-zA-Z]{2,64}$/, {
    message: 'Invalid UPI ID (e.g. name@bank)',
  })
  upiId?: string;

  @ApiPropertyOptional({ description: 'Company logo as a data: URL (base64)' })
  @IsOptional()
  @Matches(/^data:image\/(png|jpe?g|webp);base64,/, {
    message: 'Logo must be a PNG, JPEG or WEBP image',
  })
  @MaxLength(400_000)
  logo?: string;
}

/**
 * Updatable company profile. GSTIN/state/fiscal-year are intentionally NOT
 * editable here — they drive tax math and document numbering; changing them
 * mid-year would silently corrupt history.
 */
export class UpdateCompanyDto extends CompanyContactBankFields {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Trade/display name printed on documents; null clears it',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  printName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @ApiPropertyOptional({ example: '33AAACS1234A1ZB', description: '15-char GSTIN' })
  @IsOptional()
  @Matches(GSTIN_REGEX, { message: 'Invalid GSTIN format' })
  gstin?: string;

  @ApiPropertyOptional({ example: '33', description: 'Indian state code (2 digits)' })
  @IsOptional()
  @Matches(/^[0-9]{2}$/, { message: 'State code must be 2 digits' })
  stateCode?: string;

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
  @Matches(/^[0-9]{6}$/, { message: 'Pincode must be 6 digits' })
  pincode?: string;

  @ApiPropertyOptional({ nullable: true, description: 'null clears it' })
  @IsOptional()
  @Matches(/^[a-zA-Z0-9.\-_]{2,100}@[a-zA-Z]{2,64}$/, {
    message: 'Invalid UPI ID (e.g. name@bank)',
  })
  upiId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Logo as a data: URL (PNG/JPEG/WEBP); null clears it',
  })
  @IsOptional()
  @Matches(/^data:image\/(png|jpe?g|webp);base64,/, {
    message: 'Logo must be a PNG, JPEG or WEBP image',
  })
  @MaxLength(400_000, { message: 'Logo image too large (max ~300KB)' })
  logo?: string | null;

  @ApiPropertyOptional({ type: InvoiceTemplateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => InvoiceTemplateDto)
  invoiceTemplate?: InvoiceTemplateDto;

  @ApiPropertyOptional({ description: 'Enable the customer loyalty programme' })
  @IsOptional()
  @IsBoolean()
  loyaltyEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Points earned as % of invoice total (1 pt ≈ Re 1)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  loyaltyEarnPercent?: number;

  @ApiPropertyOptional({ description: 'Rupee value of one point when redeemed (default ₹1)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  loyaltyRedeemValue?: number;

  @ApiPropertyOptional({
    enum: ['invoice', 'estimate'],
    description: 'Which sales document Payment-In reconciles against',
  })
  @IsOptional()
  @IsIn(['invoice', 'estimate'])
  salesPaymentLink?: 'invoice' | 'estimate';

  @ApiPropertyOptional({
    enum: ['purchase', 'purchaseEstimate'],
    description: 'Which purchase document Payment-Out reconciles against',
  })
  @IsOptional()
  @IsIn(['purchase', 'purchaseEstimate'])
  purchasePaymentLink?: 'purchase' | 'purchaseEstimate';
}
