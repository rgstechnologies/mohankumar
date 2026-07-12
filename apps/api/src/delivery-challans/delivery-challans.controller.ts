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
import { CreateDeliveryChallanDto } from './dto/delivery-challan.dto';
import { DeliveryChallansService } from './delivery-challans.service';

const BILLING_ROLES = [
  Role.OWNER,
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.CASHIER,
  Role.BRANCH_MANAGER,
] as const;

@ApiTags('delivery-challans')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/delivery-challans')
export class DeliveryChallansController {
  constructor(
    private readonly challans: DeliveryChallansService,
    private readonly pdf: InvoicePdfService,
    private readonly designPdf: DesignPdfService,
    private readonly printTemplates: PrintTemplatesService,
  ) {}

  @Post()
  @CompanyRoles(...BILLING_ROLES)
  @ApiOperation({ summary: 'Create a delivery challan (no accounting posting)' })
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateDeliveryChallanDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.challans.create(companyId, user.id, dto, branchScope);
  }

  @Get()
  @ApiOperation({ summary: 'List delivery challans' })
  list(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.challans.list(companyId, branchScope);
  }

  @Patch(':challanId')
  @CompanyRoles(...BILLING_ROLES)
  @ApiOperation({ summary: 'Edit an open delivery challan' })
  update(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('challanId', ParseUUIDPipe) challanId: string,
    @Body() dto: CreateDeliveryChallanDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.challans.update(companyId, challanId, dto, branchScope);
  }

  @Get(':challanId')
  @ApiOperation({ summary: 'Delivery challan detail' })
  getOne(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('challanId', ParseUUIDPipe) challanId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.challans.getOne(companyId, challanId, branchScope);
  }

  @Get(':challanId/pdf')
  @ApiOperation({ summary: 'Download the delivery challan PDF' })
  async downloadPdf(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('challanId', ParseUUIDPipe) challanId: string,
    @Res() res: Response,
    @Req() req: Request,
    @Query('lang') lang?: string,
    @BranchScope() branchScope?: string,
  ): Promise<void> {
    const challan = await this.challans.getForPdf(companyId, challanId, branchScope);
    const locale =
      lang ?? (req.cookies as Record<string, string> | undefined)?.['sa.locale'];
    const design = await this.printTemplates.getDefaultDesign(companyId, 'deliveryChallan');
    const buffer = design
      ? await this.designPdf.render(challan, design, locale, 'deliveryChallan')
      : await this.pdf.render(challan, locale, { docKind: 'deliveryChallan' });
    const fileName = `DC-${challan.fiscalYear}-${String(challan.invoiceNo).padStart(4, '0')}.pdf`;
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': buffer.length,
      })
      .end(buffer);
  }

  @Post(':challanId/convert')
  @CompanyRoles(...BILLING_ROLES)
  @ApiOperation({ summary: 'Bill the challan into a GST invoice' })
  convert(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('challanId', ParseUUIDPipe) challanId: string,
    @CurrentUser() user: AuthUser,
    @BranchScope() branchScope?: string,
  ) {
    return this.challans.convertToInvoice(companyId, challanId, user.id, branchScope);
  }

  @Post(':challanId/cancel')
  @CompanyRoles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Cancel a delivery challan' })
  @HttpCode(200)
  cancel(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('challanId', ParseUUIDPipe) challanId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.challans.cancel(companyId, challanId, branchScope);
  }

  @Delete(':challanId')
  @CompanyRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Permanently delete a delivery challan' })
  remove(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('challanId', ParseUUIDPipe) challanId: string,
  ) {
    return this.challans.remove(companyId, challanId);
  }
}
