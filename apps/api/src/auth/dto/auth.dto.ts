import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Fiscal-year label as shown on the login screen, e.g. "2026-27". */
const FISCAL_YEAR_PATTERN = /^\d{4}-\d{2}$/;

export class LoginDto {
  @ApiProperty({
    description: 'Email address or phone number',
    example: 'owner@business.com',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  identifier: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password: string;

  /**
   * The financial year to work in. Omitted = the current year. The books are
   * one continuous ledger; this only decides which year's documents you see
   * and which year new documents are numbered in.
   */
  @ApiPropertyOptional({ example: '2026-27', description: 'Financial year to open' })
  @IsOptional()
  @IsString()
  @Matches(FISCAL_YEAR_PATTERN, { message: 'Financial year must look like 2026-27' })
  fiscalYear?: string;
}


export class RefreshDto {
  @ApiPropertyOptional({ description: 'Falls back to the sa_refresh cookie' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'owner@business.com' })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token from the reset email' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

export class MfaCodeDto {
  @ApiProperty({ example: '123456', description: 'TOTP or recovery code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code: string;
}

export class MfaVerifyDto extends MfaCodeDto {
  @ApiProperty({ description: 'mfaToken returned by the login step' })
  @IsString()
  @IsNotEmpty()
  mfaToken: string;
}
