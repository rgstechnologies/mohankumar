import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
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
import { InvoicesModule } from '../invoices/invoices.module';
import { DesignPdfService } from '../print-designer/design-pdf.service';
import { PrintTemplatesService } from '../print-designer/print-templates.service';
import { PrintRenderModule } from '../print-designer/print-render.module';
import { PurchasesModule } from '../purchases/purchases.module';
import {
  ConvertPoDto,
  CreateGrnDto,
  CreatePoDto,
} from './dto/purchase-order.dto';
import { PurchaseOrdersService } from './purchase-orders.service';

const EDITORS = [Role.OWNER, Role.ADMIN, Role.ACCOUNTANT, Role.BRANCH_MANAGER] as const;

@ApiTags('purchase orders')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/purchase-orders')
class PurchaseOrdersController {
  constructor(
    private readonly pos: PurchaseOrdersService,
    private readonly pdf: InvoicePdfService,
    private readonly designPdf: DesignPdfService,
    private readonly printTemplates: PrintTemplatesService,
  ) {}

  @Get(':poId/pdf')
  @ApiOperation({ summary: 'Download the purchase order PDF' })
  async downloadPdf(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('poId', ParseUUIDPipe) poId: string,
    @Res() res: Response,
    @Req() req: Request,
    @Query('lang') lang?: string,
    @BranchScope() branchScope?: string,
  ): Promise<void> {
    const po = await this.pos.getForPdf(companyId, poId, branchScope);
    const locale =
      lang ?? (req.cookies as Record<string, string> | undefined)?.['sa.locale'];
    const design = await this.printTemplates.getDefaultDesign(companyId, 'purchaseOrder');
    const buffer = design
      ? await this.designPdf.render(po, design, locale, 'purchaseOrder')
      : await this.pdf.render(po, locale, { docKind: 'purchaseOrder' });
    const fileName = `PO-${po.fiscalYear}-${String(po.invoiceNo).padStart(4, '0')}.pdf`;
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': buffer.length,
      })
      .end(buffer);
  }

  @Post()
  @CompanyRoles(...EDITORS)
  @ApiOperation({ summary: 'Raise a purchase order on a vendor' })
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePoDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.pos.create(companyId, user.id, dto, branchScope);
  }

  @Get()
  @ApiOperation({ summary: 'List purchase orders with receipt progress' })
  list(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.pos.list(companyId, branchScope);
  }

  @Patch(':poId')
  @CompanyRoles(...EDITORS)
  @ApiOperation({ summary: 'Edit an open purchase order (no goods receipts yet)' })
  update(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('poId', ParseUUIDPipe) poId: string,
    @Body() dto: CreatePoDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.pos.update(companyId, poId, dto, branchScope);
  }

  @Get(':poId')
  @ApiOperation({ summary: 'Purchase order detail with lines + GRNs' })
  getOne(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('poId', ParseUUIDPipe) poId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.pos.getOne(companyId, poId, branchScope);
  }

  @Post(':poId/grns')
  @CompanyRoles(...EDITORS)
  @ApiOperation({ summary: 'Record a goods receipt (GRN) against the order' })
  receive(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('poId', ParseUUIDPipe) poId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateGrnDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.pos.receiveGrn(companyId, poId, user.id, dto, branchScope);
  }

  @Post(':poId/convert-to-bill')
  @CompanyRoles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({
    summary: 'Book a purchase bill for received goods and close the order',
  })
  convert(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('poId', ParseUUIDPipe) poId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ConvertPoDto,
  ) {
    return this.pos.convertToBill(companyId, poId, user.id, dto);
  }

  @Post(':poId/cancel')
  @CompanyRoles(...EDITORS)
  @ApiOperation({ summary: 'Cancel an order (blocked once goods are received)' })
  cancel(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('poId', ParseUUIDPipe) poId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.pos.cancel(companyId, poId, branchScope);
  }

  @Delete(':poId')
  @CompanyRoles(...EDITORS)
  @ApiOperation({ summary: 'Permanently delete a purchase order (blocked once goods are received)' })
  remove(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('poId', ParseUUIDPipe) poId: string,
  ) {
    return this.pos.remove(companyId, poId);
  }
}

@Module({
  imports: [PurchasesModule, InvoicesModule, PrintRenderModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
