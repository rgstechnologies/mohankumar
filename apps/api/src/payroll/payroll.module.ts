import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { PayslipPdfService } from './payslip-pdf.service';

@Module({
  imports: [AccountingModule],
  controllers: [PayrollController],
  providers: [PayrollService, PayslipPdfService],
  exports: [PayslipPdfService],
})
export class PayrollModule {}
