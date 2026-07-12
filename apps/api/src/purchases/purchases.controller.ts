import {
  Body,
  Controller,
  Delete,
  Get,
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
import { FiscalYear } from '../auth/decorators/fiscal-year.decorator';
import { BranchScope } from '../companies/decorators/branch-scope.decorator';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import { RecordPaymentDto } from '../invoices/dto/invoice.dto';
import { InvoicePdfService } from '../invoices/invoice-pdf.service';
import { CreatePurchaseBillDto } from './dto/purchase.dto';
import { PurchasesService } from './purchases.service';

const BILLING_ROLES = [
  Role.OWNER,
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.CASHIER,
  Role.BRANCH_MANAGER,
] as const;

@ApiTags('purchases')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId')
export class PurchasesController {
  constructor(
    private readonly purchases: PurchasesService,
    private readonly pdf: InvoicePdfService,
  ) {}

  @Get('purchase-bills/:billId/pdf')
  @ApiOperation({ summary: 'Download the purchase bill PDF' })
  async downloadPdf(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('billId', ParseUUIDPipe) billId: string,
    @Res() res: Response,
    @Req() req: Request,
    @Query('lang') lang?: string,
    @BranchScope() branchScope?: string,
  ): Promise<void> {
    const bill = await this.purchases.getForPdf(companyId, billId, branchScope);
    const locale =
      lang ?? (req.cookies as Record<string, string> | undefined)?.['sa.locale'];
    const buffer = await this.pdf.render(bill, locale, { docKind: 'purchaseBill' });
    const fileName = `BILL-${bill.fiscalYear}-${String(bill.invoiceNo).padStart(4, '0')}.pdf`;
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': buffer.length,
      })
      .end(buffer);
  }

  @Post('purchase-bills')
  @CompanyRoles(...BILLING_ROLES)
  @ApiOperation({ summary: 'Book a purchase bill (auto-posts PURCHASE voucher)' })
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePurchaseBillDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.purchases.create(companyId, user.id, dto, branchScope);
  }

  @Get('purchase-bills')
  @ApiOperation({ summary: 'List purchase bills with payment status' })
  list(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @BranchScope() branchScope?: string,
    @FiscalYear() fiscalYear?: string,
  ) {
    return this.purchases.list(companyId, branchScope, fiscalYear);
  }

  @Patch('purchase-bills/:billId')
  @CompanyRoles(...BILLING_ROLES)
  @ApiOperation({ summary: 'Edit a posted bill (safe-only: no payment/notes)' })
  update(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('billId', ParseUUIDPipe) billId: string,
    @Body() dto: CreatePurchaseBillDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.purchases.update(companyId, billId, dto, branchScope);
  }

  @Get('purchase-bills/:billId')
  @ApiOperation({ summary: 'Purchase bill detail' })
  getOne(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('billId', ParseUUIDPipe) billId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.purchases.getOne(companyId, billId, branchScope);
  }

  @Post('purchase-bills/:billId/cancel')
  @CompanyRoles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Cancel a purchase bill (blocked if payments exist)' })
  cancel(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('billId', ParseUUIDPipe) billId: string,
  ) {
    return this.purchases.cancel(companyId, billId);
  }

  @Delete('purchase-bills/:billId')
  @CompanyRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Permanently delete a purchase bill (reverses vouchers, payments & stock)' })
  remove(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('billId', ParseUUIDPipe) billId: string,
  ) {
    return this.purchases.remove(companyId, billId);
  }

  @Post('purchase-bills/:billId/payments')
  @CompanyRoles(...BILLING_ROLES)
  @ApiOperation({ summary: 'Pay a vendor (auto-posts PAYMENT voucher)' })
  recordPayment(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('billId', ParseUUIDPipe) billId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RecordPaymentDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.purchases.recordPayment(companyId, billId, user.id, dto, branchScope);
  }

  @Get('stock')
  @ApiOperation({ summary: 'Stock on hand per item with valuation + low-stock flags' })
  stock(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.purchases.stockReport(companyId);
  }
}
