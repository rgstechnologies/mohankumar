import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EntryType,
  PayRunStatus,
  Prisma,
  VoucherStatus,
  VoucherType,
} from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateEmployeeDto,
  CreatePayRunDto,
  PayPayRunDto,
  PostPayRunDto,
  UpdateEmployeeDto,
  UpdatePayLineDto,
} from './dto/payroll.dto';
import {
  computePayLine,
  daysInMonth,
  periodEnd,
  periodLabel,
  type SalaryStructure,
} from './payroll.math';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Payroll ledgers, created on first posting (find-or-create by name). */
const PAYROLL_LEDGERS: { name: string; group: string }[] = [
  { name: 'Salaries & Wages', group: 'Indirect Expenses' },
  { name: 'Employer PF Contribution', group: 'Indirect Expenses' },
  { name: 'Employer ESI Contribution', group: 'Indirect Expenses' },
  { name: 'PF Payable', group: 'Duties & Taxes' },
  { name: 'ESI Payable', group: 'Duties & Taxes' },
  { name: 'Professional Tax Payable', group: 'Duties & Taxes' },
  { name: 'TDS Payable (Salary)', group: 'Duties & Taxes' },
  { name: 'Salaries Payable', group: 'Current Liabilities' },
];

@Injectable()
export class PayrollService {
  /** Portal link: employees whose email matches an existing account. */
  private async linkUserByEmail(email?: string | null): Promise<string | null> {
    if (!email) return null;
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  // -------------------------------------------------------------
  // Employees
  // -------------------------------------------------------------

  private serializeEmployee(e: {
    [key: string]: unknown;
    basic: Prisma.Decimal;
    hra: Prisma.Decimal;
    conveyance: Prisma.Decimal;
    otherAllowances: Prisma.Decimal;
    ptMonthly: Prisma.Decimal;
    tdsMonthly: Prisma.Decimal;
  }) {
    const monthlyGross = r2(
      Number(e.basic) + Number(e.hra) + Number(e.conveyance) + Number(e.otherAllowances),
    );
    return {
      ...e,
      basic: Number(e.basic),
      hra: Number(e.hra),
      conveyance: Number(e.conveyance),
      otherAllowances: Number(e.otherAllowances),
      ptMonthly: Number(e.ptMonthly),
      tdsMonthly: Number(e.tdsMonthly),
      monthlyGross,
    };
  }

  async listEmployees(companyId: string) {
    const employees = await this.prisma.employee.findMany({
      where: { companyId },
      include: { branch: { select: { id: true, name: true } } },
      orderBy: { code: 'asc' },
      take: 500,
    });
    return employees.map((e) => this.serializeEmployee(e));
  }

  private async validateBranch(companyId: string, branchId?: string) {
    if (!branchId) return;
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, companyId, isActive: true },
    });
    if (!branch) throw new BadRequestException('Unknown branch');
  }

  async createEmployee(companyId: string, dto: CreateEmployeeDto) {
    const code = dto.code.trim();
    const existing = await this.prisma.employee.findUnique({
      where: { companyId_code: { companyId, code } },
    });
    if (existing) {
      throw new ConflictException('An employee with this code already exists');
    }
    await this.validateBranch(companyId, dto.branchId);

    const employee = await this.prisma.employee.create({
      data: {
        companyId,
        code,
        name: dto.name.trim(),
        designation: dto.designation,
        email: dto.email,
        userId: await this.linkUserByEmail(dto.email),
        phone: dto.phone,
        joinDate: new Date(dto.joinDate),
        exitDate: dto.exitDate ? new Date(dto.exitDate) : null,
        pan: dto.pan,
        uan: dto.uan,
        esiNo: dto.esiNo,
        bankName: dto.bankName,
        bankAccountNo: dto.bankAccountNo,
        bankIfsc: dto.bankIfsc,
        branchId: dto.branchId ?? null,
        basic: dto.basic,
        hra: dto.hra ?? 0,
        conveyance: dto.conveyance ?? 0,
        otherAllowances: dto.otherAllowances ?? 0,
        pfEnabled: dto.pfEnabled ?? true,
        esiEnabled: dto.esiEnabled ?? true,
        ptMonthly: dto.ptMonthly ?? 0,
        tdsMonthly: dto.tdsMonthly ?? 0,
      },
      include: { branch: { select: { id: true, name: true } } },
    });
    return this.serializeEmployee(employee);
  }

  async updateEmployee(companyId: string, employeeId: string, dto: UpdateEmployeeDto) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    if (dto.code && dto.code.trim() !== employee.code) {
      const taken = await this.prisma.employee.findUnique({
        where: { companyId_code: { companyId, code: dto.code.trim() } },
      });
      if (taken) throw new ConflictException('An employee with this code already exists');
    }
    await this.validateBranch(companyId, dto.branchId);

    const updated = await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        code: dto.code?.trim(),
        name: dto.name?.trim(),
        designation: dto.designation,
        email: dto.email,
        // Changing the email re-links (or unlinks) the portal account.
        userId:
          dto.email === undefined
            ? undefined
            : await this.linkUserByEmail(dto.email),
        phone: dto.phone,
        joinDate: dto.joinDate ? new Date(dto.joinDate) : undefined,
        exitDate: dto.exitDate === undefined ? undefined : dto.exitDate ? new Date(dto.exitDate) : null,
        pan: dto.pan,
        uan: dto.uan,
        esiNo: dto.esiNo,
        bankName: dto.bankName,
        bankAccountNo: dto.bankAccountNo,
        bankIfsc: dto.bankIfsc,
        branchId: dto.branchId,
        basic: dto.basic,
        hra: dto.hra,
        conveyance: dto.conveyance,
        otherAllowances: dto.otherAllowances,
        pfEnabled: dto.pfEnabled,
        esiEnabled: dto.esiEnabled,
        ptMonthly: dto.ptMonthly,
        tdsMonthly: dto.tdsMonthly,
        isActive: dto.isActive,
      },
      include: { branch: { select: { id: true, name: true } } },
    });
    return this.serializeEmployee(updated);
  }

  // -------------------------------------------------------------
  // Pay runs
  // -------------------------------------------------------------

  private readonly runInclude = {
    lines: {
      orderBy: { employee: { code: 'asc' } } as const,
      include: {
        employee: {
          select: { id: true, code: true, name: true, designation: true },
        },
      },
    },
  };

  private serializeRun(run: {
    [key: string]: unknown;
    id: string;
    year: number;
    month: number;
    status: PayRunStatus;
    narration: string | null;
    voucherId: string | null;
    paymentVoucherId: string | null;
    lines: ({
      [key: string]: unknown;
      employee: { id: string; code: string; name: string; designation: string | null };
    } & Record<
      | 'workingDays' | 'lopDays' | 'basic' | 'hra' | 'conveyance' | 'otherAllowances'
      | 'gross' | 'pfEmployee' | 'pfEmployer' | 'esiEmployee' | 'esiEmployer'
      | 'pt' | 'tds' | 'totalDeductions' | 'netPay',
      Prisma.Decimal
    > & { id: string })[];
  }) {
    const lines = run.lines.map((l) => ({
      id: l.id,
      employee: l.employee,
      workingDays: Number(l.workingDays),
      lopDays: Number(l.lopDays),
      basic: Number(l.basic),
      hra: Number(l.hra),
      conveyance: Number(l.conveyance),
      otherAllowances: Number(l.otherAllowances),
      gross: Number(l.gross),
      pfEmployee: Number(l.pfEmployee),
      pfEmployer: Number(l.pfEmployer),
      esiEmployee: Number(l.esiEmployee),
      esiEmployer: Number(l.esiEmployer),
      pt: Number(l.pt),
      tds: Number(l.tds),
      totalDeductions: Number(l.totalDeductions),
      netPay: Number(l.netPay),
    }));
    const sum = (pick: (l: (typeof lines)[number]) => number) =>
      r2(lines.reduce((s, l) => s + pick(l), 0));
    return {
      id: run.id,
      year: run.year,
      month: run.month,
      period: periodLabel(run.year, run.month),
      status: run.status,
      narration: run.narration,
      voucherId: run.voucherId,
      paymentVoucherId: run.paymentVoucherId,
      employeeCount: lines.length,
      totals: {
        gross: sum((l) => l.gross),
        pfEmployee: sum((l) => l.pfEmployee),
        pfEmployer: sum((l) => l.pfEmployer),
        esiEmployee: sum((l) => l.esiEmployee),
        esiEmployer: sum((l) => l.esiEmployer),
        pt: sum((l) => l.pt),
        tds: sum((l) => l.tds),
        deductions: sum((l) => l.totalDeductions),
        netPay: sum((l) => l.netPay),
        employerCost: r2(
          sum((l) => l.gross) + sum((l) => l.pfEmployer) + sum((l) => l.esiEmployer),
        ),
      },
      lines,
    };
  }

  async listRuns(companyId: string) {
    const runs = await this.prisma.payRun.findMany({
      where: { companyId },
      include: this.runInclude,
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { createdAt: 'desc' }],
      take: 60,
    });
    return runs.map((run) => this.serializeRun(run));
  }

  async getRun(companyId: string, runId: string) {
    const run = await this.prisma.payRun.findFirst({
      where: { id: runId, companyId },
      include: this.runInclude,
    });
    if (!run) throw new NotFoundException('Pay run not found');
    return this.serializeRun(run);
  }

  private structureOf(e: {
    basic: Prisma.Decimal;
    hra: Prisma.Decimal;
    conveyance: Prisma.Decimal;
    otherAllowances: Prisma.Decimal;
    pfEnabled: boolean;
    esiEnabled: boolean;
    ptMonthly: Prisma.Decimal;
    tdsMonthly: Prisma.Decimal;
  }): SalaryStructure {
    return {
      basic: Number(e.basic),
      hra: Number(e.hra),
      conveyance: Number(e.conveyance),
      otherAllowances: Number(e.otherAllowances),
      pfEnabled: e.pfEnabled,
      esiEnabled: e.esiEnabled,
      ptMonthly: Number(e.ptMonthly),
      tdsMonthly: Number(e.tdsMonthly),
    };
  }

  async createRun(companyId: string, userId: string, dto: CreatePayRunDto) {
    const open = await this.prisma.payRun.findFirst({
      where: {
        companyId,
        year: dto.year,
        month: dto.month,
        status: { not: PayRunStatus.CANCELLED },
      },
    });
    if (open) {
      throw new ConflictException(
        `A pay run for ${periodLabel(dto.year, dto.month)} already exists`,
      );
    }

    const monthStart = new Date(Date.UTC(dto.year, dto.month - 1, 1));
    const monthEnd = new Date(periodEnd(dto.year, dto.month));
    const employees = await this.prisma.employee.findMany({
      where: {
        companyId,
        isActive: true,
        joinDate: { lte: monthEnd },
        OR: [{ exitDate: null }, { exitDate: { gte: monthStart } }],
      },
      orderBy: { code: 'asc' },
    });
    if (employees.length === 0) {
      throw new BadRequestException(
        'No active employees for this period — add employees first',
      );
    }

    const workingDays = daysInMonth(dto.year, dto.month);
    const run = await this.prisma.payRun.create({
      data: {
        companyId,
        year: dto.year,
        month: dto.month,
        narration: `Payroll ${periodLabel(dto.year, dto.month)}`,
        createdById: userId,
        lines: {
          create: employees.map((e) => {
            const amounts = computePayLine(this.structureOf(e), workingDays, 0);
            return { employeeId: e.id, workingDays, lopDays: 0, ...amounts };
          }),
        },
      },
      include: this.runInclude,
    });
    return this.serializeRun(run);
  }

  async updateLine(
    companyId: string,
    runId: string,
    lineId: string,
    dto: UpdatePayLineDto,
  ) {
    const run = await this.prisma.payRun.findFirst({
      where: { id: runId, companyId },
      include: { lines: { where: { id: lineId }, include: { employee: true } } },
    });
    if (!run || run.lines.length === 0) throw new NotFoundException('Payslip not found');
    if (run.status !== PayRunStatus.DRAFT) {
      throw new BadRequestException('Only draft pay runs can be edited');
    }
    const line = run.lines[0];
    const workingDays = dto.workingDays ?? Number(line.workingDays);
    const lopDays = dto.lopDays ?? Number(line.lopDays);
    if (lopDays > workingDays) {
      throw new BadRequestException('Loss-of-pay days cannot exceed working days');
    }
    const amounts = computePayLine(
      this.structureOf(line.employee),
      workingDays,
      lopDays,
      dto.tds,
    );
    await this.prisma.payRunLine.update({
      where: { id: lineId },
      data: { workingDays, lopDays, ...amounts },
    });
    return this.getRun(companyId, runId);
  }

  // -------------------------------------------------------------
  // Posting + payment
  // -------------------------------------------------------------

  /** Find-or-create the payroll ledgers; returns name → id. */
  private async ensurePayrollLedgers(companyId: string): Promise<Record<string, string>> {
    const groups = await this.prisma.accountGroup.findMany({
      where: {
        companyId,
        name: { in: [...new Set(PAYROLL_LEDGERS.map((l) => l.group))] },
      },
      select: { id: true, name: true },
    });
    const groupByName = new Map(groups.map((g) => [g.name, g.id]));

    const result: Record<string, string> = {};
    for (const spec of PAYROLL_LEDGERS) {
      const existing = await this.prisma.ledger.findUnique({
        where: { companyId_name: { companyId, name: spec.name } },
      });
      if (existing) {
        result[spec.name] = existing.id;
        continue;
      }
      const groupId = groupByName.get(spec.group);
      if (!groupId) {
        throw new BadRequestException(
          `Account group "${spec.group}" is missing — re-seed the chart of accounts`,
        );
      }
      const created = await this.prisma.ledger.create({
        data: { companyId, groupId, name: spec.name, isSystem: true },
      });
      result[spec.name] = created.id;
    }
    return result;
  }

  async postRun(companyId: string, runId: string, userId: string, dto: PostPayRunDto) {
    const run = await this.getRun(companyId, runId);
    if (run.status !== PayRunStatus.DRAFT) {
      throw new BadRequestException('Only draft pay runs can be posted');
    }
    const t = run.totals;
    if (t.gross <= 0) {
      throw new BadRequestException('Nothing to post — the run total is zero');
    }

    const ledgers = await this.ensurePayrollLedgers(companyId);
    const lines: { ledgerId: string; type: EntryType; amount: number }[] = [
      { ledgerId: ledgers['Salaries & Wages'], type: EntryType.DEBIT, amount: t.gross },
    ];
    if (t.pfEmployer > 0)
      lines.push({ ledgerId: ledgers['Employer PF Contribution'], type: EntryType.DEBIT, amount: t.pfEmployer });
    if (t.esiEmployer > 0)
      lines.push({ ledgerId: ledgers['Employer ESI Contribution'], type: EntryType.DEBIT, amount: t.esiEmployer });
    const pfTotal = r2(t.pfEmployee + t.pfEmployer);
    if (pfTotal > 0)
      lines.push({ ledgerId: ledgers['PF Payable'], type: EntryType.CREDIT, amount: pfTotal });
    const esiTotal = r2(t.esiEmployee + t.esiEmployer);
    if (esiTotal > 0)
      lines.push({ ledgerId: ledgers['ESI Payable'], type: EntryType.CREDIT, amount: esiTotal });
    if (t.pt > 0)
      lines.push({ ledgerId: ledgers['Professional Tax Payable'], type: EntryType.CREDIT, amount: t.pt });
    if (t.tds > 0)
      lines.push({ ledgerId: ledgers['TDS Payable (Salary)'], type: EntryType.CREDIT, amount: t.tds });
    if (t.netPay > 0)
      lines.push({ ledgerId: ledgers['Salaries Payable'], type: EntryType.CREDIT, amount: t.netPay });

    const voucherDto = {
      type: VoucherType.JOURNAL,
      date: dto.date ?? periodEnd(run.year, run.month),
      narration: `Payroll ${run.period}`,
      lines,
    };
    await this.accounting.validateVoucherInput(companyId, voucherDto);

    await this.prisma.$transaction(async (tx) => {
      const voucher = await this.accounting.postVoucherTx(tx, companyId, userId, voucherDto);
      await tx.payRun.update({
        where: { id: runId },
        data: { status: PayRunStatus.POSTED, voucherId: voucher.id },
      });
    });
    return this.getRun(companyId, runId);
  }

  async payRun(companyId: string, runId: string, userId: string, dto: PayPayRunDto) {
    const run = await this.getRun(companyId, runId);
    if (run.status !== PayRunStatus.POSTED) {
      throw new BadRequestException('Post the pay run before paying it out');
    }
    if (run.totals.netPay <= 0) {
      throw new BadRequestException('Nothing to pay — net total is zero');
    }
    // Salaries must leave a real cash/bank ledger — not, say, an expense or
    // payable ledger that would leave the books nonsensical.
    const payFrom = await this.prisma.ledger.findFirst({
      where: { id: dto.ledgerId, companyId },
      include: { group: { select: { name: true } } },
    });
    if (!payFrom) throw new BadRequestException('Unknown ledger');
    if (!/cash|bank/i.test(payFrom.group.name)) {
      throw new BadRequestException('Salaries must be paid from a cash or bank ledger');
    }
    const ledgers = await this.ensurePayrollLedgers(companyId);
    const voucherDto = {
      type: VoucherType.PAYMENT,
      date: dto.date,
      narration: `Salary payout — ${run.period}`,
      lines: [
        { ledgerId: ledgers['Salaries Payable'], type: EntryType.DEBIT, amount: run.totals.netPay },
        { ledgerId: dto.ledgerId, type: EntryType.CREDIT, amount: run.totals.netPay },
      ],
    };
    await this.accounting.validateVoucherInput(companyId, voucherDto);

    await this.prisma.$transaction(async (tx) => {
      const voucher = await this.accounting.postVoucherTx(tx, companyId, userId, voucherDto);
      await tx.payRun.update({
        where: { id: runId },
        data: { status: PayRunStatus.PAID, paymentVoucherId: voucher.id },
      });
    });
    return this.getRun(companyId, runId);
  }

  async cancelRun(companyId: string, runId: string) {
    const run = await this.prisma.payRun.findFirst({
      where: { id: runId, companyId },
    });
    if (!run) throw new NotFoundException('Pay run not found');

    if (run.status === PayRunStatus.DRAFT) {
      await this.prisma.payRun.delete({ where: { id: runId } });
      return { deleted: true };
    }
    if (run.status === PayRunStatus.PAID) {
      throw new BadRequestException(
        'Cannot cancel a paid run — reverse the payout voucher first',
      );
    }
    if (run.status === PayRunStatus.CANCELLED) {
      throw new BadRequestException('Pay run is already cancelled');
    }
    await this.prisma.$transaction(async (tx) => {
      if (run.voucherId) {
        await tx.voucher.update({
          where: { id: run.voucherId },
          data: { status: VoucherStatus.CANCELLED },
        });
      }
      await tx.payRun.update({
        where: { id: runId },
        data: { status: PayRunStatus.CANCELLED },
      });
    });
    return this.getRun(companyId, runId);
  }

  // -------------------------------------------------------------
  // Exports (no money movement — the owner takes these to their bank)
  // -------------------------------------------------------------

  /** RFC-4180 cell, with spreadsheet formula-injection neutralised. */
  private csvCell(value: string | number | null | undefined): string {
    const s = value === null || value === undefined ? '' : String(value);
    // A text cell starting with = + - @ (or a control char) can execute as a
    // formula when the CSV is opened in Excel/Sheets. Prefix a quote to defuse
    // it — but leave plain numbers (amounts, counts) untouched.
    const guarded =
      /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
    return /[",\r\n]/.test(guarded)
      ? `"${guarded.replace(/"/g, '""')}"`
      : guarded;
  }

  /** Build a CSV with a UTF-8 BOM so Excel renders employee names correctly. */
  private toCsv(
    headers: string[],
    rows: (string | number | null | undefined)[][],
  ): string {
    const lines = [headers, ...rows].map((row) =>
      row.map((cell) => this.csvCell(cell)).join(','),
    );
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  private async runForExport(companyId: string, runId: string) {
    const run = await this.prisma.payRun.findFirst({
      where: { id: runId, companyId },
      include: {
        lines: {
          orderBy: { employee: { code: 'asc' } },
          include: {
            employee: {
              select: {
                code: true,
                name: true,
                designation: true,
                email: true,
                bankName: true,
                bankAccountNo: true,
                bankIfsc: true,
              },
            },
          },
        },
      },
    });
    if (!run) throw new NotFoundException('Pay run not found');
    return run;
  }

  /**
   * Bank advice / payout file: one row per employee with net pay and bank
   * details, in a generic NEFT layout the owner uploads to their own bank.
   * Nexora never moves money — this is just the instruction file.
   */
  async bankAdviceCsv(companyId: string, runId: string) {
    const run = await this.runForExport(companyId, runId);
    if (run.status === PayRunStatus.DRAFT) {
      throw new BadRequestException('Post the pay run before exporting bank advice');
    }
    if (run.status === PayRunStatus.CANCELLED) {
      throw new BadRequestException('This pay run was cancelled — nothing to pay out');
    }
    const period = periodLabel(run.year, run.month);
    const headers = [
      'Employee Code',
      'Beneficiary Name',
      'Account Number',
      'IFSC',
      'Amount',
      'Mode',
      'Email',
      'Remarks',
    ];
    const rows = run.lines.map((l) => [
      l.employee.code,
      l.employee.name,
      l.employee.bankAccountNo ?? '',
      l.employee.bankIfsc ?? '',
      Number(l.netPay).toFixed(2),
      'NEFT',
      l.employee.email ?? '',
      `Salary ${period}`,
    ]);
    return {
      csv: this.toCsv(headers, rows),
      fileName: `BANK-ADVICE-${run.year}-${String(run.month).padStart(2, '0')}.csv`,
    };
  }

  /** Full salary register: every component for every employee, for records. */
  async salaryRegisterCsv(companyId: string, runId: string) {
    const run = await this.runForExport(companyId, runId);
    const headers = [
      'Employee Code',
      'Name',
      'Designation',
      'Working Days',
      'LOP Days',
      'Basic',
      'HRA',
      'Conveyance',
      'Other Allowances',
      'Gross',
      'PF (Employee)',
      'PF (Employer)',
      'ESI (Employee)',
      'ESI (Employer)',
      'Professional Tax',
      'TDS',
      'Total Deductions',
      'Net Pay',
      'Bank Name',
      'Account Number',
      'IFSC',
    ];
    const money = (d: Prisma.Decimal) => Number(d).toFixed(2);
    const rows = run.lines.map((l) => [
      l.employee.code,
      l.employee.name,
      l.employee.designation ?? '',
      Number(l.workingDays),
      Number(l.lopDays),
      money(l.basic),
      money(l.hra),
      money(l.conveyance),
      money(l.otherAllowances),
      money(l.gross),
      money(l.pfEmployee),
      money(l.pfEmployer),
      money(l.esiEmployee),
      money(l.esiEmployer),
      money(l.pt),
      money(l.tds),
      money(l.totalDeductions),
      money(l.netPay),
      l.employee.bankName ?? '',
      l.employee.bankAccountNo ?? '',
      l.employee.bankIfsc ?? '',
    ]);
    return {
      csv: this.toCsv(headers, rows),
      fileName: `SALARY-REGISTER-${run.year}-${String(run.month).padStart(2, '0')}.csv`,
    };
  }

  /** Everything the payslip PDF needs for one line. */
  async getPayslipData(companyId: string, runId: string, lineId: string) {
    const line = await this.prisma.payRunLine.findFirst({
      where: { id: lineId, payRunId: runId, payRun: { companyId } },
      include: {
        employee: { include: { branch: { select: { name: true } } } },
        payRun: { include: { company: true } },
      },
    });
    if (!line) throw new NotFoundException('Payslip not found');
    if (line.payRun.status === PayRunStatus.DRAFT) {
      throw new BadRequestException('Post the pay run before printing payslips');
    }
    return line;
  }
}
