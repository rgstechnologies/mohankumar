import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';

const TOKEN_KEY = 'sandbox:access_token';
const TOKEN_TTL = 23 * 3600; // Sandbox tokens last 24h; refresh 1h early.

/**
 * Central HTTP client for the Sandbox.co.in platform.
 *
 * Handles:
 *  - API-key / secret authentication (POST /authenticate)
 *  - Redis-cached access token with automatic refresh
 *  - Convenience get() / post() wrappers that attach the Bearer header
 *
 * When SANDBOX_API_KEY is empty the service stays inert — every method
 * returns null / throws a clear "not configured" error so callers can
 * fall back to local simulators.
 */
@Injectable()
export class SandboxService implements OnModuleInit {
  private readonly logger = new Logger(SandboxService.name);

  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;

  /** true when all three env vars are set. */
  readonly enabled: boolean;

  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    this.apiKey = this.config.get<string>('SANDBOX_API_KEY', '');
    this.apiSecret = this.config.get<string>('SANDBOX_API_SECRET', '');
    this.baseUrl = this.config.get<string>(
      'SANDBOX_API_URL',
      'https://api.sandbox.co.in',
    );
    this.enabled = !!(this.apiKey && this.apiSecret);
  }

  async onModuleInit() {
    if (this.enabled) {
      this.logger.log('Sandbox.co.in integration enabled — warming token …');
      await this.getToken().catch((err) =>
        this.logger.warn(`Sandbox warm-up failed: ${err.message}`),
      );
    } else {
      this.logger.log(
        'Sandbox.co.in integration disabled (SANDBOX_API_KEY not set)',
      );
    }
  }

  // ------------------------------------------------------------------ auth

  /** Returns a valid access token, fetching / refreshing as needed. */
  async getToken(): Promise<string> {
    this.assertEnabled();

    const cached = await this.redis.get(TOKEN_KEY);
    if (cached) return cached;

    const url = `${this.baseUrl}/authenticate`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'x-api-secret': this.apiSecret,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Sandbox auth failed (${res.status}): ${body}`);
    }

    const json = (await res.json()) as {
      data: { access_token: string };
    };
    const token = json.data.access_token;

    await this.redis.set(TOKEN_KEY, token, 'EX', TOKEN_TTL);
    this.logger.log('Sandbox access token refreshed');
    return token;
  }

  // ----------------------------------------------------------------- HTTP

  /** Generic GET against a Sandbox API path (e.g. "/gsp/…"). */
  async get<T = unknown>(
    path: string,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    return this.request<T>('GET', path, undefined, extraHeaders);
  }

  /**
   * Generic POST against a Sandbox API path. `extraHeaders` lets a caller add
   * request-specific headers (e.g. `x-source` to pick the NIC portal instance);
   * they are preserved across the transparent 401 token refresh below.
   */
  async post<T = unknown>(
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    return this.request<T>('POST', path, body, extraHeaders);
  }

  // ----------------------------------------------------------------- internal

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const token = await this.getToken();
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: token,
      'x-api-key': this.apiKey,
      'x-api-version': '1.0',
      ...extraHeaders,
    };
    if (body) headers['Content-Type'] = 'application/json';

    const res = await fetch(url, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    // Attempt one transparent token refresh on 401.
    if (res.status === 401) {
      await this.redis.del(TOKEN_KEY);
      const freshToken = await this.getToken();
      headers.Authorization = freshToken;

      const retry = await fetch(url, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!retry.ok) {
        const text = await retry.text();
        throw new Error(`Sandbox ${method} ${path} failed (${retry.status}): ${text}`);
      }
      return (await retry.json()) as T;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Sandbox ${method} ${path} failed (${res.status}): ${text}`);
    }

    return (await res.json()) as T;
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new Error(
        'Sandbox.co.in is not configured — set SANDBOX_API_KEY and SANDBOX_API_SECRET in .env',
      );
    }
  }
}
