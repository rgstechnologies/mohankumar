import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import { AccountingService } from './accounting.service';
import { CreateLedgerDto, CreateVoucherDto } from './dto/accounting.dto';

const BOOKKEEPERS = [
  Role.OWNER,
  Role.ADMIN,
  Role.ACCOUNTANT,
] as const;

const VOUCHER_CREATORS = [...BOOKKEEPERS, Role.CASHIER] as const;

@ApiTags('accounting')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId')
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  // ---- Chart of accounts ----

  @Get('account-groups')
  @ApiOperation({ summary: 'Account group tree' })
  listGroups(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.accounting.listGroups(companyId);
  }

  // ---- Ledgers ----

  @Post('ledgers')
  @CompanyRoles(...BOOKKEEPERS)
  @ApiOperation({ summary: 'Create a ledger' })
  createLedger(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateLedgerDto,
  ) {
    return this.accounting.createLedger(companyId, dto);
  }

  @Get('ledgers')
  @ApiOperation({ summary: 'List ledgers with current balances' })
  listLedgers(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.accounting.listLedgers(companyId);
  }

  @Get('ledgers/:ledgerId/statement')
  @ApiOperation({ summary: 'Ledger statement with running balance' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  ledgerStatement(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('ledgerId', ParseUUIDPipe) ledgerId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accounting.ledgerStatement(companyId, ledgerId, from, to);
  }

  // ---- Vouchers ----

  @Post('vouchers')
  @CompanyRoles(...VOUCHER_CREATORS)
  @ApiOperation({ summary: 'Post a voucher (double-entry, must balance)' })
  createVoucher(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateVoucherDto,
  ) {
    return this.accounting.createVoucher(companyId, user.id, dto);
  }

  @Get('vouchers')
  @ApiOperation({ summary: 'List vouchers (filter by type/date)' })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  listVouchers(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accounting.listVouchers(companyId, { type, from, to });
  }

  @Get('vouchers/:voucherId')
  @ApiOperation({ summary: 'Voucher detail' })
  getVoucher(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('voucherId', ParseUUIDPipe) voucherId: string,
  ) {
    return this.accounting.getVoucher(companyId, voucherId);
  }

  @Post('vouchers/:voucherId/cancel')
  @CompanyRoles(...BOOKKEEPERS)
  @ApiOperation({ summary: 'Cancel a voucher (audit trail preserved)' })
  cancelVoucher(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('voucherId', ParseUUIDPipe) voucherId: string,
  ) {
    return this.accounting.cancelVoucher(companyId, voucherId);
  }
}
