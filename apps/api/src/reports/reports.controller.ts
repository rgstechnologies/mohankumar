import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Business overview KPIs' })
  dashboard(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.reports.dashboard(companyId);
  }

  @Get('reports/trial-balance')
  @ApiOperation({ summary: 'Trial Balance (as of date or date range)' })
  @ApiQuery({ name: 'asOf', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  trialBalance(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query('asOf') asOf?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.trialBalance(companyId, asOf, from, to);
  }

  @Get('reports/profit-loss')
  @ApiOperation({ summary: 'Profit & Loss (defaults to current FY)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  profitAndLoss(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.profitAndLoss(companyId, from, to);
  }

  @Get('reports/balance-sheet')
  @ApiOperation({ summary: 'Balance Sheet (as of date or date range)' })
  @ApiQuery({ name: 'asOf', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  balanceSheet(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query('asOf') asOf?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.balanceSheet(companyId, asOf, from, to);
  }

  @Get('reports/gstr1')
  @ApiOperation({ summary: 'GSTR-1 outward supplies (B2B, B2C, HSN summary)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  gstr1(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.gstr1(companyId, from, to);
  }

  @Get('reports/gstr3b')
  @ApiOperation({ summary: 'GSTR-3B summary (outward, ITC, net payable)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  gstr3b(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.gstr3b(companyId, from, to);
  }

  @Get('reports/sales')
  @ApiOperation({ summary: 'Sales report (invoices, payments, credit notes)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  salesReport(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.salesReport(companyId, from, to);
  }

  @Get('reports/estimates')
  @ApiOperation({ summary: 'Estimate report (estimates & advance payments)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  estimateReport(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.estimateReport(companyId, from, to);
  }
}
