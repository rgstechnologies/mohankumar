import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ReferralDiscountType, SubscriptionStatus } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateReferralCodeDto {
  @ApiProperty({ example: 'WELCOME20' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9_-]{3,40}$/, { message: 'Code: 3-40 letters/digits/-/_' })
  code: string;

  @ApiPropertyOptional({ example: 'Launch campaign' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiProperty({ enum: ReferralDiscountType, example: ReferralDiscountType.PERCENT })
  @IsEnum(ReferralDiscountType)
  discountType: ReferralDiscountType;

  @ApiProperty({ example: 20, description: 'Percent (0-100) or flat ₹ off' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  discountValue: number;

  @ApiPropertyOptional({ description: 'Max redemptions; omit for unlimited' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}

export class UpdateReferralCodeDto extends PartialType(CreateReferralCodeDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAdminUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isSuperAdmin?: boolean;
}

export class UpdateSubscriptionDto {
  @ApiProperty({ example: 'BUSINESS' })
  @IsString()
  @IsNotEmpty()
  planCode: string;

  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ApiPropertyOptional({ description: 'null clears the expiry (no end date)', nullable: true })
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreatePlanDto {
  @ApiProperty({ example: 'PRO' })
  @Matches(/^[A-Z0-9_]{2,20}$/, { message: 'Code must be 2-20 uppercase letters/digits' })
  code: string;

  @ApiProperty({ example: 'Professional' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceMonthly?: number;

  @ApiPropertyOptional({ default: 1, description: '-1 = unlimited' })
  @IsOptional()
  @IsInt()
  @Min(-1)
  maxCompanies?: number;

  @ApiPropertyOptional({ default: -1, description: '-1 = unlimited' })
  @IsOptional()
  @IsInt()
  @Min(-1)
  maxBranches?: number;

  @ApiPropertyOptional({ default: -1, description: '-1 = unlimited' })
  @IsOptional()
  @IsInt()
  @Min(-1)
  maxMembers?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;

  @ApiPropertyOptional({ example: { payroll: true } })
  @IsOptional()
  @IsObject()
  features?: Record<string, boolean>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdatePlanDto extends PartialType(CreatePlanDto) {}
