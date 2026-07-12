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

export class RegisterDto {
  @ApiProperty({ example: 'Naveen' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'owner@business.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+919876543210' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[0-9][0-9\s\-()]{6,18}$/, {
    message: 'Enter a valid phone number',
  })
  phone: string;

  @ApiProperty({ minLength: 8, example: 'a-strong-password' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiPropertyOptional({ enum: ['BUSINESS', 'AUDITOR'], default: 'BUSINESS' })
  @IsOptional()
  @IsIn(['BUSINESS', 'AUDITOR'])
  accountType?: 'BUSINESS' | 'AUDITOR';
}

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
