import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { PublicInvoicesController } from './public-invoices.controller';
// Stateless renderer reused for the thermal-layout preview (no DI deps, so
// providing it here does not create a cycle with PosModule).
import { PosReceiptService } from '../pos/pos-receipt.service';
// Lets invoice downloads/shares render with a company's default custom design.
import { PrintRenderModule } from '../print-designer/print-render.module';

@Module({
  imports: [AccountingModule, PrintRenderModule],
  controllers: [InvoicesController, PublicInvoicesController],
  providers: [InvoicesService, InvoicePdfService, PosReceiptService],
  exports: [InvoicesService, InvoicePdfService],
})
export class InvoicesModule {}
