import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { GST_RATES } from '../../common/validation';

/** Record a business expense (posts a PAYMENT voucher: Dr category, Cr cash/bank). */
export class CreateExpenseDto {
  @ApiProperty({ example: '2026-06-14' })
  @IsDateString()
  date: string;

  @ApiProperty({ description: 'Expense category — a ledger under an EXPENSE group' })
  @IsUUID()
  categoryLedgerId: string;

  @ApiProperty({ description: 'Cash/bank ledger the money was paid from' })
  @IsUUID()
  paidFromLedgerId: string;

  @ApiProperty({ example: 2500, description: 'Taxable (pre-GST) amount in rupees' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ enum: GST_RATES, description: 'GST rate for input credit (omit/0 = no GST)' })
  @IsOptional()
  @IsIn(GST_RATES as unknown as number[])
  gstRate?: number;

  @ApiPropertyOptional({ description: 'Inter-state purchase → IGST instead of CGST+SGST' })
  @IsOptional()
  @IsBoolean()
  isInterState?: boolean;

  @ApiPropertyOptional({ description: 'Party this was paid to (for the narration)' })
  @IsOptional()
  @IsUUID()
  partyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

/** Record other income (posts a RECEIPT voucher: Dr cash/bank, Cr category). */
export class CreateOtherIncomeDto {
  @ApiProperty({ example: '2026-06-14' })
  @IsDateString()
  date: string;

  @ApiProperty({ description: 'Income category — a ledger under an INCOME group' })
  @IsUUID()
  categoryLedgerId: string;

  @ApiProperty({ description: 'Cash/bank ledger the money was received into' })
  @IsUUID()
  receivedIntoLedgerId: string;

  @ApiProperty({ example: 1500, description: 'Amount in rupees' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
