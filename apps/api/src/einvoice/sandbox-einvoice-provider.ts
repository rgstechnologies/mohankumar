import type { EInvoicePayload } from './einvoice-payload';
import type {
  EInvoiceCredentials,
  EInvoiceProvider,
  EInvoiceResult,
} from './einvoice-provider';
import type { SandboxService } from '../sandbox/sandbox.service';

/**
 * Real Sandbox.co.in E-Invoice provider. Implements the same interface as the
 * built-in simulator so the service layer doesn't care which one is active.
 *
 * Like the NIC e-way bill system, e-invoicing authenticates **per taxpayer**:
 * each business registers for API access on einvoice1.gst.gov.in and maps the
 * GSP, then we exchange that GSTIN's username/password for a short-lived IRP
 * session token (the "login") before generating. NIC IRP tokens last ~6 hours,
 * so we cache them in-memory per GSTIN and re-authenticate on expiry — every
 * customer files under their OWN taxpayer login, never a shared identity.
 *
 * Endpoints used (all under the same /tax-payer/... path, reusing one session):
 *  - POST /gst/compliance/e-invoice/tax-payer/authenticate → per-GSTIN IRP login
 *  - POST /gst/compliance/e-invoice/tax-payer/invoice       → generate IRN
 *  - POST /gst/compliance/e-invoice/tax-payer/cancel        → cancel IRN
 *
 * The `x-source` header selects the NIC portal instance (primary = NIC 1,
 * secondary = NIC 2); we try the primary first and fall back to the secondary
 * when it's unavailable, mirroring the e-way bill flow.
 */
const AUTH_PATH = '/gst/compliance/e-invoice/tax-payer/authenticate';
const GENERATE_PATH = '/gst/compliance/e-invoice/tax-payer/invoice';
const CANCEL_PATH = '/gst/compliance/e-invoice/tax-payer/cancel';
const TOKEN_TTL_MS = 5.5 * 60 * 60 * 1000; // refresh ~30 min before NIC's 6h expiry

/** NIC portal instances, tried in order: '1' = primary (NIC 1), '2' = secondary (NIC 2). */
const SOURCES = ['1', '2'] as const;

export class SandboxEInvoiceProvider implements EInvoiceProvider {
  readonly name = 'SANDBOX';

  /**
   * Per-GSTIN IRP session-token cache. Keyed by the taxpayer's GSTIN so each
   * customer reuses their OWN session across calls. In-memory is fine for a
   * single-instance deployment; for multi-instance move this to Redis keyed
   * `sandbox:einvoice:token:<gstin>` so the token is shared across processes.
   */
  private readonly tokens = new Map<string, { token: string; expiresAt: number }>();

  constructor(private readonly sandbox: SandboxService) {}

  // ----------------------------------------------------------------- helpers

  /**
   * Runs a call against the primary NIC portal (x-source 1), retrying once on
   * the secondary (x-source 2) if the primary is unavailable.
   */
  private async withSource<T>(call: (source: string) => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (const source of SOURCES) {
      try {
        return await call(source);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  // ----------------------------------------------------------------- auth

  private async authToken(creds: EInvoiceCredentials): Promise<string> {
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

    const res = await this.withSource<AuthResponse>((source) =>
      this.sandbox.post<AuthResponse>(
        AUTH_PATH,
        {
          gstin: creds.gstin,
          username: creds.username,
          password: creds.password,
        },
        { 'x-source': source },
      ),
    );

    if (res.code !== 200 || res.data.status_cd !== '1') {
      throw new Error(
        res.data.message ??
          'e-Invoice portal login failed — check the API username/password',
      );
    }

    const token = res.data.data.authToken ?? res.data.data.AuthToken;
    if (!token) throw new Error('e-Invoice portal returned no session token');

    this.tokens.set(creds.gstin, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
    return token;
  }

  // ------------------------------------------------------------- generate

  async generate(
    payload: EInvoicePayload,
    now: Date,
    creds?: EInvoiceCredentials,
  ): Promise<EInvoiceResult> {
    if (!creds) throw new Error('e-Invoice credentials are required');
    const authToken = await this.authToken(creds);

    type SandboxIrnResponse = {
      code: number;
      data: {
        data: {
          Irn: string;
          AckNo: string;
          AckDt: string;
          SignedQRCode: string;
          SignedInvoice: string;
        };
        status_cd: string;
        message?: string;
      };
    };

    const res = await this.withSource<SandboxIrnResponse>((source) =>
      this.sandbox.post<SandboxIrnResponse>(
        GENERATE_PATH,
        { gstin: creds.gstin, auth_token: authToken, data: payload },
        { 'x-source': source },
      ),
    );

    if (res.code !== 200 || res.data.status_cd !== '1') {
      const msg =
        res.data.message ??
        `Sandbox e-invoice generation failed (status ${res.data.status_cd ?? res.code})`;
      throw new Error(msg);
    }

    const d = res.data.data;

    return {
      irn: d.Irn,
      ackNo: d.AckNo,
      ackDate: d.AckDt ? new Date(d.AckDt) : now,
      signedQrCode: d.SignedQRCode ?? '',
      signedInvoice: d.SignedInvoice ?? '',
      provider: this.name,
    };
  }

  // --------------------------------------------------------------- cancel

  async cancel(
    irn: string,
    reason: string,
    _now: Date,
    creds?: EInvoiceCredentials,
  ): Promise<void> {
    if (!creds) throw new Error('e-Invoice credentials are required');
    const authToken = await this.authToken(creds);

    type SandboxCancelResponse = {
      code: number;
      data: { status_cd: string; message?: string };
    };

    const res = await this.withSource<SandboxCancelResponse>((source) =>
      this.sandbox.post<SandboxCancelResponse>(
        CANCEL_PATH,
        {
          gstin: creds.gstin,
          auth_token: authToken,
          data: {
            Irn: irn,
            CnlRsn: '1', // 1 = Duplicate, 2 = Data entry mistake, etc.
            CnlRem: reason.slice(0, 100),
          },
        },
        { 'x-source': source },
      ),
    );

    if (res.code !== 200 || res.data.status_cd !== '1') {
      const msg =
        res.data.message ??
        `Sandbox e-invoice cancellation failed (status ${res.data.status_cd ?? res.code})`;
      throw new Error(msg);
    }
  }
}
