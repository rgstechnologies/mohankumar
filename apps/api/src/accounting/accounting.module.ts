import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';

// CompanyRoleGuard is referenced via @UseGuards and resolves through the DI
// container using only global providers (Prisma, Reflector) — no module
// import needed, which keeps Companies → Accounting a one-way dependency.
@Module({
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
