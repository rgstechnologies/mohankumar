import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { PrintRenderModule } from '../print-designer/print-render.module';
import { SalesOrdersController } from './sales-orders.controller';
import { SalesOrdersService } from './sales-orders.service';

@Module({
  imports: [InvoicesModule, PrintRenderModule],
  controllers: [SalesOrdersController],
  providers: [SalesOrdersService],
})
export class SalesOrdersModule {}
