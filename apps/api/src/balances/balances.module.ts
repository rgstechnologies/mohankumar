import { Module } from '@nestjs/common';
import { PartyBalanceService } from './party-balance.service';

/**
 * The document-based outstanding-balance engine. Stateless (Prisma-only), so it
 * can be imported anywhere a customer/vendor balance is shown — parties,
 * reports/dashboard, payment screens — guaranteeing identical estimate-vs-invoice
 * (and purchase-estimate-vs-bill) separation across the whole ERP.
 */
@Module({
  providers: [PartyBalanceService],
  exports: [PartyBalanceService],
})
export class BalancesModule {}
