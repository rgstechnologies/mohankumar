import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { AuthModule } from '../auth/auth.module';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { CompanyRoleGuard } from './guards/company-role.guard';

@Module({
  imports: [AuthModule, AccountingModule],
  controllers: [CompaniesController],
  providers: [CompaniesService, CompanyRoleGuard],
  exports: [CompaniesService, CompanyRoleGuard],
})
export class CompaniesModule {}
