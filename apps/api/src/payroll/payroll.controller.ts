import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Request, Response } from 'express';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import { FeatureGuard, RequiresFeature } from '../licensing/feature.guard';
import {
  CreateEmployeeDto,
  CreatePayRunDto,
  PayPayRunDto,
  PostPayRunDto,
  UpdateEmployeeDto,
  UpdatePayLineDto,
} from './dto/payroll.dto';
import { PayrollService } from './payroll.service';
import { PayslipPdfService } from './payslip-pdf.service';

/**
 * Salary data is sensitive — the whole module is limited to the roles
 * that run the books. (Class-level guard; no per-route overrides.)
 */
@ApiTags('payroll')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard, FeatureGuard)
@CompanyRoles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
@RequiresFeature('payroll')
@Controller('companies/:companyId')
export class PayrollController {
  constructor(
    private readonly payroll: PayrollService,
    private readonly pdf: PayslipPdfService,
  ) {}

  // ---- Employees ----

  @Get('employees')
  @ApiOperation({ summary: 'List employees with salary structure' })
  listEmployees(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.payroll.listEmployees(companyId);
  }

  @Post('employees')
  @ApiOperation({ summary: 'Add an employee' })
  createEmployee(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.payroll.createEmployee(companyId, dto);
  }

  @Patch('employees/:employeeId')
  @ApiOperation({ summary: 'Update an employee / salary structure' })
  updateEmployee(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.payroll.updateEmployee(companyId, employeeId, dto);
  }

  // ---- Pay runs ----

  @Get('payroll/runs')
  @ApiOperation({ summary: 'List pay runs with totals' })
  listRuns(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.payroll.listRuns(companyId);
  }

  @Post('payroll/runs')
  @ApiOperation({ summary: 'Compute a draft pay run for a month' })
  createRun(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePayRunDto,
  ) {
    return this.payroll.createRun(companyId, user.id, dto);
  }

  @Get('payroll/runs/:runId')
  @ApiOperation({ summary: 'Pay run detail with payslip lines' })
  getRun(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
  ) {
    return this.payroll.getRun(companyId, runId);
  }

  @Patch('payroll/runs/:runId/lines/:lineId')
  @ApiOperation({ summary: 'Adjust attendance / TDS on a draft payslip' })
  updateLine(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: UpdatePayLineDto,
  ) {
    return this.payroll.updateLine(companyId, runId, lineId, dto);
  }

  @Post('payroll/runs/:runId/post')
  @ApiOperation({ summary: 'Post the run to the books (JOURNAL voucher)' })
  postRun(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: PostPayRunDto,
  ) {
    return this.payroll.postRun(companyId, runId, user.id, dto);
  }

  @Post('payroll/runs/:runId/pay')
  @ApiOperation({ summary: 'Pay salaries out of a cash/bank ledger (PAYMENT voucher)' })
  payRun(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: PayPayRunDto,
  ) {
    return this.payroll.payRun(companyId, runId, user.id, dto);
  }

  @Post('payroll/runs/:runId/cancel')
  @ApiOperation({ summary: 'Cancel a run (drafts are deleted; posted runs reverse the voucher)' })
  cancelRun(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
  ) {
    return this.payroll.cancelRun(companyId, runId);
  }

  @Get('payroll/runs/:runId/bank-advice')
  @ApiOperation({ summary: 'Bank advice CSV (net pay + bank details) for manual payout' })
  async bankAdvice(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { csv, fileName } = await this.payroll.bankAdviceCsv(companyId, runId);
    this.sendCsv(res, csv, fileName);
  }

  @Get('payroll/runs/:runId/register')
  @ApiOperation({ summary: 'Salary register CSV (all components, all employees)' })
  async salaryRegister(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { csv, fileName } = await this.payroll.salaryRegisterCsv(companyId, runId);
    this.sendCsv(res, csv, fileName);
  }

  private sendCsv(res: Response, csv: string, fileName: string): void {
    res
      .status(200)
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': Buffer.byteLength(csv),
      })
      .end(csv);
  }

  @Get('payroll/runs/:runId/payslips/:lineId/pdf')
  @ApiOperation({ summary: 'Download one payslip as PDF' })
  async payslipPdf(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Res() res: Response,
    @Req() req: Request,
    @Query('lang') lang?: string,
  ): Promise<void> {
    const data = await this.payroll.getPayslipData(companyId, runId, lineId);
    const locale =
      lang ?? (req.cookies as Record<string, string> | undefined)?.['sa.locale'];
    const buffer = await this.pdf.render(data, locale);
    const fileName = `PAYSLIP-${data.employee.code}-${data.payRun.year}-${String(data.payRun.month).padStart(2, '0')}.pdf`;
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': buffer.length,
      })
      .end(buffer);
  }
}
