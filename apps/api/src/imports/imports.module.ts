import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { AiModule } from '../ai/ai.module';
import { PartiesModule } from '../parties/parties.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  imports: [AccountingModule, PartiesModule, AiModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
