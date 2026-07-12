import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { AccountingService } from '../accounting/accounting.service';
import { LicensingService } from '../licensing/licensing.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { SandboxService } from '../sandbox/sandbox.service';
import { encryptSecret } from '../common/crypto.util';
import { DOC_KINDS, type DocKind } from '../invoices/invoice-template';
import type { CreateCompanyDto, CreateInviteDto } from './dto/company.dto';

const INVITE_TTL_DAYS = 7;

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly accounting: AccountingService,
    private readonly licensing: LicensingService,
    private readonly sandbox: SandboxService,
  ) {}

  /**
   * Creates a company; the creator becomes OWNER and the default Indian
   * chart of accounts + system ledgers are seeded in the same transaction.
   */
  async create(userId: string, dto: CreateCompanyDto) {
    await this.licensing.assertCanCreateCompany(userId);
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
      loyaltyEnabled?: boolean;
      loyaltyEarnPercent?: number;
      loyaltyRedeemValue?: number;
      salesPaymentLink?: 'invoice' | 'estimate';
      purchasePaymentLink?: 'purchase' | 'purchaseEstimate';
      ewbApiUsername?: string | null;
      ewbApiPassword?: string | null;
      einvoiceApiUsername?: string | null;
      einvoiceApiPassword?: string | null;
    },
  ) {
    // Encrypt the e-way bill API password at rest. `undefined` leaves it
    // untouched; null / blank clears it; a value is encrypted before storage.
    const ewbApiPassword =
      dto.ewbApiPassword === undefined
        ? undefined
        : dto.ewbApiPassword && dto.ewbApiPassword.trim()
          ? encryptSecret(dto.ewbApiPassword.trim(), this.encryptionKey())
          : null;
    // Same handling for the e-invoice (IRP) API password.
    const einvoiceApiPassword =
      dto.einvoiceApiPassword === undefined
        ? undefined
        : dto.einvoiceApiPassword && dto.einvoiceApiPassword.trim()
          ? encryptSecret(dto.einvoiceApiPassword.trim(), this.encryptionKey())
          : null;
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
        loyaltyEnabled: dto.loyaltyEnabled,
        loyaltyEarnPercent: dto.loyaltyEarnPercent,
        loyaltyRedeemValue: dto.loyaltyRedeemValue,
        salesPaymentLink: dto.salesPaymentLink,
        purchasePaymentLink: dto.purchasePaymentLink,
        ewbApiUsername: dto.ewbApiUsername,
        ewbApiPassword,
        einvoiceApiUsername: dto.einvoiceApiUsername,
        einvoiceApiPassword,
      },
    });
    return this.stripSecrets(company);
  }

  /** Never expose stored API passwords; signal presence for each instead. */
  private stripSecrets<
    T extends {
      ewbApiPassword?: string | null;
      einvoiceApiPassword?: string | null;
    },
  >(company: T) {
    const { ewbApiPassword, einvoiceApiPassword, ...rest } = company;
    return {
      ...rest,
      ewbApiPasswordSet: !!ewbApiPassword,
      einvoiceApiPasswordSet: !!einvoiceApiPassword,
    };
  }

  /** Symmetric-encryption key for secrets at rest (falls back to the JWT secret). */
  private encryptionKey(): string {
    return (
      this.config.get<string>('ENCRYPTION_KEY') ||
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET')
    );
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
    return this.stripSecrets(company);
  }

  async invite(companyId: string, inviterId: string, dto: CreateInviteDto) {
    await this.licensing.assertCanInvite(companyId);
    const email = dto.email.trim().toLowerCase();

    const [company, inviter, existingUser] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: inviterId } }),
      this.prisma.user.findUnique({ where: { email } }),
    ]);

    if (existingUser) {
      const existingMembership = await this.prisma.companyUser.findUnique({
        where: { userId_companyId: { userId: existingUser.id, companyId } },
      });
      if (existingMembership) {
        throw new ConflictException('This user is already a member of the company');
      }
    }

    const pendingInvite = await this.prisma.invite.findFirst({
      where: {
        companyId,
        email,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (pendingInvite) {
      throw new ConflictException('An invite for this email is already pending');
    }

    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, companyId, isActive: true },
      });
      if (!branch) throw new BadRequestException('Unknown branch');
    }

    const token = randomBytes(32).toString('hex');
    const invite = await this.prisma.invite.create({
      data: {
        email,
        companyId,
        role: dto.role,
        branchId: dto.branchId ?? null,
        invitedById: inviterId,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 3600 * 1000),
      },
    });

    const acceptUrl = `${this.config.getOrThrow<string>('WEB_ORIGIN')}/invite/${token}`;
    await this.mail.sendInvite({
      to: email,
      companyName: company.name,
      role: dto.role,
      inviterName: inviter.name,
      acceptUrl,
    });

    return { id: invite.id, email, role: invite.role, expiresAt: invite.expiresAt };
  }

  async listInvites(companyId: string) {
    return this.prisma.invite.findMany({
      where: { companyId, acceptedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
        invitedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Public: preview an invite by token (for the accept page). */
  async previewInvite(token: string) {
    const invite = await this.findValidInvite(token);
    const userExists =
      (await this.prisma.user.findUnique({ where: { email: invite.email } })) !==
      null;
    return {
      email: invite.email,
      role: invite.role,
      companyName: invite.company.name,
      invitedBy: invite.invitedBy.name,
      userExists,
    };
  }

  /**
   * Public: accept an invite. Existing users just gain the membership;
   * new users must supply name + passwordHash (prepared by AuthService).
   */
  async acceptInvite(
    token: string,
    newUser?: { name: string; passwordHash: string },
  ) {
    const invite = await this.findValidInvite(token);

    let user = await this.prisma.user.findUnique({
      where: { email: invite.email },
    });

    if (!user) {
      if (!newUser) {
        throw new BadRequestException(
          'Name and password are required to create your account',
        );
      }
      user = await this.prisma.user.create({
        data: {
          email: invite.email,
          name: newUser.name.trim(),
          passwordHash: newUser.passwordHash,
        },
      });
    }

    await this.prisma.$transaction([
      this.prisma.companyUser.upsert({
        where: {
          userId_companyId: { userId: user.id, companyId: invite.companyId },
        },
        update: {},
        create: {
          userId: user.id,
          companyId: invite.companyId,
          role: invite.role,
          branchId: invite.branchId,
        },
      }),
      this.prisma.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      }),
    ]);

    return { companyId: invite.companyId, email: invite.email };
  }

  /** Auditors granted read-only access to this company. */
  async listGrantedAuditors(companyId: string) {
    const rows = await this.prisma.companyUser.findMany({
      where: { companyId, role: 'AUDITOR' },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      userId: r.user.id,
      name: r.user.name,
      email: r.user.email,
      since: r.createdAt,
    }));
  }

  /** Revoke an auditor's read-only access to this company. */
  async revokeAuditorAccess(companyId: string, auditorUserId: string) {
    await this.prisma.companyUser.deleteMany({
      where: { companyId, userId: auditorUserId, role: 'AUDITOR' },
    });
    return { ok: true };
  }

  private async findValidInvite(token: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: {
        company: { select: { name: true } },
        invitedBy: { select: { name: true } },
      },
    });
    if (!invite || invite.acceptedAt !== null || invite.expiresAt < new Date()) {
      throw new NotFoundException('This invite is invalid or has expired');
    }
    return invite;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // ----------------------------------------------------------------- GSTIN

  /**
   * Fetches live GSTIN details from Sandbox.co.in's public GSTIN search API.
   * Returns a normalised subset: trade name, legal name, address, state, status.
   */
  async resolveGstin(gstin: string) {
    if (!this.sandbox.enabled) {
      throw new BadRequestException(
        'GSTIN lookup is not available — Sandbox.co.in credentials are not configured',
      );
    }

    type SandboxGstinResponse = {
      code: number;
      data: {
        data: {
          gstin: string;
          lgnm: string;
          tradeNam: string;
          sts: string;
          dty: string;
          ctb: string;
          rgdt: string;
          lstupdt: string;
          einvoiceStatus: string;
          pradr: {
            addr: {
              bno: string;
              flno: string;
              bnm: string;
              st: string;
              loc: string;
              dst: string;
              stcd: string;
              pncd: string;
            };
            ntr: string;
          };
        };
        status_cd: string;
      };
    };

    let res: SandboxGstinResponse;
    try {
      res = await this.sandbox.post<SandboxGstinResponse>(
        '/gst/compliance/public/gstin/search',
        { gstin: gstin.toUpperCase() },
      );
    } catch (err) {
      // The portal rejects malformed / unknown GSTINs with a 4xx. Surface a
      // clean 400 with a helpful message instead of a raw 500.
      const msg = err instanceof Error ? err.message : '';
      throw new BadRequestException(
        /invalid gstin/i.test(msg)
          ? 'Invalid GSTIN — check the 15-character number and try again'
          : 'GSTIN lookup failed — the government portal could not be reached',
      );
    }

    if (res.code !== 200 || res.data.status_cd !== '1') {
      throw new BadRequestException(
        `GSTIN lookup failed — the portal returned status ${res.data.status_cd ?? res.code}`,
      );
    }

    const d = res.data.data;
    const a = d.pradr?.addr;

    return {
      gstin: d.gstin,
      legalName: d.lgnm,
      tradeName: d.tradeNam,
      status: d.sts,
      dealerType: d.dty,
      constitutionOfBusiness: d.ctb,
      registrationDate: d.rgdt,
      lastUpdated: d.lstupdt,
      einvoiceEnabled: d.einvoiceStatus === 'Yes',
      address: a
        ? {
            building: [a.flno, a.bno, a.bnm].filter(Boolean).join(', '),
            street: a.st,
            city: a.loc,
            district: a.dst,
            state: a.stcd,
            pincode: a.pncd,
          }
        : null,
    };
  }
}
