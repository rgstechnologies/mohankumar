import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoicesService } from './invoices.service';
import { DesignPdfService } from '../print-designer/design-pdf.service';
import { PrintTemplatesService } from '../print-designer/print-templates.service';

/**
 * Customer-facing share links — no login, the unguessable token IS the
 * authorization (48 hex chars, revocable). Tighter rate limit than the
 * rest of the API since this is the only truly public document route.
 */
@ApiTags('public')
@Controller('public/invoices')
export class PublicInvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly pdf: InvoicePdfService,
    private readonly printTemplates: PrintTemplatesService,
    private readonly designPdf: DesignPdfService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':token/pdf')
  @ApiOperation({ summary: 'Shared invoice PDF (token authenticated)' })
  async sharedPdf(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const invoice = await this.invoices.getByShareToken(token);
    const design = await this.printTemplates.getDefaultDesign(invoice.companyId, 'invoice');
    const buffer = design
      ? await this.designPdf.render(invoice, design)
      : await this.pdf.render(invoice);
    const fileName = `INV-${invoice.fiscalYear}-${String(invoice.invoiceNo).padStart(4, '0')}.pdf`;
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Content-Length': buffer.length,
      })
      .end(buffer);
  }
}
