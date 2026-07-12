import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { PrintRenderModule } from './print-render.module';
import { PrintTemplatesController } from './print-templates.controller';

/**
 * Print Template Designer: the CRUD + live-preview HTTP surface. The rendering
 * core (renderer + store) lives in PrintRenderModule; this module adds the
 * controller and pulls in InvoicesModule for the sample-invoice preview builder.
 */
@Module({
  imports: [PrintRenderModule, InvoicesModule],
  controllers: [PrintTemplatesController],
})
export class PrintDesignerModule {}
