import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { LicensingService } from '../licensing/licensing.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePlanDto,
  CreateReferralCodeDto,
  UpdateAdminUserDto,
  UpdatePlanDto,
  UpdateReferralCodeDto,
  UpdateSubscriptionDto,
} from './dto/admin.dto';
import { SuperAdminGuard } from './super-admin.guard';

const DAY = 24 * 3600 * 1000;

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(SuperAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly licensing: LicensingService,
  ) {}

  private serializePlan(plan: {
    [key: string]: unknown;
    priceMonthly: Prisma.Decimal;
  }) {
    return { ...plan, priceMonthly: Number(plan.priceMonthly) };
  }

  // -------------------------------------------------------------
  // Overview
  // -------------------------------------------------------------

  @Get('overview')
  @ApiOperation({ summary: 'Platform metrics: users, trials, paid, plans' })
  async overview() {
    const since30d = new Date(Date.now() - 30 * DAY);
    const [totalUsers, newUsers30d, blockedUsers, totalCompanies, subs, plans, recent] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { createdAt: { gte: since30d } } }),
        this.prisma.user.count({ where: { isBlocked: true } }),
        this.prisma.company.count(),
        this.prisma.userSubscription.findMany({ include: { plan: true } }),
        this.prisma.plan.findMany({ orderBy: { sortOrder: 'asc' } }),
        this.prisma.user.findMany({
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
            lastLoginAt: true,
            subscription: { include: { plan: { select: { code: true, name: true } } } },
          },
        }),
      ]);

    let trialUsers = 0;
    let paidUsers = 0;
    let expiredUsers = 0;
    const byPlan = new Map<string, number>();
    for (const sub of subs) {
      const status = this.licensing.effectiveStatus(sub);
      if (status === SubscriptionStatus.TRIAL) trialUsers += 1;
      else if (status === SubscriptionStatus.ACTIVE) paidUsers += 1;
      else expiredUsers += 1;
      byPlan.set(sub.plan.code, (byPlan.get(sub.plan.code) ?? 0) + 1);
    }

    return {
      totalUsers,
      newUsers30d,
      trialUsers,
      paidUsers,
      expiredUsers,
      blockedUsers,
      noPlanUsers: totalUsers - subs.length,
      totalCompanies,
      planDistribution: plans.map((p) => ({
        code: p.code,
        name: p.name,
        users: byPlan.get(p.code) ?? 0,
      })),
      recentUsers: recent.map((u) => ({
        ...u,
        subscription: u.subscription && {
          planCode: u.subscription.plan.code,
          planName: u.subscription.plan.name,
          status: this.licensing.effectiveStatus(u.subscription),
          expiresAt: u.subscription.expiresAt,
        },
      })),
    };
  }

  // -------------------------------------------------------------
  // Users
  // -------------------------------------------------------------

  @Get('users')
  @ApiOperation({ summary: 'Search users with subscription + usage' })
  async listUsers(@Query('q') q?: string, @Query('status') status?: string) {
    const users = await this.prisma.user.findMany({
      where: q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        name: true,
        email: true,
        isSuperAdmin: true,
        isBlocked: true,
        lastLoginAt: true,
        createdAt: true,
        subscription: { include: { plan: true } },
        _count: { select: { memberships: true } },
        memberships: {
          where: { role: 'OWNER' },
          select: { company: { select: { id: true, name: true } } },
        },
      },
    });

    const rows = users.map((u) => {
      const effective = u.subscription
        ? this.licensing.effectiveStatus(u.subscription)
        : null;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        isSuperAdmin: u.isSuperAdmin,
        isBlocked: u.isBlocked,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
        membershipCount: u._count.memberships,
        ownedCompanies: u.memberships.map((m) => m.company),
        subscription: u.subscription && {
          planCode: u.subscription.plan.code,
          planName: u.subscription.plan.name,
          status: effective,
          rawStatus: u.subscription.status,
          startsAt: u.subscription.startsAt,
          expiresAt: u.subscription.expiresAt,
          notes: u.subscription.notes,
        },
      };
    });

    if (!status) return rows;
    const wanted = status.toUpperCase();
    return rows.filter((row) => {
      if (wanted === 'BLOCKED') return row.isBlocked;
      if (wanted === 'NONE') return row.subscription === null;
      return row.subscription?.status === wanted;
    });
  }

  @Patch('users/:userId')
  @ApiOperation({ summary: 'Block/unblock or grant/revoke super admin' })
  async updateUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() admin: AuthUser,
    @Body() dto: UpdateAdminUserDto,
  ) {
    if (userId === admin.id && (dto.isBlocked === true || dto.isSuperAdmin === false)) {
      throw new BadRequestException('You cannot block or demote yourself');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isBlocked: dto.isBlocked, isSuperAdmin: dto.isSuperAdmin },
      select: { id: true, email: true, isBlocked: true, isSuperAdmin: true },
    });
    // Blocking ends every active session immediately.
    if (dto.isBlocked === true) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return updated;
  }

  @Patch('users/:userId/subscription')
  @ApiOperation({ summary: 'Assign a plan / extend / activate / cancel' })
  async updateSubscription(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    const [user, plan] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.plan.findUnique({ where: { code: dto.planCode } }),
    ]);
    if (!user) throw new NotFoundException('User not found');
    if (!plan) throw new BadRequestException(`Unknown plan "${dto.planCode}"`);

    const status =
      dto.status ?? (plan.code === 'TRIAL' ? SubscriptionStatus.TRIAL : SubscriptionStatus.ACTIVE);
    const expiresAt =
      dto.expiresAt !== undefined
        ? dto.expiresAt === null
          ? null
          : new Date(dto.expiresAt)
        : plan.trialDays > 0
          ? new Date(Date.now() + plan.trialDays * DAY)
          : null;

    const sub = await this.prisma.userSubscription.upsert({
      where: { userId },
      update: { planId: plan.id, status, expiresAt, notes: dto.notes },
      create: { userId, planId: plan.id, status, expiresAt, notes: dto.notes },
      include: { plan: true },
    });
    return {
      userId,
      planCode: sub.plan.code,
      planName: sub.plan.name,
      status: this.licensing.effectiveStatus(sub),
      expiresAt: sub.expiresAt,
      notes: sub.notes,
    };
  }

  // -------------------------------------------------------------
  // Plans
  // -------------------------------------------------------------

  @Get('plans')
  @ApiOperation({ summary: 'All plans with subscriber counts' })
  async listPlans() {
    const plans = await this.prisma.plan.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { subscriptions: true } } },
    });
    return plans.map(({ _count, ...plan }) => ({
      ...this.serializePlan(plan),
      subscribers: _count.subscriptions,
    }));
  }

  @Post('plans')
  @ApiOperation({ summary: 'Create a plan' })
  async createPlan(@Body() dto: CreatePlanDto) {
    const existing = await this.prisma.plan.findUnique({ where: { code: dto.code } });
    if (existing) throw new BadRequestException('A plan with this code already exists');
    const plan = await this.prisma.plan.create({
      data: {
        code: dto.code,
        name: dto.name,
        priceMonthly: dto.priceMonthly ?? 0,
        maxCompanies: dto.maxCompanies ?? 1,
        maxBranches: dto.maxBranches ?? -1,
        maxMembers: dto.maxMembers ?? -1,
        trialDays: dto.trialDays ?? 0,
        features: (dto.features ?? {}) as Prisma.InputJsonObject,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    return this.serializePlan(plan);
  }

  @Patch('plans/:planId')
  @ApiOperation({ summary: 'Update plan limits / pricing / features' })
  async updatePlan(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: UpdatePlanDto,
  ) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    if (dto.code && dto.code !== plan.code) {
      const taken = await this.prisma.plan.findUnique({ where: { code: dto.code } });
      if (taken) throw new BadRequestException('A plan with this code already exists');
    }
    const updated = await this.prisma.plan.update({
      where: { id: planId },
      data: {
        code: dto.code,
        name: dto.name,
        priceMonthly: dto.priceMonthly,
        maxCompanies: dto.maxCompanies,
        maxBranches: dto.maxBranches,
        maxMembers: dto.maxMembers,
        trialDays: dto.trialDays,
        features: dto.features as Prisma.InputJsonObject | undefined,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
    });
    return this.serializePlan(updated);
  }

  // -------------------------------------------------------------
  // Referral / promo codes
  // -------------------------------------------------------------

  @Get('referral-codes')
  @ApiOperation({ summary: 'List referral codes with redemption counts' })
  async listReferralCodes() {
    const codes = await this.prisma.referralCode.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return codes.map((c) => ({
      id: c.id,
      code: c.code,
      description: c.description,
      discountType: c.discountType,
      discountValue: Number(c.discountValue),
      maxUses: c.maxUses,
      usesCount: c.usesCount,
      expiresAt: c.expiresAt,
      isActive: c.isActive,
    }));
  }

  @Post('referral-codes')
  @ApiOperation({ summary: 'Create a referral code' })
  async createReferralCode(@Body() dto: CreateReferralCodeDto) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.referralCode.findUnique({ where: { code } });
    if (existing) throw new BadRequestException('A code with this name already exists');
    return this.prisma.referralCode.create({
      data: {
        code,
        description: dto.description,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        maxUses: dto.maxUses ?? null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  @Patch('referral-codes/:codeId')
  @ApiOperation({ summary: 'Update a referral code (value/limit/expiry/active)' })
  async updateReferralCode(
    @Param('codeId', ParseUUIDPipe) codeId: string,
    @Body() dto: UpdateReferralCodeDto,
  ) {
    const ref = await this.prisma.referralCode.findUnique({ where: { id: codeId } });
    if (!ref) throw new NotFoundException('Referral code not found');
    return this.prisma.referralCode.update({
      where: { id: codeId },
      data: {
        description: dto.description,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        maxUses: dto.maxUses === undefined ? undefined : (dto.maxUses ?? null),
        expiresAt:
          dto.expiresAt === undefined
            ? undefined
            : dto.expiresAt
              ? new Date(dto.expiresAt)
              : null,
        isActive: dto.isActive,
      },
    });
  }
}
