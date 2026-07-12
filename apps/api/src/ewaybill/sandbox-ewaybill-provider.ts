import type { EWayBillPayload } from './ewaybill-payload';
import type {
  EWayBillCredentials,
  EWayBillProvider,
  EWayBillResult,
} from './ewaybill-provider';
import type { SandboxService } from '../sandbox/sandbox.service';

/**
 * Real Sandbox.co.in e-way bill provider. Implements the same interface as the
 * built-in simulator so the service layer doesn't care which one is active.
 *
 * Unlike e-invoicing, the NIC e-way bill system authenticates **per taxpayer**:
 * the business creates an API username/password on ewaybillgst.gov.in (after
 * registering the GSP) and we exchange those for a short-lived session token —
 * the "login" — before generating. NIC tokens last ~6 hours, so we cache them
 * in-memory per GSTIN and re-authenticate on expiry.
 *
 * Endpoints follow Sandbox's e-way bill (GSP) API. Field/path names are kept in
 * named constants so they're easy to confirm against the account's API version
 * the first time live credentials are wired up.
 */
const AUTH_PATH = '/gst/compliance/e-way-bill/tax-payer/authenticate';
const GENERATE_PATH = '/gst/compliance/e-way-bill/tax-payer/generate';
const CANCEL_PATH = '/gst/compliance/e-way-bill/tax-payer/cancel';
const TOKEN_TTL_MS = 5.5 * 60 * 60 * 1000; // refresh ~30 min before NIC's 6h expiry
const DAY_MS = 24 * 60 * 60 * 1000;

export class SandboxEWayBillProvider implements EWayBillProvider {
  readonly name = 'SANDBOX';

  /** Per-GSTIN NIC session token cache. */
  private readonly tokens = new Map<string, { token: string; expiresAt: number }>();

  constructor(private readonly sandbox: SandboxService) {}

  // ----------------------------------------------------------------- auth

  private async authToken(creds: EWayBillCredentials): Promise<string> {
    const cached = this.tokens.get(creds.gstin);
    if (cached && cached.expiresAt > Date.now()) return cached.token;

    type AuthResponse = {
      code: number;
      data: {
        data: { authToken?: string; AuthToken?: string };
        status_cd: string;
        message?: string;
      };
    };

    const res = await this.sandbox.post<AuthResponse>(AUTH_PATH, {
      gstin: creds.gstin,
      username: creds.username,
      password: creds.password,
    });

    if (res.code !== 200 || res.data.status_cd !== '1') {
      throw new Error(
        res.data.message ??
          'e-Way bill portal login failed — check the API username/password',
      );
    }

    const token = res.data.data.authToken ?? res.data.data.AuthToken;
    if (!token) throw new Error('e-Way bill portal returned no session token');

    this.tokens.set(creds.gstin, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
    return token;
  }

  // ------------------------------------------------------------- generate

  async generate(
    payload: EWayBillPayload,
    now: Date,
    creds?: EWayBillCredentials,
  ): Promise<EWayBillResult> {
    if (!creds) throw new Error('e-Way bill credentials are required');
    const authToken = await this.authToken(creds);

    type GenResponse = {
      code: number;
      data: {
        data: { ewayBillNo?: number | string; ewayBillDate?: string; validUpto?: string };
        status_cd: string;
        message?: string;
      };
    };

    const res = await this.sandbox.post<GenResponse>(GENERATE_PATH, {
      gstin: creds.gstin,
      auth_token: authToken,
      data: payload,
    });

    if (res.code !== 200 || res.data.status_cd !== '1') {
      throw new Error(
        res.data.message ??
          `e-Way bill generation failed (status ${res.data.status_cd ?? res.code})`,
      );
    }

    const d = res.data.data;
    const ewbNo = String(d.ewayBillNo ?? '');
    if (!ewbNo) throw new Error('e-Way bill portal returned no EWB number');

    return {
      ewbNo,
      ewbDate: d.ewayBillDate ? new Date(d.ewayBillDate) : now,
      validUpto: d.validUpto
        ? new Date(d.validUpto)
        : new Date(now.getTime() + Math.max(1, Math.ceil(payload.transDistance / 200)) * DAY_MS),
      provider: this.name,
    };
  }

  // --------------------------------------------------------------- cancel

  async cancel(
    ewbNo: string,
    reason: string,
    _now: Date,
    creds?: EWayBillCredentials,
  ): Promise<void> {
    if (!creds) throw new Error('e-Way bill credentials are required');
    const authToken = await this.authToken(creds);

    type CancelResponse = {
      code: number;
      data: { status_cd: string; message?: string };
    };

    const res = await this.sandbox.post<CancelResponse>(CANCEL_PATH, {
      gstin: creds.gstin,
      auth_token: authToken,
      data: {
        ewbNo: Number(ewbNo),
        cancelRsnCode: 2, // 2 = Data entry mistake
        cancelRmrk: reason.slice(0, 100),
      },
    });

    if (res.code !== 200 || res.data.status_cd !== '1') {
      throw new Error(
        res.data.message ??
          `e-Way bill cancellation failed (status ${res.data.status_cd ?? res.code})`,
      );
    }
  }
}
