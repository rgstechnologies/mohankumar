import {
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Seeded plan catalogue — editable from the admin console afterwards. */
const DEFAULT_PLANS = [
  {
    code: 'TRIAL',
    name: '3-Month Free Trial',
    priceMonthly: 0,
    maxCompanies: 1,
    maxBranches: 2,
    maxMembers: 3,
    // RGS ships a generous 3-month free trial (≈90 days).
    trialDays: 90,
    features: { payroll: true, ai: true },
    sortOrder: 0,
  },
  {
    code: 'STARTER',
    name: 'Starter',
    priceMonthly: 299,
    maxCompanies: 1,
    maxBranches: 1,
    maxMembers: 5,
    trialDays: 0,
    features: { payroll: false, ai: false },
    sortOrder: 1,
  },
  {
    code: 'BUSINESS',
    name: 'Business',
    priceMonthly: 799,
    maxCompanies: 5,
    maxBranches: -1,
    maxMembers: -1,
    trialDays: 0,
    features: { payroll: true, ai: true },
    sortOrder: 2,
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    priceMonthly: 1999,
    maxCompanies: -1,
    maxBranches: -1,
    maxMembers: -1,
    trialDays: 0,
    features: { payroll: true, ai: true },
    sortOrder: 3,
  },
] as const;

type SubWithPlan = Prisma.UserSubscriptionGetPayload<{ include: { plan: true } }>;

export interface SubscriptionSummary {
  planCode: string;
  planName: string;
  status: SubscriptionStatus;
  expiresAt: Date | null;
  daysLeft: number | null;
  maxCompanies: number;
  companiesOwned: number;
  maxBranches: number;
  maxMembers: number;
  features: Record<string, boolean>;
}

/**
 * Plan limits and feature switches. Every check resolves the OWNING user's
 * subscription (companies are licensed through their owner) and super
 * admins bypass everything.
 */
@Injectable()
export class LicensingService implements OnModuleInit {
  private readonly logger = new Logger('Licensing');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Idempotent: seed the plan catalogue + flag the bootstrap super admin. */
  async onModuleInit(): Promise<void> {
    for (const plan of DEFAULT_PLANS) {
      const { code, features, ...rest } = plan;
      // Refresh limits + feature flags on every boot so the catalogue always
      // matches code — important now that feature gating is fail-closed (a plan
      // row seeded before a flag existed must not silently deny the feature).
      const data = { ...rest, features: features as Prisma.InputJsonObject };
      await this.prisma.plan.upsert({
        where: { code },
        update: data,
        create: { code, ...data },
      });
    }

    const adminEmail = this.config.get<string>('SUPER_ADMIN_EMAIL');
    if (adminEmail) {
      const user = await this.prisma.user.findUnique({
        where: { email: adminEmail.trim().toLowerCase() },
      });
      if (user && !user.isSuperAdmin) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { isSuperAdmin: true },
        });
        this.logger.log(`Granted super admin to ${adminEmail}`);
      }
    }
  }

  // -------------------------------------------------------------
  // Subscription resolution
  // -------------------------------------------------------------

  /** TRIAL/ACTIVE past their expiry count as EXPIRED. */
  effectiveStatus(sub: { status: SubscriptionStatus; expiresAt: Date | null }): SubscriptionStatus {
    if (
      (sub.status === SubscriptionStatus.TRIAL || sub.status === SubscriptionStatus.ACTIVE) &&
      sub.expiresAt !== null &&
      sub.expiresAt.getTime() < Date.now()
    ) {
      return SubscriptionStatus.EXPIRED;
    }
    return sub.status;
  }

  /** Users created before licensing (or via invites) lazily start a trial. */
  async getOrCreateSubscription(userId: string): Promise<SubWithPlan> {
    const existing = await this.prisma.userSubscription.findUnique({
      where: { userId },
      include: { plan: true },
    });
    if (existing) return existing;
    return this.startTrial(userId);
  }

  async startTrial(userId: string): Promise<SubWithPlan> {
    const trial = await this.prisma.plan.findUniqueOrThrow({ where: { code: 'TRIAL' } });
    return this.prisma.userSubscription.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        planId: trial.id,
        status: SubscriptionStatus.TRIAL,
        expiresAt: new Date(Date.now() + trial.trialDays * 24 * 3600 * 1000),
      },
      include: { plan: true },
    });
  }

  private features(plan: { features: Prisma.JsonValue }): Record<string, boolean> {
    return (plan.features ?? {}) as Record<string, boolean>;
  }

  async summary(userId: string): Promise<SubscriptionSummary> {
    const [sub, companiesOwned] = await Promise.all([
      this.getOrCreateSubscription(userId),
      this.prisma.companyUser.count({ where: { userId, role: 'OWNER' } }),
    ]);
    const status = this.effectiveStatus(sub);
    const daysLeft =
      sub.expiresAt === null
        ? null
        : Math.max(0, Math.ceil((sub.expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000)));
    return {
      planCode: sub.plan.code,
      planName: sub.plan.name,
      status,
      expiresAt: sub.expiresAt,
      daysLeft,
      maxCompanies: sub.plan.maxCompanies,
      companiesOwned,
      maxBranches: sub.plan.maxBranches,
      maxMembers: sub.plan.maxMembers,
      features: this.features(sub.plan),
    };
  }

  private async isSuperAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isSuperAdmin: true },
    });
    return user?.isSuperAdmin ?? false;
  }

  /** The user whose plan licenses a company: its (oldest) OWNER. */
  private async ownerOf(companyId: string): Promise<string | null> {
    const owner = await this.prisma.companyUser.findFirst({
      where: { companyId, role: 'OWNER' },
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    });
    return owner?.userId ?? null;
  }

  // -------------------------------------------------------------
  // Enforcement
  // -------------------------------------------------------------

  private assertValid(sub: SubWithPlan): void {
    const status = this.effectiveStatus(sub);
    if (status === SubscriptionStatus.EXPIRED) {
      throw new ForbiddenException(
        sub.status === SubscriptionStatus.TRIAL
          ? 'Your free trial has ended — choose a plan to continue'
          : `Your ${sub.plan.name} plan has expired — renew to continue`,
      );
    }
    if (status === SubscriptionStatus.CANCELLED) {
      throw new ForbiddenException('Your subscription is cancelled — contact support');
    }
  }

  async assertCanCreateCompany(userId: string): Promise<void> {
    if (await this.isSuperAdmin(userId)) return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { accountType: true },
    });
    if (user?.accountType === 'AUDITOR') {
      throw new ForbiddenException('Auditor accounts cannot create companies');
    }
    const sub = await this.getOrCreateSubscription(userId);
    this.assertValid(sub);
    if (sub.plan.maxCompanies === -1) return;
    const owned = await this.prisma.companyUser.count({
      where: { userId, role: 'OWNER' },
    });
    if (owned >= sub.plan.maxCompanies) {
      throw new ForbiddenException(
        `The ${sub.plan.name} plan allows ${sub.plan.maxCompanies} ${
          sub.plan.maxCompanies === 1 ? 'company' : 'companies'
        } — upgrade to add more`,
      );
    }
  }

  async assertCanAddBranch(companyId: string): Promise<void> {
    const ownerId = await this.ownerOf(companyId);
    if (!ownerId || (await this.isSuperAdmin(ownerId))) return;
    const sub = await this.getOrCreateSubscription(ownerId);
    this.assertValid(sub);
    if (sub.plan.maxBranches === -1) return;
    const branches = await this.prisma.branch.count({ where: { companyId } });
    if (branches >= sub.plan.maxBranches) {
      throw new ForbiddenException(
        `The ${sub.plan.name} plan allows ${sub.plan.maxBranches} ${
          sub.plan.maxBranches === 1 ? 'branch' : 'branches'
        } per company — upgrade to add more`,
      );
    }
  }

  async assertCanInvite(companyId: string): Promise<void> {
    const ownerId = await this.ownerOf(companyId);
    if (!ownerId || (await this.isSuperAdmin(ownerId))) return;
    const sub = await this.getOrCreateSubscription(ownerId);
    this.assertValid(sub);
    if (sub.plan.maxMembers === -1) return;
    const members = await this.prisma.companyUser.count({ where: { companyId } });
    if (members >= sub.plan.maxMembers) {
      throw new ForbiddenException(
        `The ${sub.plan.name} plan allows ${sub.plan.maxMembers} team members per company — upgrade to add more`,
      );
    }
  }

  /**
   * Global write gate: a company whose owner's trial/plan has lapsed becomes
   * read-only until they renew. Reads stay open (the owner can still log in and
   * look around); every create/update/delete is blocked with a "renew" message.
   */
  async assertCompanyActive(companyId: string): Promise<void> {
    const ownerId = await this.ownerOf(companyId);
    if (!ownerId || (await this.isSuperAdmin(ownerId))) return;
    const sub = await this.getOrCreateSubscription(ownerId);
    this.assertValid(sub);
  }

  /**
   * Feature gate — fail-closed: a feature is allowed only when the plan sets it
   * explicitly to `true`. A flag that is `false`, missing, or malformed denies
   * access, so a newly-added capability is locked until a plan opts in.
   */
  async assertCompanyFeature(companyId: string, feature: string): Promise<void> {
    const ownerId = await this.ownerOf(companyId);
    if (!ownerId || (await this.isSuperAdmin(ownerId))) return;
    const sub = await this.getOrCreateSubscription(ownerId);
    this.assertValid(sub);
    if (this.features(sub.plan)[feature] !== true) {
      throw new ForbiddenException(
        `The ${sub.plan.name} plan does not include ${feature} — upgrade to use it`,
      );
    }
  }
}
