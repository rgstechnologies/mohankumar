import { Module } from '@nestjs/common';
import { EInvoiceController } from './einvoice.controller';
import { EInvoiceService } from './einvoice.service';

@Module({
  controllers: [EInvoiceController],
  providers: [EInvoiceService],
})
export class EInvoiceModule {}
