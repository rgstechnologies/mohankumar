import { createHmac } from 'crypto';
import {
  nextExpiry,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from './billing.util';

const SECRET = 'test-secret';

describe('verifyPaymentSignature', () => {
  it('accepts the canonical orderId|paymentId HMAC and rejects others', () => {
    const sig = createHmac('sha256', SECRET)
      .update('order_1|pay_1')
      .digest('hex');
    expect(verifyPaymentSignature('order_1', 'pay_1', sig, SECRET)).toBe(true);
    expect(verifyPaymentSignature('order_1', 'pay_2', sig, SECRET)).toBe(false);
    expect(verifyPaymentSignature('order_1', 'pay_1', sig, 'wrong')).toBe(false);
    expect(verifyPaymentSignature('order_1', 'pay_1', 'short', SECRET)).toBe(false);
  });
});

describe('verifyWebhookSignature', () => {
  it('verifies over the exact raw bytes', () => {
    const body = Buffer.from('{"event":"payment.captured"}');
    const sig = createHmac('sha256', SECRET).update(body).digest('hex');
    expect(verifyWebhookSignature(body, sig, SECRET)).toBe(true);
    expect(
      verifyWebhookSignature(Buffer.from('{"event":"payment.captured" }'), sig, SECRET),
    ).toBe(false);
  });
});

describe('nextExpiry', () => {
  const now = new Date('2026-06-12T00:00:00Z');

  it('extends a still-active same-plan subscription', () => {
    const current = new Date('2026-08-01T00:00:00Z');
    expect(nextExpiry(current, true, 3, now).toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
  });

  it('restarts from now for expired, trial or different-plan cases', () => {
    const past = new Date('2026-05-01T00:00:00Z');
    expect(nextExpiry(past, true, 1, now).toISOString()).toBe(
      '2026-07-12T00:00:00.000Z',
    );
    const future = new Date('2026-08-01T00:00:00Z');
    expect(nextExpiry(future, false, 12, now).toISOString()).toBe(
      '2027-06-12T00:00:00.000Z',
    );
    expect(nextExpiry(null, false, 1, now).toISOString()).toBe(
      '2026-07-12T00:00:00.000Z',
    );
  });
});
