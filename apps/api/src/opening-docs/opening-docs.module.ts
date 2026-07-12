import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { OpeningDocsController } from './opening-docs.controller';
import { OpeningDocsService } from './opening-docs.service';

@Module({
  imports: [AccountingModule],
  controllers: [OpeningDocsController],
  providers: [OpeningDocsService],
  exports: [OpeningDocsService],
})
export class OpeningDocsModule {}
