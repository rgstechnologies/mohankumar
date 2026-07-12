import { Module } from '@nestjs/common';
import { EWayBillController } from './ewaybill.controller';
import { EWayBillService } from './ewaybill.service';

@Module({
  controllers: [EWayBillController],
  providers: [EWayBillService],
})
export class EWayBillModule {}
