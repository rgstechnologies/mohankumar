import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { BranchScope } from '../companies/decorators/branch-scope.decorator';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import { CancelEWayBillDto, GenerateEWayBillDto } from './dto/ewaybill.dto';
import { EWayBillService } from './ewaybill.service';

const BILLING_ROLES = [
  Role.OWNER,
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.CASHIER,
  Role.BRANCH_MANAGER,
] as const;

@ApiTags('e-way-bill')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/invoices/:invoiceId/eway-bill')
export class EWayBillController {
  constructor(private readonly ewb: EWayBillService) {}

  @Get()
  @ApiOperation({ summary: 'Get the e-way bill status for an invoice' })
  get(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.ewb.get(companyId, invoiceId, branchScope);
  }

  @Post('generate')
  @CompanyRoles(...BILLING_ROLES)
  @ApiOperation({ summary: 'Generate an e-way bill with transport details' })
  generate(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() dto: GenerateEWayBillDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.ewb.generate(companyId, invoiceId, dto, branchScope);
  }

  @Post('cancel')
  @CompanyRoles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Cancel the e-way bill (within 24 hours)' })
  @HttpCode(200)
  cancel(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() dto: CancelEWayBillDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.ewb.cancel(companyId, invoiceId, dto.reason, branchScope);
  }
}
