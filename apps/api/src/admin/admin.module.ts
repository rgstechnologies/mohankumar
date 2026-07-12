import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { SuperAdminGuard } from './super-admin.guard';

@Module({
  controllers: [AdminController],
  providers: [SuperAdminGuard],
})
export class AdminModule {}
