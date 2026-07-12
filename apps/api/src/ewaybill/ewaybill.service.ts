import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EWayBillStatus, InvoiceStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SandboxService } from '../sandbox/sandbox.service';
import { decryptSecret } from '../common/crypto.util';
import type { GenerateEWayBillDto } from './dto/ewaybill.dto';
import { buildEWayBillPayload } from './ewaybill-payload';
import {
  type EWayBillCredentials,
  type EWayBillProvider,
} from './ewaybill-provider';
import { SandboxEWayBillProvider } from './sandbox-ewaybill-provider';

/**
 * Stable message shown when a company tries to generate an e-way bill before
 * saving its NIC API credentials. The web matches on this to surface a setup
 * prompt with direct links.
 */
export const EWB_NO_CREDENTIALS_MESSAGE =
  'E-way bill API credentials are not set for this company. Add your NIC e-way bill API username and password under Settings → E-Way Bill Portal.';

const DAY_MS = 24 * 60 * 60 * 1000;

type EwbCreds = {
  gstin: string | null;
  ewbApiUsername: string | null;
  ewbApiPassword: string | null;
};

@Injectable()
export class EWayBillService {
  // Live NIC/GSP provider, available when Sandbox is configured. E-way bill
  // generation is only possible once a company saves its own API credentials —
  // there is no simulator fallback.
  private readonly live: EWayBillProvider | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    sandbox: SandboxService,
  ) {
    this.live = sandbox.enabled ? new SandboxEWayBillProvider(sandbox) : null;
  }

  /** Builds live credentials from a company, or undefined when not set up. */
  private credsFor(c: EwbCreds): EWayBillCredentials | undefined {
    if (!(c.gstin && c.ewbApiUsername && c.ewbApiPassword)) return undefined;
    const key =
      this.config.get<string>('ENCRYPTION_KEY') ||
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    return {
      gstin: c.gstin,
      username: c.ewbApiUsername,
      password: decryptSecret(c.ewbApiPassword, key),
    };
  }

  private displayNo(fiscalYear: string, invoiceNo: number) {
    return `INV/${fiscalYear}/${String(invoiceNo).padStart(4, '0')}`;
  }

  async get(companyId: string, invoiceId: string, branchScope?: string) {
    await this.requireInvoice(companyId, invoiceId, branchScope);
    const ewb = await this.prisma.eWayBill.findUnique({ where: { invoiceId } });
    return ewb ? this.serialize(ewb) : null;
  }

  async generate(
    companyId: string,
    invoiceId: string,
    dto: GenerateEWayBillDto,
    branchScope?: string,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, companyId, ...(branchScope && { branchId: branchScope }) },
      include: { company: true, party: true, lines: { orderBy: { lineNo: 'asc' } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Cannot raise an e-way bill for a cancelled invoice');
    }
    if (!invoice.company.gstin) {
      throw new BadRequestException(
        'Your company has no GSTIN — set it in Settings before generating e-way bills',
      );
    }

    const existing = await this.prisma.eWayBill.findUnique({ where: { invoiceId } });
    if (existing) {
      if (existing.status === EWayBillStatus.GENERATED) {
        throw new BadRequestException('This invoice already has an e-way bill');
      }
      throw new BadRequestException(
        'This invoice’s e-way bill was cancelled — raise a fresh invoice to re-generate',
      );
    }

    const displayNo = this.displayNo(invoice.fiscalYear, invoice.invoiceNo);
    const payload = buildEWayBillPayload(invoice, displayNo, dto);
    const now = new Date();
    // Generation requires the live NIC portal + this company's own API
    // credentials. No simulator fallback — block with a clear message instead.
    if (!this.live) {
      throw new BadRequestException(
        'E-way bill generation is not enabled on this server.',
      );
    }
    const creds = this.credsFor(invoice.company);
    if (!creds) {
      throw new BadRequestException(EWB_NO_CREDENTIALS_MESSAGE);
    }
    const result = await this.live.generate(payload, now, creds);

    const ewb = await this.prisma.eWayBill.create({
      data: {
        invoiceId,
        status: EWayBillStatus.GENERATED,
        ewbNo: result.ewbNo,
        ewbDate: result.ewbDate,
        validUpto: result.validUpto,
        transportMode: dto.transportMode,
        vehicleNo: dto.vehicleNo,
        transporterId: dto.transporterId,
        transporterName: dto.transporterName,
        transportDocNo: dto.transportDocNo,
        transportDocDate: dto.transportDocDate ? new Date(dto.transportDocDate) : null,
        distanceKm: dto.distanceKm,
        provider: result.provider,
        requestJson: JSON.stringify(payload),
      },
    });
    return this.serialize(ewb);
  }

  async cancel(
    companyId: string,
    invoiceId: string,
    reason: string,
    branchScope?: string,
  ) {
    await this.requireInvoice(companyId, invoiceId, branchScope);
    const ewb = await this.prisma.eWayBill.findUnique({ where: { invoiceId } });
    if (!ewb) throw new NotFoundException('No e-way bill for this invoice');
    if (ewb.status === EWayBillStatus.CANCELLED) {
      throw new BadRequestException('e-Way bill is already cancelled');
    }
    const now = new Date();
    if (now.getTime() - ewb.ewbDate.getTime() > DAY_MS) {
      throw new BadRequestException(
        'The 24-hour cancellation window has passed for this e-way bill',
      );
    }
    // Only call the portal for EWBs that were generated live; simulator EWBs
    // are cancelled locally with no upstream call.
    if (ewb.provider === this.live?.name) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { gstin: true, ewbApiUsername: true, ewbApiPassword: true },
      });
      const creds = company ? this.credsFor(company) : undefined;
      if (this.live && creds) {
        await this.live.cancel(ewb.ewbNo, reason, now, creds);
      }
    }
    const updated = await this.prisma.eWayBill.update({
      where: { invoiceId },
      data: {
        status: EWayBillStatus.CANCELLED,
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

  private serialize(ewb: {
    status: EWayBillStatus;
    ewbNo: string;
    ewbDate: Date;
    validUpto: Date;
    transportMode: string;
    vehicleNo: string | null;
    transporterName: string | null;
    distanceKm: number;
    provider: string;
    cancelReason: string | null;
    cancelledAt: Date | null;
  }) {
    return {
      status: ewb.status,
      ewbNo: ewb.ewbNo,
      ewbDate: ewb.ewbDate,
      validUpto: ewb.validUpto,
      transportMode: ewb.transportMode,
      vehicleNo: ewb.vehicleNo,
      transporterName: ewb.transporterName,
      distanceKm: ewb.distanceKm,
      provider: ewb.provider,
      cancelReason: ewb.cancelReason,
      cancelledAt: ewb.cancelledAt,
    };
  }
}
