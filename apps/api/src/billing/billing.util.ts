import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Pure helpers for the Razorpay integration — signature checks and expiry
 * arithmetic. Unit tested in billing.util.spec.ts.
 */

function safeEqualHex(expected: string, received: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Checkout handler signature: HMAC-SHA256(orderId|paymentId, key secret). */
export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string,
): boolean {
  const expected = createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return safeEqualHex(expected, signature);
}

/** Webhook signature: HMAC-SHA256 of the raw request body. */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signature: string,
  webhookSecret: string,
): boolean {
  const expected = createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');
  return safeEqualHex(expected, signature);
}

/**
 * Renewals extend, upgrades restart: paying while an ACTIVE subscription to
 * the SAME plan still has time left adds months to the current expiry;
 * anything else (expired, trial, different plan) starts from now.
 */
export function nextExpiry(
  currentExpiresAt: Date | null,
  samePlanStillActive: boolean,
  months: number,
  now: Date,
): Date {
  const base =
    samePlanStillActive && currentExpiresAt && currentExpiresAt > now
      ? currentExpiresAt
      : now;
  const next = new Date(base);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}
