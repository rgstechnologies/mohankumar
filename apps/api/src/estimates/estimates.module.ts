import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PrintRenderModule } from '../print-designer/print-render.module';
import { EstimatesController } from './estimates.controller';
import { EstimatesService } from './estimates.service';

@Module({
  imports: [InvoicesModule, AccountingModule, PrintRenderModule],
  controllers: [EstimatesController],
  providers: [EstimatesService],
})
export class EstimatesModule {}
