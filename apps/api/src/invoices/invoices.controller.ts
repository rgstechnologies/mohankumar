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
  Res,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import {
  CreateInvoiceDto,
  PreviewTemplateDto,
  RecordPaymentDto,
} from './dto/invoice.dto';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoicesService } from './invoices.service';
import { PosReceiptService } from '../pos/pos-receipt.service';
import { DesignPdfService } from '../print-designer/design-pdf.service';
import { PrintTemplatesService } from '../print-designer/print-templates.service';

const BILLING_ROLES = [
  Role.OWNER,
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.CASHIER,
  Role.BRANCH_MANAGER,
] as const;

@ApiTags('invoices')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/invoices')
export class InvoicesController {
  constructor(
    private readonly config: ConfigService,
    private readonly invoices: InvoicesService,
    private readonly pdf: InvoicePdfService,
    private readonly receipt: PosReceiptService,
    private readonly printTemplates: PrintTemplatesService,
    private readonly designPdf: DesignPdfService,
  ) {}

  @Post()
  @CompanyRoles(...BILLING_ROLES)
  @ApiOperation({ summary: 'Create a GST invoice (auto-posts SALES voucher)' })
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateInvoiceDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.invoices.create(companyId, user.id, dto, branchScope);
  }

  @Get()
  @ApiOperation({ summary: 'List invoices with payment status' })
  list(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.invoices.list(companyId, branchScope);
  }

  @Patch(':invoiceId')
  @CompanyRoles(...BILLING_ROLES)
  @ApiOperation({ summary: 'Edit a posted invoice (safe-only: no payment/IRN/notes)' })
  update(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() dto: CreateInvoiceDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.invoices.update(companyId, invoiceId, dto, branchScope);
  }

  @Get(':invoiceId')
  @ApiOperation({ summary: 'Invoice detail' })
  getOne(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.invoices.getOne(companyId, invoiceId, branchScope);
  }

  @Get(':invoiceId/pdf')
  @ApiOperation({ summary: 'Download the invoice PDF (with QR code)' })
  async downloadPdf(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Res() res: Response,
    @Req() req: Request,
    @Query('lang') lang?: string,
    @BranchScope() branchScope?: string,
  ): Promise<void> {
    const invoice = await this.invoices.getForPdf(companyId, invoiceId, branchScope);
    // Falls back to the UI language cookie so downloads match the screen.
    const locale =
      lang ?? (req.cookies as Record<string, string> | undefined)?.['sa.locale'];
    // Prefer the company's default drag-and-drop design; else the built-in layout.
    const design = await this.printTemplates.getDefaultDesign(companyId, 'invoice');
    const buffer = design
      ? await this.designPdf.render(invoice, design, locale)
      : await this.pdf.render(invoice, locale);
    const fileName = `INV-${invoice.fiscalYear}-${String(invoice.invoiceNo).padStart(4, '0')}.pdf`;
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': buffer.length,
      })
      .end(buffer);
  }

  @Post('template-preview')
  @CompanyRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Render a sample invoice with an unsaved layout' })
  async templatePreview(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: PreviewTemplateDto,
    @Res() res: Response,
    @Req() req: Request,
    @Query('lang') lang?: string,
  ): Promise<void> {
    const invoice = await this.invoices.buildTemplatePreview(companyId, {
      template: dto.template,
      logo: dto.logo,
    });
    const locale =
      lang ?? (req.cookies as Record<string, string> | undefined)?.['sa.locale'];
    const buffer = dto.thermal
      ? await this.receipt.render(invoice as never, locale)
      : await this.pdf.render(invoice, locale, {
          docKind: (dto.docKind ?? 'invoice') as never,
        });
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="invoice-preview.pdf"',
        'Content-Length': buffer.length,
      })
      .end(buffer);
  }

  @Post(':invoiceId/share')
  @CompanyRoles(...BILLING_ROLES)
  @ApiOperation({
    summary: 'Create a public share link for the invoice (WhatsApp etc.)',
  })
  async share(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @BranchScope() branchScope?: string,
  ) {
    const shared = await this.invoices.share(companyId, invoiceId, branchScope);
    const base =
      this.config.get<string>('API_PUBLIC_URL') ??
      `${this.config.getOrThrow<string>('WEB_ORIGIN')}/api/v1`;
    return {
      url: `${base}/public/invoices/${shared.shareToken}/pdf`,
      invoiceNo: shared.invoiceNo,
      total: shared.total,
      date: shared.date,
      party: shared.party,
    };
  }

  @Post(':invoiceId/share/revoke')
  @CompanyRoles(...BILLING_ROLES)
  @ApiOperation({ summary: 'Invalidate the public share link' })
  @HttpCode(204)
  async revokeShare(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
  ): Promise<void> {
    await this.invoices.revokeShare(companyId, invoiceId);
  }

  @Post(':invoiceId/cancel')
  @CompanyRoles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Cancel an invoice (blocked if payments exist)' })
  cancel(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
  ) {
    return this.invoices.cancel(companyId, invoiceId);
  }

  @Delete(':invoiceId')
  @CompanyRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Permanently delete an invoice (reverses vouchers, payments & stock)' })
  remove(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
  ) {
    return this.invoices.remove(companyId, invoiceId);
  }

  @Post(':invoiceId/payments')
  @CompanyRoles(...BILLING_ROLES)
  @ApiOperation({ summary: 'Record a payment (auto-posts RECEIPT voucher)' })
  recordPayment(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RecordPaymentDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.invoices.recordPayment(companyId, invoiceId, user.id, dto, branchScope);
  }
}
