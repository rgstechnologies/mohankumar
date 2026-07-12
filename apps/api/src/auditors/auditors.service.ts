import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ServiceRequestKind, ServiceRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditorPdfService } from './auditor-pdf.service';
import type {
  CreateAuditorDto,
  CreateServiceDto,
  CreateTierDto,
  TierFeatureDto,
  UpdateAuditorDto,
  UpdateServiceDto,
  UpdateTierDto,
} from './dto/auditor.dto';

type TierRow = {
  id: string;
  name: string;
  price: Prisma.Decimal;
  gstApplicable: boolean;
  gstPercent: Prisma.Decimal;
  description: string | null;
  deliveryTimeline: string | null;
  revisions: number | null;
  prioritySupport: boolean;
  dedicatedConsultant: boolean;
  billingType: string;
  isActive: boolean;
  sortOrder: number;
  features: { id: string; label: string; included: boolean; sortOrder: number }[];
};

type ServiceRow = {
  id: string;
  name: string;
  category: string | null;
  shortDesc: string | null;
  detailDesc: string | null;
  image: string | null;
  deliveryTime: string | null;
  isActive: boolean;
  sortOrder: number;
  tiers: TierRow[];
};

type AuditorRow = {
  id: string;
  displayName: string;
  firmName: string | null;
  tagline: string | null;
  bio: string | null;
  experienceYrs: number | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  logo: string | null;
  isPublished: boolean;
  isActive: boolean;
  ratingAvg: Prisma.Decimal;
  ratingCount: number;
};

/**
 * Auditor Services Marketplace (Phase 1) — a standalone provider account owned
 * by a User. The auditor controls their own services + pricing tiers + feature
 * lists; RGS imposes no fixed pricing.
 */
@Injectable()
export class AuditorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: AuditorPdfService,
  ) {}

  /** Render a quotation/invoice PDF — accessible to its auditor OR its client. */
  async quotationPdf(quotationId: string, userId: string, lang?: string) {
    const q = await this.prisma.auditorQuotation.findUnique({
      where: { id: quotationId },
      include: {
        auditor: { select: { userId: true, displayName: true, firmName: true, email: true, phone: true, city: true, state: true } },
        client: { select: { name: true, email: true } },
      },
    });
    if (!q) throw new NotFoundException('Quotation not found');
    if (q.auditor.userId !== userId && q.clientUserId !== userId) {
      throw new ForbiddenException('Not your quotation');
    }
    const amount = Number(q.amount);
    const gstAmount = q.gstApplicable ? Math.round(amount * Number(q.gstPercent)) / 100 : 0;
    const buffer = await this.pdf.render(
      {
        quoteNo: q.quoteNo,
        invoiceNo: q.invoiceNo,
        status: q.status,
        description: q.description,
        amount,
        gstApplicable: q.gstApplicable,
        gstPercent: Number(q.gstPercent),
        gstAmount,
        total: Math.round((amount + gstAmount) * 100) / 100,
        billingType: q.billingType,
        dueDate: q.dueDate,
        notes: q.notes,
        createdAt: q.createdAt,
        auditor: q.auditor,
        client: q.client,
      },
      lang,
    );
    return { buffer, fileName: `${q.invoiceNo ?? q.quoteNo}.pdf` };
  }

  /** The caller's auditor profile, or null if they haven't created one yet. */
  async getMine(userId: string) {
    const auditor = await this.prisma.auditor.findUnique({ where: { userId } });
    return auditor ? this.serializeAuditor(auditor) : null;
  }

  /** Resolve the caller's auditor row (throws if they aren't an auditor yet). */
  private async requireAuditor(userId: string) {
    const auditor = await this.prisma.auditor.findUnique({ where: { userId } });
    if (!auditor) {
      throw new NotFoundException('You do not have an auditor profile yet');
    }
    return auditor;
  }

  async createProfile(userId: string, dto: CreateAuditorDto) {
    const existing = await this.prisma.auditor.findUnique({ where: { userId } });
    if (existing) {
      throw new BadRequestException('An auditor profile already exists for this account');
    }
    const auditor = await this.prisma.auditor.create({
      data: {
        userId,
        displayName: dto.displayName.trim(),
        firmName: dto.firmName?.trim() || null,
        tagline: dto.tagline?.trim() || null,
        bio: dto.bio?.trim() || null,
        experienceYrs: dto.experienceYrs ?? null,
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim() || null,
        city: dto.city?.trim() || null,
        state: dto.state?.trim() || null,
        logo: dto.logo ?? null,
        isPublished: dto.isPublished ?? false,
      },
    });
    return this.serializeAuditor(auditor);
  }

  async updateProfile(userId: string, dto: UpdateAuditorDto) {
    await this.requireAuditor(userId);
    const auditor = await this.prisma.auditor.update({
      where: { userId },
      data: {
        displayName: dto.displayName?.trim(),
        firmName: dto.firmName !== undefined ? dto.firmName.trim() || null : undefined,
        tagline: dto.tagline !== undefined ? dto.tagline.trim() || null : undefined,
        bio: dto.bio !== undefined ? dto.bio.trim() || null : undefined,
        experienceYrs: dto.experienceYrs,
        phone: dto.phone !== undefined ? dto.phone.trim() || null : undefined,
        email: dto.email !== undefined ? dto.email.trim() || null : undefined,
        city: dto.city !== undefined ? dto.city.trim() || null : undefined,
        state: dto.state !== undefined ? dto.state.trim() || null : undefined,
        logo: dto.logo,
        isPublished: dto.isPublished,
      },
    });
    return this.serializeAuditor(auditor);
  }

  // -------------------------------------------------------------
  // Services (with nested tiers + features)
  // -------------------------------------------------------------

  async listServices(userId: string) {
    const auditor = await this.requireAuditor(userId);
    const services = await this.prisma.auditorService.findMany({
      where: { auditorId: auditor.id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        tiers: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: { features: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    return services.map((s) => this.serializeService(s));
  }

  async createService(userId: string, dto: CreateServiceDto) {
    const auditor = await this.requireAuditor(userId);
    const service = await this.prisma.auditorService.create({
      data: {
        auditorId: auditor.id,
        name: dto.name.trim(),
        category: dto.category?.trim() || null,
        shortDesc: dto.shortDesc?.trim() || null,
        detailDesc: dto.detailDesc?.trim() || null,
        image: dto.image ?? null,
        deliveryTime: dto.deliveryTime?.trim() || null,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: { tiers: { include: { features: true } } },
    });
    return this.serializeService(service);
  }

  async updateService(userId: string, serviceId: string, dto: UpdateServiceDto) {
    await this.ownedService(userId, serviceId);
    const service = await this.prisma.auditorService.update({
      where: { id: serviceId },
      data: {
        name: dto.name?.trim(),
        category: dto.category !== undefined ? dto.category.trim() || null : undefined,
        shortDesc: dto.shortDesc !== undefined ? dto.shortDesc.trim() || null : undefined,
        detailDesc: dto.detailDesc !== undefined ? dto.detailDesc.trim() || null : undefined,
        image: dto.image,
        deliveryTime:
          dto.deliveryTime !== undefined ? dto.deliveryTime.trim() || null : undefined,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
      include: {
        tiers: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: { features: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    return this.serializeService(service);
  }

  async deleteService(userId: string, serviceId: string) {
    await this.ownedService(userId, serviceId);
    await this.prisma.auditorService.delete({ where: { id: serviceId } });
    return { ok: true };
  }

  // -------------------------------------------------------------
  // Pricing tiers
  // -------------------------------------------------------------

  async createTier(userId: string, serviceId: string, dto: CreateTierDto) {
    await this.ownedService(userId, serviceId);
    const tier = await this.prisma.servicePricingTier.create({
      data: {
        serviceId,
        name: dto.name.trim(),
        price: dto.price,
        gstApplicable: dto.gstApplicable ?? false,
        gstPercent: dto.gstPercent ?? 0,
        description: dto.description?.trim() || null,
        deliveryTimeline: dto.deliveryTimeline?.trim() || null,
        revisions: dto.revisions ?? null,
        prioritySupport: dto.prioritySupport ?? false,
        dedicatedConsultant: dto.dedicatedConsultant ?? false,
        billingType: dto.billingType ?? 'one_time',
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        features: { create: this.featureRows(dto.features) },
      },
      include: { features: { orderBy: { sortOrder: 'asc' } } },
    });
    return this.serializeTier(tier);
  }

  async updateTier(
    userId: string,
    serviceId: string,
    tierId: string,
    dto: UpdateTierDto,
  ) {
    await this.ownedTier(userId, serviceId, tierId);
    // Replace-all the feature rows when `features` is provided.
    const tier = await this.prisma.$transaction(async (tx) => {
      if (dto.features !== undefined) {
        await tx.tierFeature.deleteMany({ where: { tierId } });
      }
      return tx.servicePricingTier.update({
        where: { id: tierId },
        data: {
          ...this.tierData(dto),
          ...(dto.features !== undefined
            ? { features: { create: this.featureRows(dto.features) } }
            : {}),
        },
        include: { features: { orderBy: { sortOrder: 'asc' } } },
      });
    });
    return this.serializeTier(tier);
  }

  async deleteTier(userId: string, serviceId: string, tierId: string) {
    await this.ownedTier(userId, serviceId, tierId);
    await this.prisma.servicePricingTier.delete({ where: { id: tierId } });
    return { ok: true };
  }

  // -------------------------------------------------------------
  // Marketplace (client-facing browse — any logged-in user)
  // -------------------------------------------------------------

  async browse(filters: {
    q?: string;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    city?: string;
    state?: string;
    minExperience?: number;
    minRating?: number;
  }) {
    const services = await this.prisma.auditorService.findMany({
      where: {
        isActive: true,
        auditor: {
          isPublished: true,
          isActive: true,
          ...(filters.state ? { state: filters.state } : {}),
          ...(filters.city
            ? { city: { contains: filters.city, mode: 'insensitive' } }
            : {}),
          ...(filters.minExperience
            ? { experienceYrs: { gte: filters.minExperience } }
            : {}),
          ...(filters.minRating ? { ratingAvg: { gte: filters.minRating } } : {}),
        },
        ...(filters.category
          ? { category: { contains: filters.category, mode: 'insensitive' } }
          : {}),
        ...(filters.q
          ? {
              OR: [
                { name: { contains: filters.q, mode: 'insensitive' } },
                { shortDesc: { contains: filters.q, mode: 'insensitive' } },
                { category: { contains: filters.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        auditor: true,
        tiers: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: { features: { orderBy: { sortOrder: 'asc' } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return services
      .map((s) => this.serializeMarketService(s))
      .filter((s) => {
        if (s.startingFrom == null) return false; // no active tier → not listable
        if (filters.minPrice != null && s.startingFrom < filters.minPrice) return false;
        if (filters.maxPrice != null && s.startingFrom > filters.maxPrice) return false;
        return true;
      });
  }

  async marketService(serviceId: string) {
    const s = await this.prisma.auditorService.findFirst({
      where: { id: serviceId, isActive: true, auditor: { isPublished: true, isActive: true } },
      include: {
        auditor: true,
        tiers: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: { features: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!s) throw new NotFoundException('Service not found');
    return this.serializeMarketService(s);
  }

  // -------------------------------------------------------------
  // Client engagement (requests + accepting quotations)
  // -------------------------------------------------------------

  async createRequest(
    userId: string,
    serviceId: string,
    dto: { kind: string; tierId?: string; message?: string },
  ) {
    const service = await this.prisma.auditorService.findFirst({
      where: { id: serviceId, isActive: true, auditor: { isPublished: true } },
      include: { auditor: { select: { userId: true } } },
    });
    if (!service) throw new NotFoundException('Service not found');
    if (service.auditor.userId === userId) {
      throw new BadRequestException('You cannot request your own service');
    }
    const req = await this.prisma.serviceRequest.create({
      data: {
        auditorId: service.auditorId,
        clientUserId: userId,
        serviceId,
        tierId: dto.tierId || null,
        kind: dto.kind as ServiceRequestKind,
        message: dto.message?.trim() || null,
      },
      include: this.requestInclude,
    });
    return this.serializeRequest(req);
  }

  async myRequests(userId: string) {
    const rows = await this.prisma.serviceRequest.findMany({
      where: { clientUserId: userId },
      orderBy: { createdAt: 'desc' },
      include: this.requestInclude,
    });
    return rows.map((r) => this.serializeRequest(r));
  }

  async myQuotations(userId: string) {
    const rows = await this.prisma.auditorQuotation.findMany({
      where: { clientUserId: userId },
      orderBy: { createdAt: 'desc' },
      include: this.quotationInclude,
    });
    return rows.map((q) => this.serializeQuotation(q));
  }

  /**
   * A business owner (the quotation's client) grants the quotation's auditor
   * read-only access to one of their companies — a CompanyUser AUDITOR row.
   */
  async grantAccess(clientUserId: string, quotationId: string, companyId: string) {
    const q = await this.prisma.auditorQuotation.findUnique({
      where: { id: quotationId },
      include: { auditor: { select: { userId: true, displayName: true } } },
    });
    if (!q || q.clientUserId !== clientUserId) {
      throw new NotFoundException('Quotation not found');
    }
    const membership = await this.prisma.companyUser.findUnique({
      where: { userId_companyId: { userId: clientUserId, companyId } },
    });
    if (!membership || !(['OWNER', 'ADMIN'] as string[]).includes(membership.role)) {
      throw new ForbiddenException('You must own this company to grant access');
    }
    if (q.auditor.userId === clientUserId) {
      throw new BadRequestException('That auditor is your own account');
    }
    await this.prisma.companyUser.upsert({
      where: { userId_companyId: { userId: q.auditor.userId, companyId } },
      update: { role: 'AUDITOR' },
      create: { userId: q.auditor.userId, companyId, role: 'AUDITOR' },
    });
    return { ok: true };
  }

  /** Companies a (logged-in) auditor has been granted read-only access to. */
  async myClients(userId: string) {
    const rows = await this.prisma.companyUser.findMany({
      where: { userId, role: 'AUDITOR' },
      include: { company: { select: { id: true, name: true, gstin: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      companyId: r.company.id,
      name: r.company.name,
      gstin: r.company.gstin,
    }));
  }

  async respondQuotation(userId: string, quotationId: string, accept: boolean) {
    const q = await this.prisma.auditorQuotation.findFirst({
      where: { id: quotationId, clientUserId: userId },
    });
    if (!q) throw new NotFoundException('Quotation not found');
    if (q.status !== 'PENDING') {
      throw new BadRequestException('This quotation has already been responded to');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const invoiceNo = accept ? await this.nextInvoiceNo(tx, q.auditorId) : null;
      const row = await tx.auditorQuotation.update({
        where: { id: q.id },
        data: {
          status: accept ? 'ACCEPTED' : 'DECLINED',
          invoiceNo,
          acceptedAt: accept ? new Date() : null,
        },
        include: this.quotationInclude,
      });
      if (q.requestId) {
        await tx.serviceRequest.update({
          where: { id: q.requestId },
          data: { status: accept ? 'ACCEPTED' : 'DECLINED' },
        });
      }
      return row;
    });
    return this.serializeQuotation(updated);
  }

  // -------------------------------------------------------------
  // Auditor inbox (requests + sending quotations)
  // -------------------------------------------------------------

  async listRequests(userId: string) {
    const auditor = await this.requireAuditor(userId);
    const rows = await this.prisma.serviceRequest.findMany({
      where: { auditorId: auditor.id },
      orderBy: { createdAt: 'desc' },
      include: this.requestInclude,
    });
    return rows.map((r) => this.serializeRequest(r));
  }

  async setRequestStatus(userId: string, requestId: string, status: string) {
    const req = await this.ownedRequest(userId, requestId);
    const row = await this.prisma.serviceRequest.update({
      where: { id: req.id },
      data: { status: status as ServiceRequestStatus },
      include: this.requestInclude,
    });
    return this.serializeRequest(row);
  }

  async createQuotation(
    userId: string,
    requestId: string,
    dto: {
      description: string;
      amount: number;
      gstApplicable?: boolean;
      gstPercent?: number;
      billingType?: string;
      dueDate?: string;
      notes?: string;
    },
  ) {
    const req = await this.ownedRequest(userId, requestId);
    const quotation = await this.prisma.$transaction(async (tx) => {
      const quoteNo = await this.nextQuoteNo(tx, req.auditorId);
      const created = await tx.auditorQuotation.create({
        data: {
          auditorId: req.auditorId,
          clientUserId: req.clientUserId,
          requestId: req.id,
          quoteNo,
          description: dto.description.trim(),
          amount: dto.amount,
          gstApplicable: dto.gstApplicable ?? false,
          gstPercent: dto.gstApplicable ? dto.gstPercent ?? 0 : 0,
          billingType: dto.billingType ?? 'one_time',
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          notes: dto.notes?.trim() || null,
        },
        include: this.quotationInclude,
      });
      await tx.serviceRequest.update({
        where: { id: req.id },
        data: { status: 'QUOTED' },
      });
      return created;
    });
    return this.serializeQuotation(quotation);
  }

  async listQuotations(userId: string) {
    const auditor = await this.requireAuditor(userId);
    const rows = await this.prisma.auditorQuotation.findMany({
      where: { auditorId: auditor.id },
      orderBy: { createdAt: 'desc' },
      include: this.quotationInclude,
    });
    return rows.map((q) => this.serializeQuotation(q));
  }

  // -------------------------------------------------------------
  // Reviews & ratings (Phase 3)
  // -------------------------------------------------------------

  async listReviews(auditorId: string) {
    const rows = await this.prisma.serviceReview.findMany({
      where: { auditorId },
      orderBy: { createdAt: 'desc' },
      include: { client: { select: { name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      clientName: r.client.name,
      createdAt: r.createdAt,
    }));
  }

  async createReview(
    userId: string,
    auditorId: string,
    dto: { rating: number; comment?: string },
  ) {
    const auditor = await this.prisma.auditor.findUnique({
      where: { id: auditorId },
      select: { userId: true },
    });
    if (auditor?.userId === userId) {
      throw new BadRequestException('You cannot review your own profile');
    }
    // Only clients who actually engaged (have an accepted quotation) can review.
    const accepted = await this.prisma.auditorQuotation.count({
      where: { auditorId, clientUserId: userId, status: 'ACCEPTED' },
    });
    if (accepted === 0) {
      throw new BadRequestException(
        'You can only review an auditor after accepting one of their quotations',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.serviceReview.upsert({
        where: { auditorId_clientUserId: { auditorId, clientUserId: userId } },
        create: { auditorId, clientUserId: userId, rating: dto.rating, comment: dto.comment?.trim() || null },
        update: { rating: dto.rating, comment: dto.comment?.trim() || null },
      });
      const agg = await tx.serviceReview.aggregate({
        where: { auditorId },
        _avg: { rating: true },
        _count: true,
      });
      await tx.auditor.update({
        where: { id: auditorId },
        data: {
          ratingAvg: Math.round((agg._avg.rating ?? 0) * 100) / 100,
          ratingCount: agg._count,
        },
      });
    });
    return { ok: true };
  }

  // -------------------------------------------------------------
  // Analytics (auditor dashboard)
  // -------------------------------------------------------------

  async analytics(userId: string) {
    const auditor = await this.requireAuditor(userId);
    const [totalServices, requests, quotations] = await Promise.all([
      this.prisma.auditorService.count({ where: { auditorId: auditor.id } }),
      this.prisma.serviceRequest.findMany({
        where: { auditorId: auditor.id },
        select: { kind: true, serviceId: true, service: { select: { name: true } } },
      }),
      this.prisma.auditorQuotation.findMany({
        where: { auditorId: auditor.id },
        select: {
          status: true,
          amount: true,
          request: { select: { service: { select: { id: true, name: true } } } },
        },
      }),
    ]);

    const byKind = { ENQUIRY: 0, SERVICE: 0, CUSTOM_QUOTE: 0 } as Record<string, number>;
    for (const r of requests) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;

    const sent = quotations.length;
    const accepted = quotations.filter((q) => q.status === 'ACCEPTED');
    const revenue = accepted.reduce((s, q) => s + Number(q.amount), 0);

    // Revenue + count per service (from accepted quotations via their request).
    const perService = new Map<string, { name: string; revenue: number; count: number }>();
    for (const q of accepted) {
      const svc = q.request?.service;
      const key = svc?.id ?? '__custom__';
      const name = svc?.name ?? 'Custom quotes';
      const cur = perService.get(key) ?? { name, revenue: 0, count: 0 };
      cur.revenue += Number(q.amount);
      cur.count += 1;
      perService.set(key, cur);
    }
    const revenuePerService = [...perService.values()].sort((a, b) => b.revenue - a.revenue);
    const mostPurchased = revenuePerService.length
      ? [...revenuePerService].sort((a, b) => b.count - a.count)[0].name
      : null;

    return {
      totalServices,
      totalRequests: requests.length,
      requestsByKind: byKind,
      quotationsSent: sent,
      quotationsAccepted: accepted.length,
      revenue: Math.round(revenue * 100) / 100,
      conversionRate: sent ? Math.round((accepted.length / sent) * 1000) / 10 : 0,
      enquiries: byKind.ENQUIRY,
      purchases: accepted.length,
      mostPurchased,
      revenuePerService,
    };
  }

  private async ownedRequest(userId: string, requestId: string) {
    const auditor = await this.requireAuditor(userId);
    const req = await this.prisma.serviceRequest.findFirst({
      where: { id: requestId, auditorId: auditor.id },
    });
    if (!req) throw new NotFoundException('Request not found');
    return req;
  }

  private async nextQuoteNo(tx: Prisma.TransactionClient, auditorId: string) {
    const c = await tx.auditorCounter.upsert({
      where: { auditorId },
      create: { auditorId, nextQuoteNo: 2 },
      update: { nextQuoteNo: { increment: 1 } },
    });
    return `Q-${String(c.nextQuoteNo - 1).padStart(4, '0')}`;
  }

  private async nextInvoiceNo(tx: Prisma.TransactionClient, auditorId: string) {
    const c = await tx.auditorCounter.upsert({
      where: { auditorId },
      create: { auditorId, nextInvoiceNo: 2 },
      update: { nextInvoiceNo: { increment: 1 } },
    });
    return `INV-${String(c.nextInvoiceNo - 1).padStart(4, '0')}`;
  }

  private readonly requestInclude = {
    auditor: { select: { id: true, displayName: true } },
    client: { select: { id: true, name: true, email: true } },
    service: { select: { id: true, name: true } },
    tier: { select: { id: true, name: true, price: true } },
    quotations: { select: { id: true, quoteNo: true, status: true } },
  } satisfies Prisma.ServiceRequestInclude;

  private readonly quotationInclude = {
    auditor: { select: { id: true, displayName: true } },
    client: { select: { id: true, name: true, email: true } },
  } satisfies Prisma.AuditorQuotationInclude;

  private serializeMarketService(s: ServiceRow & { auditor: AuditorRow }) {
    const base = this.serializeService(s);
    return {
      ...base,
      auditor: {
        id: s.auditor.id,
        displayName: s.auditor.displayName,
        firmName: s.auditor.firmName,
        city: s.auditor.city,
        state: s.auditor.state,
        experienceYrs: s.auditor.experienceYrs,
        ratingAvg: Number(s.auditor.ratingAvg),
        ratingCount: s.auditor.ratingCount,
        logo: s.auditor.logo,
      },
    };
  }

  private serializeRequest(r: {
    id: string;
    kind: string;
    status: string;
    message: string | null;
    createdAt: Date;
    auditor: { id: string; displayName: string };
    client: { id: string; name: string; email: string };
    service: { id: string; name: string } | null;
    tier: { id: string; name: string; price: Prisma.Decimal } | null;
    quotations: { id: string; quoteNo: string; status: string }[];
  }) {
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      message: r.message,
      createdAt: r.createdAt,
      auditor: r.auditor,
      client: r.client,
      service: r.service,
      tier: r.tier ? { id: r.tier.id, name: r.tier.name, price: Number(r.tier.price) } : null,
      quotations: r.quotations,
    };
  }

  private serializeQuotation(q: {
    id: string;
    quoteNo: string;
    description: string;
    amount: Prisma.Decimal;
    gstApplicable: boolean;
    gstPercent: Prisma.Decimal;
    billingType: string;
    dueDate: Date | null;
    notes: string | null;
    status: string;
    invoiceNo: string | null;
    acceptedAt: Date | null;
    createdAt: Date;
    auditor: { id: string; displayName: string };
    client: { id: string; name: string; email: string };
  }) {
    const amount = Number(q.amount);
    const gst = q.gstApplicable ? Math.round(amount * Number(q.gstPercent)) / 100 : 0;
    return {
      id: q.id,
      quoteNo: q.quoteNo,
      description: q.description,
      amount,
      gstApplicable: q.gstApplicable,
      gstPercent: Number(q.gstPercent),
      gstAmount: gst,
      billingType: q.billingType,
      total: Math.round((amount + gst) * 100) / 100,
      dueDate: q.dueDate,
      notes: q.notes,
      status: q.status,
      invoiceNo: q.invoiceNo,
      acceptedAt: q.acceptedAt,
      createdAt: q.createdAt,
      auditor: q.auditor,
      client: q.client,
    };
  }

  // -------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------

  private tierData(dto: CreateTierDto | UpdateTierDto) {
    return {
      name: dto.name?.trim(),
      price: dto.price,
      gstApplicable: dto.gstApplicable,
      gstPercent: dto.gstPercent,
      description: dto.description !== undefined ? dto.description.trim() || null : undefined,
      deliveryTimeline:
        dto.deliveryTimeline !== undefined ? dto.deliveryTimeline.trim() || null : undefined,
      revisions: dto.revisions,
      prioritySupport: dto.prioritySupport,
      dedicatedConsultant: dto.dedicatedConsultant,
      billingType: dto.billingType,
      isActive: dto.isActive,
      sortOrder: dto.sortOrder,
    };
  }

  private featureRows(features?: TierFeatureDto[]) {
    return (features ?? [])
      .map((f, i) => ({
        label: (f.label ?? '').trim(),
        included: f.included ?? true,
        sortOrder: f.sortOrder ?? i,
      }))
      .filter((f) => f.label.length > 0);
  }

  /** Verify the service belongs to the caller's auditor. */
  private async ownedService(userId: string, serviceId: string) {
    const auditor = await this.requireAuditor(userId);
    const service = await this.prisma.auditorService.findFirst({
      where: { id: serviceId, auditorId: auditor.id },
    });
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  private async ownedTier(userId: string, serviceId: string, tierId: string) {
    await this.ownedService(userId, serviceId);
    const tier = await this.prisma.servicePricingTier.findFirst({
      where: { id: tierId, serviceId },
    });
    if (!tier) throw new NotFoundException('Pricing tier not found');
    return tier;
  }

  private serializeAuditor(a: AuditorRow) {
    return {
      id: a.id,
      displayName: a.displayName,
      firmName: a.firmName,
      tagline: a.tagline,
      bio: a.bio,
      experienceYrs: a.experienceYrs,
      phone: a.phone,
      email: a.email,
      city: a.city,
      state: a.state,
      logo: a.logo,
      isPublished: a.isPublished,
      isActive: a.isActive,
      ratingAvg: Number(a.ratingAvg),
      ratingCount: a.ratingCount,
    };
  }

  private serializeService(s: ServiceRow) {
    const tiers = s.tiers.map((t) => this.serializeTier(t));
    const activePrices = tiers.filter((t) => t.isActive).map((t) => t.price);
    return {
      id: s.id,
      name: s.name,
      category: s.category,
      shortDesc: s.shortDesc,
      detailDesc: s.detailDesc,
      image: s.image,
      deliveryTime: s.deliveryTime,
      isActive: s.isActive,
      sortOrder: s.sortOrder,
      tiers,
      // "Starting From ₹X" — lowest active tier price (null if none active).
      startingFrom: activePrices.length ? Math.min(...activePrices) : null,
    };
  }

  private serializeTier(t: TierRow) {
    return {
      id: t.id,
      name: t.name,
      price: Number(t.price),
      gstApplicable: t.gstApplicable,
      gstPercent: Number(t.gstPercent),
      description: t.description,
      deliveryTimeline: t.deliveryTimeline,
      revisions: t.revisions,
      prioritySupport: t.prioritySupport,
      dedicatedConsultant: t.dedicatedConsultant,
      billingType: t.billingType,
      isActive: t.isActive,
      sortOrder: t.sortOrder,
      features: t.features.map((f) => ({
        id: f.id,
        label: f.label,
        included: f.included,
        sortOrder: f.sortOrder,
      })),
    };
  }
}
