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
import {
  CreatePurchaseEstimateDto,
  SetPurchaseEstimateStatusDto,
} from './dto/purchase-estimate.dto';
import { PurchaseEstimatesService } from './purchase-estimates.service';

const BUYING_ROLES = [
  Role.OWNER,
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.BRANCH_MANAGER,
] as const;

@ApiTags('purchase-estimates')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/purchase-estimates')
export class PurchaseEstimatesController {
  constructor(
    private readonly estimates: PurchaseEstimatesService,
    private readonly pdf: InvoicePdfService,
    private readonly designPdf: DesignPdfService,
    private readonly printTemplates: PrintTemplatesService,
  ) {}

  @Post()
  @CompanyRoles(...BUYING_ROLES)
  @ApiOperation({ summary: 'Create a purchase estimate / vendor quotation' })
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePurchaseEstimateDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.estimates.create(companyId, user.id, dto, branchScope);
  }

  @Get()
  @ApiOperation({ summary: 'List purchase estimates' })
  list(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.estimates.list(companyId, branchScope);
  }

  @Patch(':estimateId')
  @CompanyRoles(...BUYING_ROLES)
  @ApiOperation({ summary: 'Edit an open purchase estimate' })
  update(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('estimateId', ParseUUIDPipe) estimateId: string,
    @Body() dto: CreatePurchaseEstimateDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.estimates.update(companyId, estimateId, dto, branchScope);
  }

  @Get(':estimateId')
  @ApiOperation({ summary: 'Purchase estimate detail' })
  getOne(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('estimateId', ParseUUIDPipe) estimateId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.estimates.getOne(companyId, estimateId, branchScope);
  }

  @Get(':estimateId/pdf')
  @ApiOperation({ summary: 'Download the purchase estimate PDF' })
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
    const design = await this.printTemplates.getDefaultDesign(companyId, 'purchaseEstimate');
    const buffer = design
      ? await this.designPdf.render(estimate, design, locale, 'purchaseEstimate')
      : await this.pdf.render(estimate, locale, { docKind: 'purchaseEstimate' });
    const fileName = `PEST-${estimate.fiscalYear}-${String(estimate.invoiceNo).padStart(4, '0')}.pdf`;
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
  @CompanyRoles(...BUYING_ROLES)
  @ApiOperation({ summary: 'Mark a purchase estimate accepted / declined / reopen' })
  setStatus(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('estimateId', ParseUUIDPipe) estimateId: string,
    @Body() dto: SetPurchaseEstimateStatusDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.estimates.setStatus(companyId, estimateId, dto, branchScope);
  }

  @Post(':estimateId/convert')
  @CompanyRoles(...BUYING_ROLES)
  @ApiOperation({ summary: 'Convert the quotation into a purchase bill' })
  convert(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('estimateId', ParseUUIDPipe) estimateId: string,
    @CurrentUser() user: AuthUser,
    @BranchScope() branchScope?: string,
  ) {
    return this.estimates.convertToBill(companyId, estimateId, user.id, branchScope);
  }

  @Post(':estimateId/cancel')
  @CompanyRoles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Cancel a purchase estimate' })
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
  @ApiOperation({ summary: 'Permanently delete a purchase estimate (and its booked voucher)' })
  remove(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('estimateId', ParseUUIDPipe) estimateId: string,
  ) {
    return this.estimates.remove(companyId, estimateId);
  }
}
