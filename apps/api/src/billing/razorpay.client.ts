import {
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

/**
 * Thin Razorpay Orders REST client (basic auth, no SDK). Swappable via the
 * RAZORPAY_CLIENT token so tests stub it the way they stub the AI provider.
 */
export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

export interface RazorpayClient {
  readonly keyId: string;
  createOrder(
    amountPaise: number,
    receipt: string,
    notes: Record<string, string>,
  ): Promise<RazorpayOrder>;
}

export const RAZORPAY_CLIENT = 'RAZORPAY_CLIENT_IMPL';

export class RazorpayRestClient implements RazorpayClient {
  private readonly logger = new Logger('Razorpay');

  constructor(
    readonly keyId: string,
    private readonly keySecret: string,
  ) {}

  async createOrder(
    amountPaise: number,
    receipt: string,
    notes: Record<string, string>,
  ): Promise<RazorpayOrder> {
    let response: Response;
    try {
      response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
        },
        body: JSON.stringify({
          amount: amountPaise,
          currency: 'INR',
          receipt,
          notes,
        }),
      });
    } catch (error) {
      this.logger.error(`Razorpay unreachable: ${String(error)}`);
      throw new ServiceUnavailableException(
        'The payment service could not be reached — try again shortly',
      );
    }
    const body = (await response.json().catch(() => ({}))) as RazorpayOrder & {
      error?: { description?: string };
    };
    if (!response.ok) {
      this.logger.error(
        `Razorpay order failed ${response.status}: ${body.error?.description ?? 'unknown'}`,
      );
      throw new ServiceUnavailableException(
        'The payment service returned an error — try again shortly',
      );
    }
    return body;
  }
}

/** Used when keys are not configured — online upgrades cleanly disabled. */
export class UnconfiguredRazorpayClient implements RazorpayClient {
  readonly keyId = '';

  createOrder(): Promise<RazorpayOrder> {
    throw new ServiceUnavailableException(
      'Online payments are not configured — contact support to upgrade',
    );
  }
}
