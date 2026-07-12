import type { EWayBillPayload } from './ewaybill-payload';

export interface EWayBillResult {
  ewbNo: string;
  ewbDate: Date;
  validUpto: Date;
  provider: string;
}

/**
 * Per-company NIC e-way bill API credentials. Created by the taxpayer on
 * ewaybillgst.gov.in (Registration → For GSP) and stored on the Company.
 * The live provider authenticates ("logs in") with these to obtain a session
 * token before generating / cancelling.
 */
export interface EWayBillCredentials {
  gstin: string;
  username: string;
  password: string;
}

/**
 * Pluggable EWB portal client. The simulator is the default so the flow works
 * without credentials; a live NIC/GSP client implements the same interface.
 * The live provider needs the taxpayer's credentials; the simulator ignores them.
 */
export interface EWayBillProvider {
  readonly name: string;
  generate(
    payload: EWayBillPayload,
    now: Date,
    creds?: EWayBillCredentials,
  ): Promise<EWayBillResult>;
  cancel(
    ewbNo: string,
    reason: string,
    now: Date,
    creds?: EWayBillCredentials,
  ): Promise<void>;
}
