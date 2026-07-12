import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { InvoiceStatus, Role } from '@prisma/client';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import { PrismaService } from '../prisma/prisma.service';

class CreateBranchDto {
  @ApiProperty({ example: 'Coimbatore Main' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: 'Coimbatore' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;
}

class UpdateBranchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

const ADMINS = [Role.OWNER, Role.ADMIN] as const;

@ApiTags('branches')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/branches')
class BranchesController {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List branches' })
  list(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.prisma.branch.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Post()
  @CompanyRoles(...ADMINS)
  @ApiOperation({ summary: 'Create a branch' })
  async create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateBranchDto,
  ) {
    const existing = await this.prisma.branch.findUnique({
      where: { companyId_name: { companyId, name: dto.name.trim() } },
    });
    if (existing) {
      throw new BadRequestException('A branch with this name already exists');
    }
    return this.prisma.branch.create({
      data: { companyId, name: dto.name.trim(), city: dto.city },
    });
  }

  @Patch(':branchId')
  @CompanyRoles(...ADMINS)
  @ApiOperation({ summary: 'Rename / deactivate a branch' })
  async update(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: UpdateBranchDto,
  ) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, companyId },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    if (dto.name && dto.name.trim() !== branch.name) {
      const taken = await this.prisma.branch.findUnique({
        where: { companyId_name: { companyId, name: dto.name.trim() } },
      });
      if (taken) {
        throw new BadRequestException('A branch with this name already exists');
      }
    }
    return this.prisma.branch.update({
      where: { id: branchId },
      data: {
        name: dto.name?.trim(),
        city: dto.city,
        isActive: dto.isActive,
      },
    });
  }

  @Get('performance')
  @ApiOperation({ summary: 'Branch-wise sales / purchases / outstanding (current FY)' })
  async performance(@Param('companyId', ParseUUIDPipe) companyId: string) {
    const [branches, invoices, bills] = await Promise.all([
      this.prisma.branch.findMany({ where: { companyId } }),
      this.prisma.invoice.findMany({
        where: { companyId, status: InvoiceStatus.ISSUED },
        include: {
          payments: { select: { amount: true } },
          creditNotes: { where: { status: 'ISSUED' }, select: { total: true } },
        },
      }),
      this.prisma.purchaseBill.groupBy({
        by: ['branchId'],
        where: { companyId, status: InvoiceStatus.ISSUED },
        _sum: { total: true },
        _count: true,
      }),
    ]);

    const billByBranch = new Map(
      bills.map((b) => [
        b.branchId ?? 'unassigned',
        { purchases: Number(b._sum.total ?? 0), billCount: b._count },
      ]),
    );

    const rows = new Map<
      string,
      {
        branchId: string | null;
        name: string;
        sales: number;
        invoiceCount: number;
        outstanding: number;
        purchases: number;
        billCount: number;
      }
    >();
    const ensure = (branchId: string | null, name: string) => {
      const key = branchId ?? 'unassigned';
      if (!rows.has(key)) {
        rows.set(key, {
          branchId,
          name,
          sales: 0,
          invoiceCount: 0,
          outstanding: 0,
          purchases: billByBranch.get(key)?.purchases ?? 0,
          billCount: billByBranch.get(key)?.billCount ?? 0,
        });
      }
      return rows.get(key)!;
    };

    for (const branch of branches) ensure(branch.id, branch.name);
    ensure(null, 'Unassigned');

    const branchName = new Map(branches.map((b) => [b.id, b.name]));
    for (const inv of invoices) {
      const row = ensure(
        inv.branchId,
        inv.branchId ? (branchName.get(inv.branchId) ?? 'Unknown') : 'Unassigned',
      );
      const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
      const noted = inv.creditNotes.reduce((s, n) => s + Number(n.total), 0);
      row.sales += Number(inv.total);
      row.invoiceCount += 1;
      row.outstanding += Math.max(0, Number(inv.total) - paid - noted);
    }

    return [...rows.values()]
      .map((row) => ({
        ...row,
        sales: Math.round(row.sales * 100) / 100,
        outstanding: Math.round(row.outstanding * 100) / 100,
        purchases: Math.round(row.purchases * 100) / 100,
      }))
      .filter(
        (row) =>
          row.branchId !== null ||
          row.sales > 0 ||
          row.purchases > 0 ||
          row.invoiceCount > 0,
      )
      .sort((a, b) => b.sales - a.sales);
  }
}

@Module({
  controllers: [BranchesController],
})
export class BranchesModule {}
