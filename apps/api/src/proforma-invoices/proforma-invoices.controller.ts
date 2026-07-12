import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Request, Response } from 'express';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { BranchScope } from '../companies/decorators/branch-scope.decorator';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import { InvoicePdfService } from '../invoices/invoice-pdf.service';
import { DesignPdfService } from '../print-designer/design-pdf.service';
import { PrintTemplatesService } from '../print-designer/print-templates.service';
import { CreateProformaInvoiceDto, SetEstimateStatusDto } from './dto/proforma-invoice.dto';
import { ProformaInvoicesService } from './proforma-invoices.service';

const BILLING_ROLES = [
  Role.OWNER,
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.CASHIER,
  Role.BRANCH_MANAGER,
] as const;

@ApiTags('proformaInvoices')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/proforma-invoices')
export class ProformaInvoicesController {
  constructor(
    private readonly proformaInvoices: ProformaInvoicesService,
    private readonly pdf: InvoicePdfService,
    private readonly designPdf: DesignPdfService,
    private readonly printTemplates: PrintTemplatesService,
  ) {}

  @Post()
  @CompanyRoles(...BILLING_ROLES)
  @ApiOperation({ summary: 'Create an proformaInvoice / quotation (no accounting posting)' })
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateProformaInvoiceDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.proformaInvoices.create(companyId, user.id, dto, branchScope);
  }

  @Get()
  @ApiOperation({ summary: 'List proformaInvoices' })
  list(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.proformaInvoices.list(companyId, branchScope);
  }

  @Patch(':proformaId')
  @CompanyRoles(...BILLING_ROLES)
  @ApiOperation({ summary: 'Edit an open proformaInvoice' })
  update(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('proformaId', ParseUUIDPipe) proformaId: string,
    @Body() dto: CreateProformaInvoiceDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.proformaInvoices.update(companyId, proformaId, dto, branchScope);
  }

  @Get(':proformaId')
  @ApiOperation({ summary: 'ProformaInvoice detail' })
  getOne(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('proformaId', ParseUUIDPipe) proformaId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.proformaInvoices.getOne(companyId, proformaId, branchScope);
  }

  @Get(':proformaId/pdf')
  @ApiOperation({ summary: 'Download the proformaInvoice PDF' })
  async downloadPdf(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('proformaId', ParseUUIDPipe) proformaId: string,
    @Res() res: Response,
    @Req() req: Request,
    @Query('lang') lang?: string,
    @BranchScope() branchScope?: string,
  ): Promise<void> {
    const proformaInvoice = await this.proformaInvoices.getForPdf(companyId, proformaId, branchScope);
    const locale =
      lang ?? (req.cookies as Record<string, string> | undefined)?.['sa.locale'];
    const design = await this.printTemplates.getDefaultDesign(companyId, 'proformaInvoice');
    const buffer = design
      ? await this.designPdf.render(proformaInvoice, design, locale, 'proformaInvoice')
      : await this.pdf.render(proformaInvoice, locale, { docKind: 'proformaInvoice' });
    const fileName = `PI-${proformaInvoice.fiscalYear}-${String(proformaInvoice.invoiceNo).padStart(4, '0')}.pdf`;
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': buffer.length,
      })
      .end(buffer);
  }

  @Post(':proformaId/status')
  @CompanyRoles(...BILLING_ROLES)
  @ApiOperation({ summary: 'Mark an proformaInvoice accepted / declined / reopen' })
  setStatus(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('proformaId', ParseUUIDPipe) proformaId: string,
    @Body() dto: SetEstimateStatusDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.proformaInvoices.setStatus(companyId, proformaId, dto, branchScope);
  }

  @Post(':proformaId/convert')
  @CompanyRoles(...BILLING_ROLES)
  @ApiOperation({ summary: 'Convert the proformaInvoice into a GST invoice' })
  convert(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('proformaId', ParseUUIDPipe) proformaId: string,
    @CurrentUser() user: AuthUser,
    @BranchScope() branchScope?: string,
  ) {
    return this.proformaInvoices.convertToInvoice(companyId, proformaId, user.id, branchScope);
  }

  @Post(':proformaId/cancel')
  @CompanyRoles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Cancel an proformaInvoice' })
  @HttpCode(200)
  cancel(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('proformaId', ParseUUIDPipe) proformaId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.proformaInvoices.cancel(companyId, proformaId, branchScope);
  }

  @Delete(':proformaId')
  @CompanyRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Permanently delete a proforma invoice' })
  remove(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('proformaId', ParseUUIDPipe) proformaId: string,
  ) {
    return this.proformaInvoices.remove(companyId, proformaId);
  }
}
