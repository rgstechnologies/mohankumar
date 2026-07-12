import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const BILLING_TYPES = [
  'one_time',
  'monthly',
  'annual',
  'retainer',
  'bundle',
  'custom',
] as const;

// ---- Auditor profile ----

export class CreateAuditorDto {
  @ApiProperty({ example: 'Sharma & Associates' })
  @IsString()
  @MaxLength(160)
  displayName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  firmName?: string;

  @ApiPropertyOptional({ example: 'GST & tax compliance for SMEs' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  tagline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  bio?: string;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsInt()
  @Min(0)
  experienceYrs?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'Tamil Nadu' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  state?: string;

  @ApiPropertyOptional({ description: 'Logo as a data: URL (PNG/JPEG/WEBP)' })
  @IsOptional()
  @IsString()
  @MaxLength(400_000)
  logo?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdateAuditorDto extends PartialType(CreateAuditorDto) {}

// ---- Service ----

export class CreateServiceDto {
  @ApiProperty({ example: 'GST Filing' })
  @IsString()
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ example: 'GST' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  shortDesc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  detailDesc?: string;

  @ApiPropertyOptional({ description: 'Service image as a data: URL' })
  @IsOptional()
  @IsString()
  @MaxLength(400_000)
  image?: string | null;

  @ApiPropertyOptional({ example: '3-5 days' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  deliveryTime?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateServiceDto extends PartialType(CreateServiceDto) {}

// ---- Pricing tier + features ----

export class TierFeatureDto {
  @ApiProperty({ example: 'GST Reconciliation' })
  @IsString()
  @MaxLength(160)
  label: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  included?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class CreateTierDto {
  @ApiProperty({ example: 'Premium' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 4999 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  gstApplicable?: boolean;

  @ApiPropertyOptional({ example: 18 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  gstPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: '3 days' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  deliveryTimeline?: string;

  @ApiPropertyOptional({ example: 3, description: 'Revisions included; omit for unlimited' })
  @IsOptional()
  @IsInt()
  @Min(0)
  revisions?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  prioritySupport?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  dedicatedConsultant?: boolean;

  @ApiPropertyOptional({ enum: BILLING_TYPES, default: 'one_time' })
  @IsOptional()
  @IsIn(BILLING_TYPES as unknown as string[])
  billingType?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ type: [TierFeatureDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TierFeatureDto)
  @ArrayMaxSize(100)
  features?: TierFeatureDto[];
}

export class UpdateTierDto extends PartialType(CreateTierDto) {}

// ---- Phase 2: client engagement ----

export const REQUEST_KINDS = ['ENQUIRY', 'SERVICE', 'CUSTOM_QUOTE'] as const;
export const REQUEST_STATUSES = [
  'NEW',
  'REVIEWING',
  'QUOTED',
  'ACCEPTED',
  'DECLINED',
  'CLOSED',
] as const;

export class CreateRequestDto {
  @ApiProperty({ enum: REQUEST_KINDS })
  @IsIn(REQUEST_KINDS as unknown as string[])
  kind: string;

  @ApiPropertyOptional({ description: 'Tier the client is interested in' })
  @IsOptional()
  @IsString()
  tierId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}

export class UpdateRequestStatusDto {
  @ApiProperty({ enum: REQUEST_STATUSES })
  @IsIn(REQUEST_STATUSES as unknown as string[])
  status: string;
}

export class GrantAccessDto {
  @ApiProperty({ description: 'Company to grant the auditor read-only access to' })
  @IsString()
  companyId: string;
}

export class CreateReviewDto {
  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class CreateQuotationDto {
  @ApiProperty({ example: 'Annual GST compliance package' })
  @IsString()
  @MaxLength(2000)
  description: string;

  @ApiProperty({ example: 24999 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  gstApplicable?: boolean;

  @ApiPropertyOptional({ example: 18 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  gstPercent?: number;

  @ApiPropertyOptional({ enum: BILLING_TYPES, default: 'one_time' })
  @IsOptional()
  @IsIn(BILLING_TYPES as unknown as string[])
  billingType?: string;

  @ApiPropertyOptional({ example: '2026-07-15' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
