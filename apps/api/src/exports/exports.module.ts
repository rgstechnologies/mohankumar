import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PurchasesModule } from '../purchases/purchases.module';
import { ReportsModule } from '../reports/reports.module';
import { EstimatesModule } from '../estimates/estimates.module';
import { ExporterService } from './exporter.service';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { Gstr1JsonService } from './gstr1-json.service';

@Module({
  imports: [ReportsModule, InvoicesModule, PurchasesModule, AccountingModule, EstimatesModule],
  controllers: [ExportsController],
  providers: [ExportsService, ExporterService, Gstr1JsonService],
})
export class ExportsModule {}
