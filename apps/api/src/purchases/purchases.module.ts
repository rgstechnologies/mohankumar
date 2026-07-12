import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PrintRenderModule } from '../print-designer/print-render.module';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

@Module({
  imports: [AccountingModule, InvoicesModule, PrintRenderModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
