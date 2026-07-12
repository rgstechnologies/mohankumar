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
import { CreateSalesOrderDto } from './dto/sales-order.dto';
import { SalesOrdersService } from './sales-orders.service';

const BILLING_ROLES = [
  Role.OWNER,
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.CASHIER,
  Role.BRANCH_MANAGER,
] as const;

@ApiTags('sales-orders')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/sales-orders')
export class SalesOrdersController {
  constructor(
    private readonly orders: SalesOrdersService,
    private readonly pdf: InvoicePdfService,
    private readonly designPdf: DesignPdfService,
    private readonly printTemplates: PrintTemplatesService,
  ) {}

  @Post()
  @CompanyRoles(...BILLING_ROLES)
  @ApiOperation({ summary: 'Create a sales order (no accounting posting)' })
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSalesOrderDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.orders.create(companyId, user.id, dto, branchScope);
  }

  @Get()
  @ApiOperation({ summary: 'List sales orders' })
  list(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.orders.list(companyId, branchScope);
  }

  @Patch(':orderId')
  @CompanyRoles(...BILLING_ROLES)
  @ApiOperation({ summary: 'Edit an open sales order' })
  update(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: CreateSalesOrderDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.orders.update(companyId, orderId, dto, branchScope);
  }

  @Get(':orderId')
  @ApiOperation({ summary: 'Sales order detail' })
  getOne(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.orders.getOne(companyId, orderId, branchScope);
  }

  @Get(':orderId/pdf')
  @ApiOperation({ summary: 'Download the sales order PDF' })
  async downloadPdf(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Res() res: Response,
    @Req() req: Request,
    @Query('lang') lang?: string,
    @BranchScope() branchScope?: string,
  ): Promise<void> {
    const order = await this.orders.getForPdf(companyId, orderId, branchScope);
    const locale =
      lang ?? (req.cookies as Record<string, string> | undefined)?.['sa.locale'];
    const design = await this.printTemplates.getDefaultDesign(companyId, 'salesOrder');
    const buffer = design
      ? await this.designPdf.render(order, design, locale, 'salesOrder')
      : await this.pdf.render(order, locale, { docKind: 'salesOrder' });
    const fileName = `SO-${order.fiscalYear}-${String(order.invoiceNo).padStart(4, '0')}.pdf`;
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': buffer.length,
      })
      .end(buffer);
  }

  @Post(':orderId/convert')
  @CompanyRoles(...BILLING_ROLES)
  @ApiOperation({ summary: 'Bill the sales order into a GST invoice' })
  convert(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: AuthUser,
    @BranchScope() branchScope?: string,
  ) {
    return this.orders.convertToInvoice(companyId, orderId, user.id, branchScope);
  }

  @Post(':orderId/cancel')
  @CompanyRoles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Cancel a sales order' })
  @HttpCode(200)
  cancel(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.orders.cancel(companyId, orderId, branchScope);
  }

  @Delete(':orderId')
  @CompanyRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Permanently delete a sales order' })
  remove(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.orders.remove(companyId, orderId);
  }
}
