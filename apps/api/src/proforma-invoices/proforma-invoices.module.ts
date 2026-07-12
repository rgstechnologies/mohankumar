import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { PrintRenderModule } from '../print-designer/print-render.module';
import { ProformaInvoicesController } from './proforma-invoices.controller';
import { ProformaInvoicesService } from './proforma-invoices.service';

@Module({
  imports: [InvoicesModule, PrintRenderModule],
  controllers: [ProformaInvoicesController],
  providers: [ProformaInvoicesService],
})
export class ProformaInvoicesModule {}
