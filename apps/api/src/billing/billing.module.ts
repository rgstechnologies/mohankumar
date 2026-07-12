import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import {
  RAZORPAY_CLIENT,
  RazorpayRestClient,
  UnconfiguredRazorpayClient,
  type RazorpayClient,
} from './razorpay.client';

function buildClient(config: ConfigService): RazorpayClient {
  const logger = new Logger('BillingModule');
  const keyId = config.get<string>('RAZORPAY_KEY_ID') ?? '';
  const keySecret = config.get<string>('RAZORPAY_KEY_SECRET') ?? '';
  if (!keyId || !keySecret) {
    logger.warn('Razorpay keys missing — online plan upgrades disabled');
    return new UnconfiguredRazorpayClient();
  }
  logger.log(`Payments enabled: Razorpay (${keyId.slice(0, 12)}…)`);
  return new RazorpayRestClient(keyId, keySecret);
}

@Module({
  controllers: [BillingController],
  providers: [
    BillingService,
    { provide: RAZORPAY_CLIENT, useFactory: buildClient, inject: [ConfigService] },
  ],
  exports: [BillingService],
})
export class BillingModule {}
