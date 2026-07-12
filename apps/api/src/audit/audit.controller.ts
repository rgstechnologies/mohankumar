import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@CompanyRoles(Role.OWNER, Role.ADMIN)
@Controller('companies/:companyId/audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Who did what — latest mutating actions' })
  @ApiQuery({ name: 'q', required: false, description: 'Filter by action/email' })
  async list(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query('q') q?: string,
  ) {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        companyId,
        ...(q
          ? {
              OR: [
                { action: { contains: q, mode: 'insensitive' } },
                { userEmail: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return logs.map((log) => ({
      id: log.id,
      at: log.createdAt,
      user: log.userEmail ?? '—',
      method: log.method,
      action: log.action,
      status: log.status,
      ip: log.ip,
    }));
  }
}
