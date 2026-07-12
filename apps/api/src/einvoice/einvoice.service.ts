import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EInvoiceStatus, InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SandboxService } from '../sandbox/sandbox.service';
import { decryptSecret } from '../common/crypto.util';
import { buildEInvoicePayload } from './einvoice-payload';
import {
  type EInvoiceCredentials,
  type EInvoiceProvider,
  SimulatorEInvoiceProvider,
} from './einvoice-provider';
import { SandboxEInvoiceProvider } from './sandbox-einvoice-provider';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Stable message shown when a company tries to generate an e-invoice against the
 * live IRP before saving its NIC e-invoice API credentials. The web matches on
 * this to surface a setup prompt.
 */
export const EINVOICE_NO_CREDENTIALS_MESSAGE =
  'E-invoice API credentials are not set for this company. Add your NIC e-invoice API username and password under Settings → E-Invoice Portal.';

/**
 * Production safety: refuse to issue a simulated IRN when the government
 * e-invoice provider is not configured. Without this, a prod deploy missing
 * SANDBOX_API_KEY/SECRET would silently return fake IRNs that look filed with
 * GST. Only the live IRP may produce IRNs in production; the simulator stays
 * available in dev/test.
 */
export const EINVOICE_NOT_CONFIGURED_MESSAGE =
  'E-invoicing is not configured on this server: the government e-invoice provider (SANDBOX_API_KEY/SECRET) is not set. Refusing to issue a simulated IRN in production — contact support.';

type EinvCreds = {
  gstin: string | null;
  einvoiceApiUsername: string | null;
  einvoiceApiPassword: string | null;
};

@Injectable()
export class EInvoiceService {
  /** Active provider — the live Sandbox IRP client or the deterministic simulator. */
  private readonly provider: EInvoiceProvider;
  /** Non-null only when Sandbox is configured; drives fail-closed credential checks. */
  private readonly live: SandboxEInvoiceProvider | null;
  /** In production the simulator must never issue an IRN — only the live IRP may. */
  private readonly isProduction: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    sandbox: SandboxService,
  ) {
    // Swap-in seam: use Sandbox.co.in when credentials are configured,
    // otherwise fall back to the deterministic simulator.
    this.live = sandbox.enabled ? new SandboxEInvoiceProvider(sandbox) : null;
    this.provider = this.live ?? new SimulatorEInvoiceProvider();
    this.isProduction = this.config.get<string>('NODE_ENV') === 'production';
  }

  /** Builds this company's IRP credentials, or undefined when not set up. */
  private credsFor(c: EinvCreds): EInvoiceCredentials | undefined {
    if (!(c.gstin && c.einvoiceApiUsername && c.einvoiceApiPassword)) return undefined;
    const key =
      this.config.get<string>('ENCRYPTION_KEY') ||
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    return {
      gstin: c.gstin,
      username: c.einvoiceApiUsername,
      password: decryptSecret(c.einvoiceApiPassword, key),
    };
  }

  private displayNo(fiscalYear: string, invoiceNo: number) {
    return `INV/${fiscalYear}/${String(invoiceNo).padStart(4, '0')}`;
  }

  async get(companyId: string, invoiceId: string, branchScope?: string) {
    await this.requireInvoice(companyId, invoiceId, branchScope);
    const ei = await this.prisma.eInvoice.findUnique({ where: { invoiceId } });
    return ei ? this.serialize(ei) : null;
  }

  /** Registers the invoice with the IRP and stores the IRN + signed QR. */
  async generate(companyId: string, invoiceId: string, branchScope?: string) {
    // Production must never return a simulated IRN. When Sandbox isn't
    // configured (no live keys) the only provider is the simulator — refuse
    // rather than issue a fake IRN that looks filed with GST. The simulator
    // stays fully available in dev/test (isProduction === false).
    if (this.isProduction && !this.live) {
      throw new ServiceUnavailableException(EINVOICE_NOT_CONFIGURED_MESSAGE);
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, companyId, ...(branchScope && { branchId: branchScope }) },
      include: { company: true, party: true, lines: { orderBy: { lineNo: 'asc' } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Cannot e-invoice a cancelled invoice');
    }
    if (!invoice.company.gstin) {
      throw new BadRequestException(
        'Your company has no GSTIN — set it in Settings before generating e-invoices',
      );
    }
    if (!invoice.party.gstin) {
      throw new BadRequestException(
        'e-Invoice applies to B2B sales — this customer has no GSTIN',
      );
    }

    const existing = await this.prisma.eInvoice.findUnique({ where: { invoiceId } });
    if (existing) {
      if (existing.status === EInvoiceStatus.GENERATED) {
        throw new BadRequestException('This invoice already has an IRN');
      }
      throw new BadRequestException(
        'This invoice’s e-invoice was cancelled — raise a fresh invoice to re-register',
      );
    }

    const displayNo = this.displayNo(invoice.fiscalYear, invoice.invoiceNo);
    const payload = buildEInvoicePayload(invoice, displayNo);
    const now = new Date();
    // Live IRP filing requires this company's OWN e-invoice credentials — fail
    // closed rather than filing under a shared identity. The simulator ignores
    // credentials, so demo/dev flows are unaffected.
    const creds = this.credsFor(invoice.company);
    if (this.live && !creds) {
      throw new BadRequestException(EINVOICE_NO_CREDENTIALS_MESSAGE);
    }
    const result = await this.provider.generate(payload, now, creds);

    const ei = await this.prisma.eInvoice.create({
      data: {
        invoiceId,
        status: EInvoiceStatus.GENERATED,
        irn: result.irn,
        ackNo: result.ackNo,
        ackDate: result.ackDate,
        signedQrCode: result.signedQrCode,
        signedInvoice: result.signedInvoice,
        provider: result.provider,
        requestJson: JSON.stringify(payload),
      },
    });
    return this.serialize(ei);
  }

  /** Cancels the IRN (allowed within 24h of generation) with a reason. */
  async cancel(
    companyId: string,
    invoiceId: string,
    reason: string,
    branchScope?: string,
  ) {
    await this.requireInvoice(companyId, invoiceId, branchScope);
    const ei = await this.prisma.eInvoice.findUnique({ where: { invoiceId } });
    if (!ei) throw new NotFoundException('No e-invoice for this invoice');
    if (ei.status === EInvoiceStatus.CANCELLED) {
      throw new BadRequestException('e-Invoice is already cancelled');
    }
    const now = new Date();
    if (now.getTime() - ei.ackDate.getTime() > DAY_MS) {
      throw new BadRequestException(
        'The 24-hour cancellation window has passed — issue a credit note instead',
      );
    }

    // Only call the IRP for e-invoices generated live; simulator ones are
    // cancelled locally with no upstream call. Live cancellation uses this
    // company's own credentials — fail closed if they've since been removed.
    if (ei.provider === this.live?.name) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: {
          gstin: true,
          einvoiceApiUsername: true,
          einvoiceApiPassword: true,
        },
      });
      const creds = company ? this.credsFor(company) : undefined;
      if (!creds) {
        throw new BadRequestException(EINVOICE_NO_CREDENTIALS_MESSAGE);
      }
      await this.provider.cancel(ei.irn, reason, now, creds);
    }
    const updated = await this.prisma.eInvoice.update({
      where: { invoiceId },
      data: {
        status: EInvoiceStatus.CANCELLED,
        cancelReason: reason,
        cancelledAt: now,
      },
    });
    return this.serialize(updated);
  }

  // -------------------------------------------------------------

  private async requireInvoice(
    companyId: string,
    invoiceId: string,
    branchScope?: string,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, companyId, ...(branchScope && { branchId: branchScope }) },
      select: { id: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  private serialize(ei: {
    status: EInvoiceStatus;
    irn: string;
    ackNo: string;
    ackDate: Date;
    signedQrCode: string;
    ewbNo: string | null;
    provider: string;
    cancelReason: string | null;
    cancelledAt: Date | null;
  }) {
    return {
      status: ei.status,
      irn: ei.irn,
      ackNo: ei.ackNo,
      ackDate: ei.ackDate,
      signedQrCode: ei.signedQrCode,
      ewbNo: ei.ewbNo,
      provider: ei.provider,
      cancelReason: ei.cancelReason,
      cancelledAt: ei.cancelledAt,
    };
  }
}
