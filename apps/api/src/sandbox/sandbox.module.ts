import { Global, Module } from '@nestjs/common';
import { SandboxService } from './sandbox.service';

/**
 * Global module so every feature module (EInvoice, EWayBill, Companies)
 * can inject SandboxService without importing SandboxModule explicitly.
 */
@Global()
@Module({
  providers: [SandboxService],
  exports: [SandboxService],
})
export class SandboxModule {}
