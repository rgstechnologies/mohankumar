import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PurchasesModule } from '../purchases/purchases.module';
import { PrintRenderModule } from '../print-designer/print-render.module';
import { PurchaseEstimatesController } from './purchase-estimates.controller';
import { PurchaseEstimatesService } from './purchase-estimates.service';

@Module({
  imports: [PurchasesModule, InvoicesModule, AccountingModule, PrintRenderModule],
  controllers: [PurchaseEstimatesController],
  providers: [PurchaseEstimatesService],
})
export class PurchaseEstimatesModule {}
