import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import type { SandboxService } from '../sandbox/sandbox.service';
import {
  EInvoiceService,
  EINVOICE_NOT_CONFIGURED_MESSAGE,
} from './einvoice.service';

/**
 * Unit tests for the production safety guard: a prod deploy missing the
 * government e-invoice provider keys (SANDBOX_API_KEY/SECRET) must NOT silently
 * return a simulated IRN. The guard runs before any DB access, so plain mocks
 * suffice — no Nest container or test database needed.
 */
function makeService(opts: { nodeEnv: string; sandboxEnabled: boolean }) {
  const prisma = {
    invoice: { findFirst: jest.fn() },
    eInvoice: { findUnique: jest.fn(), create: jest.fn() },
  } as unknown as PrismaService;

  const config = {
    get: (key: string) => (key === 'NODE_ENV' ? opts.nodeEnv : undefined),
    getOrThrow: (key: string) => {
      if (key === 'JWT_ACCESS_SECRET') return 'test-secret';
      throw new Error(`missing ${key}`);
    },
  } as unknown as ConfigService;

  // enabled=false models "no SANDBOX_API_KEY/SECRET" → only the simulator exists.
  const sandbox = { enabled: opts.sandboxEnabled } as unknown as SandboxService;

  return { service: new EInvoiceService(prisma, config, sandbox), prisma };
}

describe('EInvoiceService — production simulator guard', () => {
  it('production + no live keys: refuses to generate and issues NO simulated IRN', async () => {
    const { service, prisma } = makeService({
      nodeEnv: 'production',
      sandboxEnabled: false,
    });

    const result = service.generate('company-1', 'invoice-1');
    await expect(result).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(result).rejects.toThrow(EINVOICE_NOT_CONFIGURED_MESSAGE);

    // Crucially: no fake IRN was looked up, built, or persisted.
    expect(prisma.invoice.findFirst).not.toHaveBeenCalled();
    expect(prisma.eInvoice.create).not.toHaveBeenCalled();
  });

  it('non-production + no live keys: simulator path stays enabled (guard does not fire)', async () => {
    const { service, prisma } = makeService({
      nodeEnv: 'test',
      sandboxEnabled: false,
    });
    (prisma.invoice.findFirst as jest.Mock).mockResolvedValue(null);

    // Passes the prod guard and reaches the normal invoice lookup, so it fails
    // with NotFound — NOT the config error — proving the simulator remains
    // reachable in dev/test.
    await expect(service.generate('company-1', 'invoice-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.invoice.findFirst).toHaveBeenCalledTimes(1);
  });
});
