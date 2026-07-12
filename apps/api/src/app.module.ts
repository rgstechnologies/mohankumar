import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccountingModule } from './accounting/accounting.module';
import { AuditModule } from './audit/audit.module';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { BankingModule } from './banking/banking.module';
import { BillingModule } from './billing/billing.module';
import { BranchesModule } from './branches/branches.module';
import { BatchesModule } from './inventory/batches.module';
import { CompaniesModule } from './companies/companies.module';
import { validateEnv } from './config/env.validation';
import { AuditorsModule } from './auditors/auditors.module';
import { EstimatesModule } from './estimates/estimates.module';
import { ProformaInvoicesModule } from './proforma-invoices/proforma-invoices.module';
import { PurchaseEstimatesModule } from './purchase-estimates/purchase-estimates.module';
import { DeliveryChallansModule } from './delivery-challans/delivery-challans.module';
import { SalesOrdersModule } from './sales-orders/sales-orders.module';
import { ExpensesModule } from './expenses/expenses.module';
import { EInvoiceModule } from './einvoice/einvoice.module';
import { EWayBillModule } from './ewaybill/ewaybill.module';
import { ChequesModule } from './cheques/cheques.module';
import { PartyTransfersModule } from './party-transfers/party-transfers.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { ExportsModule } from './exports/exports.module';
import { HealthModule } from './health/health.module';
import { ImportsModule } from './imports/imports.module';
import { InvoicesModule } from './invoices/invoices.module';
import { MailModule } from './mail/mail.module';
import { NotesModule } from './notes/notes.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OpeningDocsModule } from './opening-docs/opening-docs.module';
import { PartiesModule } from './parties/parties.module';
import { BanksModule } from './banks/banks.controller';
import { PrismaModule } from './prisma/prisma.module';
import { PrintDesignerModule } from './print-designer/print-designer.module';
import { AdminModule } from './admin/admin.module';
import { LeadsModule } from './leads/leads.module';
import { SupportModule } from './support/support.module';
import { LicensingModule } from './licensing/licensing.module';
import { PayrollModule } from './payroll/payroll.module';
import { PortalModule } from './portal/portal.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { PurchasesModule } from './purchases/purchases.module';
import { ReportsModule } from './reports/reports.module';
import { SearchModule } from './search/search.module';
import { RedisModule } from './redis/redis.module';
import { SandboxModule } from './sandbox/sandbox.module';

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
    SandboxModule,
    MailModule,
    AuthModule,
    AccountingModule,
    CompaniesModule,
    PartiesModule,
    BanksModule,
    InvoicesModule,
    PurchasesModule,
    LicensingModule,
    AiModule,
    AdminModule,
    ImportsModule,
    OpeningDocsModule,
    BillingModule,
    AuditModule,
    PayrollModule,
    PortalModule,
    PurchaseOrdersModule,
    ReportsModule,
    EstimatesModule,
    AuditorsModule,
    ProformaInvoicesModule,
    PurchaseEstimatesModule,
    DeliveryChallansModule,
    SalesOrdersModule,
    ExpensesModule,
    EInvoiceModule,
    EWayBillModule,
    ChequesModule,
    PartyTransfersModule,
    LoyaltyModule,
    ExportsModule,
    NotesModule,
    NotificationsModule,
    SearchModule,
    BankingModule,
    BranchesModule,
    BatchesModule,
    PrintDesignerModule,
    LeadsModule,
    SupportModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
