import { createHash } from 'crypto';
import type { EInvoicePayload } from './einvoice-payload';

export interface EInvoiceResult {
  irn: string;
  ackNo: string;
  ackDate: Date;
  signedQrCode: string;
  signedInvoice: string;
  provider: string;
}

/**
 * Per-company NIC e-invoice (IRP) API credentials. Created by the taxpayer on
 * einvoice1.gst.gov.in (API Registration → mapped to the GSP) and stored on the
 * Company. The live provider authenticates ("logs in") with these per GSTIN to
 * obtain an IRP session token before generating / cancelling — exactly like the
 * e-way bill credentials.
 */
export interface EInvoiceCredentials {
  gstin: string;
  username: string;
  password: string;
}

/**
 * A pluggable IRP client. The simulator below is the default so the whole
 * e-invoice flow works without credentials; a real NIC-sandbox / GSP client
 * implements this same interface and is swapped in once keys are configured.
 * The live provider needs the taxpayer's credentials; the simulator ignores them.
 */
export interface EInvoiceProvider {
  readonly name: string;
  generate(
    payload: EInvoicePayload,
    now: Date,
    creds?: EInvoiceCredentials,
  ): Promise<EInvoiceResult>;
  cancel(
    irn: string,
    reason: string,
    now: Date,
    creds?: EInvoiceCredentials,
  ): Promise<void>;
}

const b64url = (s: string) =>
  Buffer.from(s, 'utf8').toString('base64url');

/**
 * Sandbox simulator — mirrors the real IRP contract:
 *  - IRN is the SHA-256 of (SupplierGSTIN + DocType + DocNo + FY), exactly how
 *    the NIC portal derives it, so a single invoice can never register twice.
 *  - The signed QR carries the same fields the government QR does, encoded as a
 *    JWT-shaped string (header.payload.signature). The signature segment is a
 *    sandbox marker, not a real NIC signature.
 */
export class SimulatorEInvoiceProvider implements EInvoiceProvider {
  readonly name = 'SIMULATOR';

  async generate(payload: EInvoicePayload, now: Date): Promise<EInvoiceResult> {
    const gstin = String(payload.SellerDtls.Gstin);
    // FY in YYYY-YY from the document date (DD/MM/YYYY).
    const [, , yyyy] = payload.DocDtls.Dt.split('/');
    const month = Number(payload.DocDtls.Dt.split('/')[1]);
    const startYear = month >= 4 ? Number(yyyy) : Number(yyyy) - 1;
    const fy = `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;

    const irn = createHash('sha256')
      .update(`${gstin}${payload.DocDtls.Typ}${payload.DocDtls.No}${fy}`)
      .digest('hex'); // 64 chars

    const ackNo = (
      BigInt('0x' + irn.slice(0, 12)) % 1000000000000n
    )
      .toString()
      .padStart(12, '0');

    const qrObj = {
      SellerGstin: gstin,
      BuyerGstin: String(payload.BuyerDtls.Gstin),
      DocNo: payload.DocDtls.No,
      DocTyp: payload.DocDtls.Typ,
      DocDt: payload.DocDtls.Dt,
      TotInvVal: payload.ValDtls.TotInvVal,
      ItemCnt: payload.ItemList.length,
      MainHsnCode: String(payload.ItemList[0]?.HsnCd ?? ''),
      Irn: irn,
      IrnDt: now.toISOString().slice(0, 19).replace('T', ' '),
    };
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const body = b64url(JSON.stringify({ data: JSON.stringify(qrObj) }));
    const signedQrCode = `${header}.${body}.SANDBOX-SIMULATED-SIGNATURE`;

    return {
      irn,
      ackNo,
      ackDate: now,
      signedQrCode,
      signedInvoice: b64url(JSON.stringify(payload)),
      provider: this.name,
    };
  }

  async cancel(): Promise<void> {
    // Nothing to call — the service flips status + records the reason.
  }
}
