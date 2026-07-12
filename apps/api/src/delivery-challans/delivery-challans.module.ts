import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { PrintRenderModule } from '../print-designer/print-render.module';
import { DeliveryChallansController } from './delivery-challans.controller';
import { DeliveryChallansService } from './delivery-challans.service';

@Module({
  imports: [InvoicesModule, PrintRenderModule],
  controllers: [DeliveryChallansController],
  providers: [DeliveryChallansService],
})
export class DeliveryChallansModule {}
