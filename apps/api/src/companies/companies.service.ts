import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import { createHash } from 'crypto';import { AccountingService } from '../accounting/accounting.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { DOC_KINDS, type DocKind } from '../invoices/invoice-template';
import type { CreateCompanyDto } from './dto/company.dto';


@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly accounting: AccountingService,
  ) {}

  /**
   * Creates a company; the creator becomes OWNER and the default Indian
   * chart of accounts + system ledgers are seeded in the same transaction.
   */
  async create(userId: string, dto: CreateCompanyDto) {
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          ...dto,
          // State code can be derived from GSTIN when not given explicitly.
          stateCode: dto.stateCode ?? dto.gstin?.slice(0, 2),
          members: { create: { userId, role: Role.OWNER } },
        },
      });
      await this.accounting.seedDefaults(tx, company.id);
      return company;
    });
  }

  async listMine(userId: string) {
    const memberships = await this.prisma.companyUser.findMany({
      where: { userId, company: { isActive: true } },
      select: { role: true, company: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({ role: m.role, ...m.company }));
  }

  async update(
    companyId: string,
    dto: {
      name?: string;
      printName?: string | null;
      legalName?: string;
      gstin?: string;
      stateCode?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      pincode?: string;
      upiId?: string | null;
      phone?: string | null;
      email?: string | null;
      bankName?: string | null;
      bankAccountName?: string | null;
      bankAccountNo?: string | null;
      bankIfsc?: string | null;
      bankBranch?: string | null;
      logo?: string | null;
      invoiceTemplate?: object;
      salesPaymentLink?: 'invoice' | 'estimate';
    },
  ) {
    const company = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        name: dto.name,
        printName: dto.printName,
        legalName: dto.legalName,
        gstin: dto.gstin,
        stateCode: dto.stateCode ?? dto.gstin?.slice(0, 2),
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2,
        city: dto.city,
        pincode: dto.pincode,
        upiId: dto.upiId,
        phone: dto.phone,
        email: dto.email,
        bankName: dto.bankName,
        bankAccountName: dto.bankAccountName,
        bankAccountNo: dto.bankAccountNo,
        bankIfsc: dto.bankIfsc,
        bankBranch: dto.bankBranch,
        logo: dto.logo,
        invoiceTemplate: dto.invoiceTemplate as Prisma.InputJsonValue | undefined,
        salesPaymentLink: dto.salesPaymentLink,
      },
    });
    return company;
  }

  /** Saves the print layout for a single document type into the per-form map. */
  async setDocumentTemplate(
    companyId: string,
    docKind: string,
    template: object,
  ) {
    if (!DOC_KINDS.includes(docKind as DocKind)) {
      throw new BadRequestException('Unknown document type');
    }
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { documentTemplates: true },
    });
    const map =
      company.documentTemplates && typeof company.documentTemplates === 'object'
        ? { ...(company.documentTemplates as Record<string, unknown>) }
        : {};
    map[docKind] = template;
    await this.prisma.company.update({
      where: { id: companyId },
      data: { documentTemplates: map as Prisma.InputJsonValue },
    });
    return { ok: true };
  }

  async getOne(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        members: {
          select: {
            role: true,
            createdAt: true,
            user: { select: { id: true, name: true, email: true } },
            branch: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  /**
   * Team invites are deliberately not part of this build: it is a single-login
   * install, and an emailed, publicly-redeemable invite token would be an entry
   * point we don't need. Extra logins are provisioned directly by the operator.
   */

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

}
