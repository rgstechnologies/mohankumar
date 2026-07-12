import { Module } from '@nestjs/common';
import { AuditorPdfService } from './auditor-pdf.service';
import { AuditorsController } from './auditors.controller';
import { AuditorsService } from './auditors.service';
import { MarketplaceController } from './marketplace.controller';

@Module({
  controllers: [AuditorsController, MarketplaceController],
  providers: [AuditorsService, AuditorPdfService],
})
export class AuditorsModule {}
