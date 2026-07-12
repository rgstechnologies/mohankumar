import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateEmployeeDto {
  @ApiProperty({ example: 'EMP-001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code: string;

  @ApiProperty({ example: 'Kumar S' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: 'Sales Executive' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  designation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  joinDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  exitDate?: string;

  @ApiPropertyOptional({ example: 'ABCDE1234F' })
  @IsOptional()
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/, { message: 'PAN must look like ABCDE1234F' })
  pan?: string;

  @ApiPropertyOptional({ description: '12-digit PF UAN' })
  @IsOptional()
  @Matches(/^[0-9]{12}$/, { message: 'UAN must be 12 digits' })
  uan?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  esiNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  bankAccountNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/, { message: 'IFSC must look like HDFC0001234' })
  bankIfsc?: string;

  @ApiPropertyOptional({ description: 'Home branch' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({ example: 18000, description: 'Monthly basic (₹)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basic: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  hra?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  conveyance?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  otherAllowances?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  pfEnabled?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  esiEnabled?: boolean;

  @ApiPropertyOptional({ default: 0, description: 'Professional tax ₹/month' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  ptMonthly?: number;

  @ApiPropertyOptional({ default: 0, description: 'TDS ₹/month' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tdsMonthly?: number;
}

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreatePayRunDto {
  @ApiProperty({ example: 2026 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @ApiProperty({ example: 6, description: '1-12' })
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;
}

export class UpdatePayLineDto {
  @ApiPropertyOptional({ description: 'Defaults to calendar days of the month' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  workingDays?: number;

  @ApiPropertyOptional({ description: 'Loss-of-pay days' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  lopDays?: number;

  @ApiPropertyOptional({ description: 'Override the employee’s monthly TDS' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tds?: number;
}

export class PostPayRunDto {
  @ApiPropertyOptional({ description: 'Voucher date — defaults to the period’s last day' })
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class PayPayRunDto {
  @ApiProperty({ example: '2026-07-01' })
  @IsDateString()
  date: string;

  @ApiProperty({ description: 'Cash/bank ledger the salaries are paid from' })
  @IsUUID()
  ledgerId: string;
}
