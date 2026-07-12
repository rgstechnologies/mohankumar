import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccountingModule } from './accounting/accounting.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BalancesModule } from './balances/balances.module';
import { BanksModule } from './banks/banks.controller';
import { BatchesModule } from './inventory/batches.module';
import { BranchesModule } from './branches/branches.module';
import { CompaniesModule } from './companies/companies.module';
import { validateEnv } from './config/env.validation';
import { EstimatesModule } from './estimates/estimates.module';
import { ExportsModule } from './exports/exports.module';
import { HealthModule } from './health/health.module';
import { InvoicesModule } from './invoices/invoices.module';
import { MailModule } from './mail/mail.module';
import { NotesModule } from './notes/notes.module';
import { PartiesModule } from './parties/parties.module';
import { PrismaModule } from './prisma/prisma.module';
import { PurchasesModule } from './purchases/purchases.module';
import { RedisModule } from './redis/redis.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      // In dev the .env lives at the monorepo root; in Docker it's injected.
      envFilePath: ['../../.env', '.env'],
    }),
    // Brute-force / scrape protection: 300 req/min/IP globally, stricter
    // per-route @Throttle limits on auth. Disabled under test — the e2e
    // suite fires hundreds of requests from one IP by design.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{ ttl: 60_000, limit: 300 }],
        skipIf: () => config.get('NODE_ENV') === 'test',
      }),
    }),
    PrismaModule,
    RedisModule,
    MailModule,
    AuthModule,
    AccountingModule,
    CompaniesModule,
    BranchesModule,
    PartiesModule,
    BatchesModule,
    BanksModule,
    BalancesModule,
    EstimatesModule,
    InvoicesModule,
    PurchasesModule,
    // Credit/debit notes: required by GSTR-1 (CDNR/CDNUR sections) and by the
    // invoice/bill outstanding and stock-return maths.
    NotesModule,
    ReportsModule,
    ExportsModule,
    AuditModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
