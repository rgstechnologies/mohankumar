import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentOrderStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  nextExpiry,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from './billing.util';
import { RAZORPAY_CLIENT, type RazorpayClient } from './razorpay.client';

const ALLOWED_MONTHS = [1, 3, 6, 12];

@Injectable()
export class BillingService {
  private readonly logger = new Logger('Billing');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(RAZORPAY_CLIENT) private readonly razorpay: RazorpayClient,
  ) {}

  /** Plans a user can buy: active, priced, not the trial. */
  async purchasablePlans() {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true, code: { not: 'TRIAL' }, priceMonthly: { gt: 0 } },
      orderBy: { sortOrder: 'asc' },
    });
    return plans.map((p) => ({
      code: p.code,
      name: p.name,
      priceMonthly: Number(p.priceMonthly),
      maxCompanies: p.maxCompanies,
      maxBranches: p.maxBranches,
      maxMembers: p.maxMembers,
      features: (p.features ?? {}) as Record<string, boolean>,
    }));
  }

  async createOrder(
    userId: string,
    planCode: string,
    months: number,
    referralCode?: string,
  ) {
    if (!ALLOWED_MONTHS.includes(months)) {
      throw new BadRequestException(
        `months must be one of ${ALLOWED_MONTHS.join(', ')}`,
      );
    }
    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan || !plan.isActive || Number(plan.priceMonthly) <= 0) {
      throw new BadRequestException('That plan cannot be purchased online');
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, name: true },
    });

    // Price is decided HERE, from the plan — never trusted from the client.
    const grossPaise = Math.round(Number(plan.priceMonthly) * 100) * months;
    // A referral code knocks off a validated discount; rejected codes throw.
    const referral = referralCode
      ? await this.resolveReferral(referralCode, grossPaise)
      : null;
    const discountPaise = referral?.discountPaise ?? 0;
    const amountPaise = Math.max(100, grossPaise - discountPaise); // ≥ ₹1 to charge

    const order = await this.prisma.paymentOrder.create({
      data: {
        userId,
        planId: plan.id,
        months,
        amountPaise,
        referralCodeId: referral?.id ?? null,
        discountPaise,
        razorpayOrderId: `pending-${crypto.randomUUID()}`,
      },
    });
    const rzpOrder = await this.razorpay.createOrder(amountPaise, order.id, {
      planCode: plan.code,
      months: String(months),
      userId,
    });
    await this.prisma.paymentOrder.update({
      where: { id: order.id },
      data: { razorpayOrderId: rzpOrder.id },
    });

    return {
      orderId: rzpOrder.id,
      amountPaise,
      grossPaise,
      discountPaise,
      currency: 'INR',
      keyId: this.razorpay.keyId,
      planCode: plan.code,
      planName: plan.name,
      months,
      prefill: { email: user.email, name: user.name },
    };
  }

  /**
   * Validate a referral code against a plan/term and return the discount — used
   * by the checkout UI to preview the price before paying. Throws if invalid.
   */
  async previewReferral(code: string, planCode: string, months: number) {
    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan || Number(plan.priceMonthly) <= 0) {
      throw new BadRequestException('Unknown plan');
    }
    const m = ALLOWED_MONTHS.includes(months) ? months : 1;
    const grossPaise = Math.round(Number(plan.priceMonthly) * 100) * m;
    const referral = await this.resolveReferral(code, grossPaise);
    return {
      code: code.trim().toUpperCase(),
      grossPaise,
      discountPaise: referral.discountPaise,
      amountPaise: Math.max(100, grossPaise - referral.discountPaise),
    };
  }

  /** Looks up + validates a referral code and computes its discount in paise. */
  private async resolveReferral(
    code: string,
    grossPaise: number,
  ): Promise<{ id: string; discountPaise: number }> {
    const ref = await this.prisma.referralCode.findUnique({
      where: { code: code.trim().toUpperCase() },
    });
    if (!ref || !ref.isActive) {
      throw new BadRequestException('Invalid referral code');
    }
    if (ref.expiresAt && ref.expiresAt < new Date()) {
      throw new BadRequestException('This referral code has expired');
    }
    if (ref.maxUses != null && ref.usesCount >= ref.maxUses) {
      throw new BadRequestException('This referral code has reached its limit');
    }
    const discountPaise =
      ref.discountType === 'PERCENT'
        ? Math.round((grossPaise * Number(ref.discountValue)) / 100)
        : Math.round(Number(ref.discountValue) * 100);
    return { id: ref.id, discountPaise: Math.min(discountPaise, grossPaise) };
  }

  /** Browser checkout handler path — signed with the key secret. */
  async verifyAndActivate(
    userId: string,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    signature: string,
  ) {
    const secret = this.config.get<string>('RAZORPAY_KEY_SECRET') ?? '';
    if (
      !secret ||
      !verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, signature, secret)
    ) {
      throw new BadRequestException('Payment signature verification failed');
    }
    const order = await this.prisma.paymentOrder.findUnique({
      where: { razorpayOrderId },
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }
    return this.activate(order.id, razorpayPaymentId);
  }

  /** Razorpay webhook path — signed with the webhook secret over raw bytes. */
  async handleWebhook(rawBody: Buffer, signature: string) {
    const secret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET') ?? '';
    if (!secret || !signature || !verifyWebhookSignature(rawBody, signature, secret)) {
      throw new BadRequestException('Webhook signature verification failed');
    }
    const event = JSON.parse(rawBody.toString('utf8')) as {
      event?: string;
      payload?: {
        payment?: { entity?: { id?: string; order_id?: string } };
      };
    };
    if (event.event !== 'payment.captured') return { handled: false };

    const payment = event.payload?.payment?.entity;
    if (!payment?.order_id || !payment.id) return { handled: false };
    const order = await this.prisma.paymentOrder.findUnique({
      where: { razorpayOrderId: payment.order_id },
    });
    if (!order) {
      this.logger.warn(`Webhook for unknown order ${payment.order_id}`);
      return { handled: false };
    }
    await this.activate(order.id, payment.id);
    return { handled: true };
  }

  /** Idempotent: a paid order activates exactly once. */
  private async activate(orderId: string, razorpayPaymentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.paymentOrder.findUniqueOrThrow({
        where: { id: orderId },
        include: { plan: true },
      });
      if (order.status === PaymentOrderStatus.PAID) {
        const sub = await tx.userSubscription.findUnique({
          where: { userId: order.userId },
          include: { plan: true },
        });
        return this.summary(order, sub?.expiresAt ?? null);
      }

      const now = new Date();
      const existing = await tx.userSubscription.findUnique({
        where: { userId: order.userId },
      });
      const samePlanStillActive =
        !!existing &&
        existing.planId === order.planId &&
        existing.status === SubscriptionStatus.ACTIVE;
      const expiresAt = nextExpiry(
        existing?.expiresAt ?? null,
        samePlanStillActive,
        order.months,
        now,
      );

      await tx.paymentOrder.update({
        where: { id: order.id },
        data: { status: PaymentOrderStatus.PAID, razorpayPaymentId },
      });
      // Count the referral redemption once, on the first activation.
      if (order.referralCodeId) {
        await tx.referralCode.update({
          where: { id: order.referralCodeId },
          data: { usesCount: { increment: 1 } },
        });
      }
      await tx.userSubscription.upsert({
        where: { userId: order.userId },
        update: {
          planId: order.planId,
          status: SubscriptionStatus.ACTIVE,
          expiresAt,
          notes: `Razorpay ${razorpayPaymentId} · ${order.months} month(s)`,
        },
        create: {
          userId: order.userId,
          planId: order.planId,
          status: SubscriptionStatus.ACTIVE,
          expiresAt,
          notes: `Razorpay ${razorpayPaymentId} · ${order.months} month(s)`,
        },
      });
      this.logger.log(
        `Activated ${order.plan.code} ×${order.months}m for user ${order.userId} (${razorpayPaymentId})`,
      );
      return this.summary(order, expiresAt);
    });
  }

  private summary(
    order: { plan: { code: string; name: string }; months: number },
    expiresAt: Date | null,
  ) {
    return {
      planCode: order.plan.code,
      planName: order.plan.name,
      months: order.months,
      status: SubscriptionStatus.ACTIVE,
      expiresAt,
    };
  }
}
