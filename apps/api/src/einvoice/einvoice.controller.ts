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
import { IsString, MaxLength, MinLength } from 'class-validator';
import { BranchScope } from '../companies/decorators/branch-scope.decorator';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import { EInvoiceService } from './einvoice.service';

class CancelEInvoiceDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  reason!: string;
}

const BILLING_ROLES = [
  Role.OWNER,
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.CASHIER,
  Role.BRANCH_MANAGER,
] as const;

@ApiTags('e-invoice')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/invoices/:invoiceId/einvoice')
export class EInvoiceController {
  constructor(private readonly einvoice: EInvoiceService) {}

  @Get()
  @ApiOperation({ summary: 'Get the e-invoice (IRN) status for an invoice' })
  get(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.einvoice.get(companyId, invoiceId, branchScope);
  }

  @Post('generate')
  @CompanyRoles(...BILLING_ROLES)
  @ApiOperation({ summary: 'Register the invoice with the IRP and get an IRN' })
  generate(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.einvoice.generate(companyId, invoiceId, branchScope);
  }

  @Post('cancel')
  @CompanyRoles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Cancel the IRN (within 24 hours)' })
  @HttpCode(200)
  cancel(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() dto: CancelEInvoiceDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.einvoice.cancel(companyId, invoiceId, dto.reason, branchScope);
  }
}
