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
import { CreateEstimateDto, SetEstimateStatusDto } from './dto/estimate.dto';
import { EstimatesService } from './estimates.service';

const BILLING_ROLES = [
  Role.OWNER,
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.CASHIER,
  Role.BRANCH_MANAGER,
] as const;

@ApiTags('estimates')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/estimates')
export class EstimatesController {
  constructor(
    private readonly estimates: EstimatesService,
    private readonly pdf: InvoicePdfService,
    private readonly designPdf: DesignPdfService,
    private readonly printTemplates: PrintTemplatesService,
  ) {}

  @Post()
  @CompanyRoles(...BILLING_ROLES)
  @ApiOperation({ summary: 'Create an estimate / quotation (no accounting posting)' })
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateEstimateDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.estimates.create(companyId, user.id, dto, branchScope);
  }

  @Get()
  @ApiOperation({ summary: 'List estimates' })
  list(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.estimates.list(companyId, branchScope);
  }

  @Patch(':estimateId')
  @CompanyRoles(...BILLING_ROLES)
  @ApiOperation({ summary: 'Edit an open estimate' })
  update(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('estimateId', ParseUUIDPipe) estimateId: string,
    @Body() dto: CreateEstimateDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.estimates.update(companyId, estimateId, dto, branchScope);
  }

  @Get(':estimateId')
  @ApiOperation({ summary: 'Estimate detail' })
  getOne(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('estimateId', ParseUUIDPipe) estimateId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.estimates.getOne(companyId, estimateId, branchScope);
  }

  @Get(':estimateId/pdf')
  @ApiOperation({ summary: 'Download the estimate PDF' })
  async downloadPdf(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('estimateId', ParseUUIDPipe) estimateId: string,
    @Res() res: Response,
    @Req() req: Request,
    @Query('lang') lang?: string,
    @BranchScope() branchScope?: string,
  ): Promise<void> {
    const estimate = await this.estimates.getForPdf(companyId, estimateId, branchScope);
    const locale =
      lang ?? (req.cookies as Record<string, string> | undefined)?.['sa.locale'];
    const design = await this.printTemplates.getDefaultDesign(companyId, 'estimate');
    const buffer = design
      ? await this.designPdf.render(estimate, design, locale, 'estimate')
      : await this.pdf.render(estimate, locale, { docKind: 'estimate' });
    const fileName = `EST-${estimate.fiscalYear}-${String(estimate.invoiceNo).padStart(4, '0')}.pdf`;
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': buffer.length,
      })
      .end(buffer);
  }

  @Post(':estimateId/status')
  @CompanyRoles(...BILLING_ROLES)
  @ApiOperation({ summary: 'Mark an estimate accepted / declined / reopen' })
  setStatus(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('estimateId', ParseUUIDPipe) estimateId: string,
    @Body() dto: SetEstimateStatusDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.estimates.setStatus(companyId, estimateId, dto, branchScope);
  }

  @Post(':estimateId/convert')
  @CompanyRoles(...BILLING_ROLES)
  @ApiOperation({ summary: 'Convert the estimate into a GST invoice' })
  convert(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('estimateId', ParseUUIDPipe) estimateId: string,
    @CurrentUser() user: AuthUser,
    @BranchScope() branchScope?: string,
  ) {
    return this.estimates.convertToInvoice(companyId, estimateId, user.id, branchScope);
  }

  @Post(':estimateId/cancel')
  @CompanyRoles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Cancel an estimate' })
  @HttpCode(200)
  cancel(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('estimateId', ParseUUIDPipe) estimateId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.estimates.cancel(companyId, estimateId, branchScope);
  }

  @Delete(':estimateId')
  @CompanyRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Permanently delete an estimate (and its booked voucher)' })
  remove(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('estimateId', ParseUUIDPipe) estimateId: string,
  ) {
    return this.estimates.remove(companyId, estimateId);
  }
}
