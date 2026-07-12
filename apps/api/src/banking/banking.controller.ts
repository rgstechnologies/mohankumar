import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import { BankingService } from './banking.service';

const BOOKKEEPERS = [Role.OWNER, Role.ADMIN, Role.ACCOUNTANT] as const;

class ImportStatementDto {
  @ApiProperty({ example: 'hdfc-june.csv' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fileName?: string;

  @ApiProperty({ description: 'Raw CSV text of the bank statement' })
  @IsString()
  @IsNotEmpty()
  csv: string;
}

class MatchDto {
  @ApiProperty({ description: 'Book entry (voucher line) to link' })
  @IsUUID()
  voucherLineId: string;
}

class CreateFromLineDto {
  @ApiProperty({ description: 'Counter ledger (e.g. Bank Charges, a customer)' })
  @IsUUID()
  counterLedgerId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  narration?: string;
}

@ApiTags('banking')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/banking')
export class BankingController {
  constructor(private readonly banking: BankingService) {}

  @Get('ledgers')
  @ApiOperation({ summary: 'Cash/bank ledgers available for reconciliation' })
  bankLedgers(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.banking.bankLedgers(companyId);
  }

  @Post(':ledgerId/import')
  @CompanyRoles(...BOOKKEEPERS)
  @ApiOperation({ summary: 'Import a bank statement CSV (auto-matches entries)' })
  importStatement(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('ledgerId', ParseUUIDPipe) ledgerId: string,
    @Body() dto: ImportStatementDto,
  ) {
    return this.banking.importStatement(
      companyId,
      ledgerId,
      dto.fileName ?? 'statement.csv',
      dto.csv,
    );
  }

  @Get(':ledgerId/reconciliation')
  @ApiOperation({ summary: 'Reconciliation view: statement vs books' })
  reconciliation(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('ledgerId', ParseUUIDPipe) ledgerId: string,
  ) {
    return this.banking.reconciliation(companyId, ledgerId);
  }

  @Post('lines/:lineId/match')
  @CompanyRoles(...BOOKKEEPERS)
  @ApiOperation({ summary: 'Manually match a statement line to a book entry' })
  match(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: MatchDto,
  ) {
    return this.banking.match(companyId, lineId, dto.voucherLineId);
  }

  @Post('lines/:lineId/create-voucher')
  @CompanyRoles(...BOOKKEEPERS)
  @ApiOperation({
    summary: 'Book a missing voucher for a statement line and match it',
  })
  createFromLine(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateFromLineDto,
  ) {
    return this.banking.createVoucherFromLine(
      companyId,
      user.id,
      lineId,
      dto.counterLedgerId,
      dto.narration,
    );
  }

  @Post('lines/:lineId/unmatch')
  @CompanyRoles(...BOOKKEEPERS)
  @ApiOperation({ summary: 'Remove a match' })
  unmatch(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.banking.unmatch(companyId, lineId);
  }
}
