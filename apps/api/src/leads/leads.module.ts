import { Module } from '@nestjs/common';
import { SuperAdminGuard } from '../admin/super-admin.guard';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  controllers: [LeadsController],
  providers: [LeadsService, SuperAdminGuard],
})
export class LeadsModule {}
