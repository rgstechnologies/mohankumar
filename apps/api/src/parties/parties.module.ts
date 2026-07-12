import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { BalancesModule } from '../balances/balances.module';
import { PartiesController } from './parties.controller';
import { PartiesService } from './parties.service';

@Module({
  imports: [AccountingModule, BalancesModule],
  controllers: [PartiesController],
  providers: [PartiesService],
  exports: [PartiesService],
})
export class PartiesModule {}
