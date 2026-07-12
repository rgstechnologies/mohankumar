import {
  Controller,
  Get,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PayRunStatus } from '@prisma/client';
import type { Request, Response } from 'express';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { PayslipPdfService } from '../payroll/payslip-pdf.service';
import { periodLabel } from '../payroll/payroll.math';
import { PayrollModule } from '../payroll/payroll.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Employee self-service: a logged-in user sees ONLY the payslips of Employee
 * records linked to their account (matched by email at registration or by an
 * admin setting the employee email). No company membership, no company data.
 */
@ApiTags('portal')
@ApiBearerAuth()
@Controller('portal')
class PortalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payslipPdf: PayslipPdfService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'My employments (linked employee records)' })
  async me(@CurrentUser() user: AuthUser) {
    const employments = await this.prisma.employee.findMany({
      where: { userId: user.id },
      include: {
        company: { select: { name: true } },
        branch: { select: { name: true } },
      },
      orderBy: { joinDate: 'desc' },
    });
    return employments.map((e) => ({
      employeeId: e.id,
      company: e.company.name,
      branch: e.branch?.name ?? null,
      code: e.code,
      name: e.name,
      designation: e.designation,
      joinDate: e.joinDate,
      exitDate: e.exitDate,
      isActive: e.isActive,
    }));
  }

  @Get('payslips')
  @ApiOperation({ summary: 'My payslips across all linked employments' })
  async payslips(@CurrentUser() user: AuthUser) {
    const lines = await this.prisma.payRunLine.findMany({
      where: {
        employee: { userId: user.id },
        payRun: { status: { in: [PayRunStatus.POSTED, PayRunStatus.PAID] } },
      },
      include: {
        employee: { select: { id: true, code: true, company: { select: { name: true } } } },
        payRun: { select: { id: true, year: true, month: true, status: true } },
      },
      orderBy: [{ payRun: { year: 'desc' } }, { payRun: { month: 'desc' } }],
      take: 60,
    });
    return lines.map((line) => ({
      lineId: line.id,
      runId: line.payRun.id,
      company: line.employee.company.name,
      period: periodLabel(line.payRun.year, line.payRun.month),
      year: line.payRun.year,
      month: line.payRun.month,
      status: line.payRun.status,
      workingDays: Number(line.workingDays),
      lopDays: Number(line.lopDays),
      gross: Number(line.gross),
      totalDeductions: Number(line.totalDeductions),
      netPay: Number(line.netPay),
    }));
  }

  @Get('payslips/:lineId/pdf')
  @ApiOperation({ summary: 'Download one of MY payslips as PDF' })
  async payslipPdfDownload(
    @CurrentUser() user: AuthUser,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Res() res: Response,
    @Req() req: Request,
    @Query('lang') lang?: string,
  ): Promise<void> {
    // Ownership is the filter — a foreign lineId simply does not exist here.
    const line = await this.prisma.payRunLine.findFirst({
      where: {
        id: lineId,
        employee: { userId: user.id },
        payRun: { status: { in: [PayRunStatus.POSTED, PayRunStatus.PAID] } },
      },
      include: {
        employee: { include: { branch: { select: { name: true } } } },
        payRun: { include: { company: true } },
      },
    });
    if (!line) throw new NotFoundException('Payslip not found');

    const locale =
      lang ?? (req.cookies as Record<string, string> | undefined)?.['sa.locale'];
    const buffer = await this.payslipPdf.render(line, locale);
    const fileName = `PAYSLIP-${line.employee.code}-${line.payRun.year}-${String(line.payRun.month).padStart(2, '0')}.pdf`;
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

@Module({
  imports: [PayrollModule],
  controllers: [PortalController],
})
export class PortalModule {}
