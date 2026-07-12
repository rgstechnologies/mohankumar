import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
// Stateless renderer reused for the thermal-layout preview (no DI deps, so
// providing it here does not create a cycle with PosModule).
import { PosReceiptService } from './pos-receipt.service';

@Module({
  imports: [AccountingModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicePdfService, PosReceiptService],
  exports: [InvoicesService, InvoicePdfService],
})
export class InvoicesModule {}
