import { Module } from '@nestjs/common';
import { DesignPdfService } from './design-pdf.service';
import { PrintTemplatesService } from './print-templates.service';

/**
 * The stateless rendering core of the Print Template Designer: the design→PDF
 * renderer and the template store. Both depend only on the (global) Prisma
 * service, so this module can be imported anywhere — notably by InvoicesModule
 * to render real invoices with a company's default custom design — without the
 * circular dependency that importing the full PrintDesignerModule would create.
 */
@Module({
  providers: [DesignPdfService, PrintTemplatesService],
  exports: [DesignPdfService, PrintTemplatesService],
})
export class PrintRenderModule {}
