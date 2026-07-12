import {
  ValidationPipe,
  VersioningType,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AccountingService } from '../src/accounting/accounting.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Full-stack API tests: real Nest app, real Postgres (dedicated test DB).
 *
 * Walks the whole business this install actually sells — login into a financial
 * year → items & customers → estimate → GST invoice → purchase bill → payments →
 * credit note → stock → reports — asserting the accounting invariants at each
 * step. The money assertions here are the safety net around `gst-calculator.ts`:
 * if a change moves a rupee, these fail.
 */
describe('ERP API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<INestApplication['getHttpServer']>;

  const OWNER = { email: 'owner@test.local', password: 'e2e-owner-password' };
  const OUTSIDER = { email: 'outsider@test.local', password: 'e2e-outsider-pass' };

  // The books run in the financial year that "today" falls in — the same rule
  // the app uses, so this suite keeps working as the calendar moves.
  const now = new Date();
  const fyStartYear =
    now.getUTCMonth() + 1 >= 4 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const FY = `${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, '0')}`;
  const NEXT_FY = `${fyStartYear + 1}-${String((fyStartYear + 2) % 100).padStart(2, '0')}`;
  /** A date safely inside the open year (May of the FY start year). */
  const D = (day: number) => `${fyStartYear}-05-${String(day).padStart(2, '0')}`;

  let ownerToken: string;
  let outsiderToken: string;
  let companyId: string;
  let ledgers: Record<string, string> = {};
  let customerId: string;
  let vendorId: string;
  let itemId: string;
  let invoiceId: string;

  const auth = () => ({ Authorization: `Bearer ${ownerToken}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    http = app.getHttpServer();
    prisma = app.get(PrismaService);

    // Clean slate — truncate everything (test DB only).
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "bill_payments", "purchase_bill_lines", "purchase_bills", "purchase_bill_counters",
        "estimate_lines", "estimates", "estimate_counters",
        "payments", "invoice_lines", "invoices", "invoice_counters",
        "note_lines", "notes", "note_counters",
        "party_payments",
        "voucher_lines", "vouchers", "voucher_counters",
        "audit_logs", "item_batches", "branches",
        "items", "parties", "ledgers", "account_groups",
        "password_reset_tokens", "refresh_tokens",
        "company_users", "companies", "users"
      CASCADE`);

    // There is no sign-up route in this build — accounts are provisioned, exactly
    // as `npm run db:seed` does it in production.
    const owner = await prisma.user.create({
      data: {
        name: 'Owner',
        email: OWNER.email,
        passwordHash: await bcrypt.hash(OWNER.password, 10),
      },
    });
    await prisma.user.create({
      data: {
        name: 'Outsider',
        email: OUTSIDER.email,
        passwordHash: await bcrypt.hash(OUTSIDER.password, 10),
      },
    });

    const accounting = app.get(AccountingService);
    const company = await prisma.$transaction(async (tx) => {
      const created = await tx.company.create({
        data: {
          name: 'Mohan Kumar Textiles',
          gstin: '33AAAAA0000A1Z5',
          stateCode: '33',
          members: { create: { userId: owner.id, role: 'OWNER' } },
        },
      });
      await accounting.seedDefaults(tx, created.id);
      return created;
    });
    companyId = company.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const login = (creds: { email: string; password: string }, fiscalYear?: string) =>
    request(http)
      .post('/api/v1/auth/login')
      .send({
        identifier: creds.email,
        password: creds.password,
        ...(fiscalYear && { fiscalYear }),
      });

  // ----------------------------------------------------------------
  // Auth + financial year
  // ----------------------------------------------------------------

  it('offers the business’s financial years without authentication', async () => {
    const res = await request(http).get('/api/v1/auth/fiscal-years').expect(200);
    expect(res.body.fiscalYears).toContain(FY);
    expect(res.body.current).toBe(FY);
  });

  it('has no public sign-up route', async () => {
    await request(http)
      .post('/api/v1/auth/register')
      .send({ name: 'X', email: 'x@x.com', phone: '+919000000000', password: 'passw0rd123' })
      .expect(404);
  });

  it('logs in with a financial year and reports it back', async () => {
    const res = await login(OWNER, FY).expect(200);
    expect(res.body.fiscalYear).toBe(FY);
    expect(res.body.accessToken).toBeDefined();
    ownerToken = res.body.accessToken;

    const out = await login(OUTSIDER, FY).expect(200);
    outsiderToken = out.body.accessToken;
  });

  it('refuses a financial year the business has no books for', async () => {
    const res = await login(OWNER, '2019-20').expect(400);
    expect(res.body.message).toMatch(/not one of this business/i);
  });

  it('rejects a wrong password without revealing whether the account exists', async () => {
    const wrongPass = await login({ ...OWNER, password: 'nope' }).expect(401);
    const noSuchUser = await login({ email: 'ghost@test.local', password: 'nope' }).expect(401);
    expect(wrongPass.body.message).toBe(noSuchUser.body.message);
  });

  it('blocks unauthenticated requests', async () => {
    await request(http).get(`/api/v1/companies/${companyId}/invoices`).expect(401);
  });

  it('rotates refresh tokens and rejects reuse', async () => {
    const res = await login(OWNER, FY).expect(200);
    const first = res.body.refreshToken as string;

    const rotated = await request(http)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first })
      .expect(200);
    // The year the session was opened in survives the rotation.
    expect(rotated.body.fiscalYear).toBe(FY);

    await request(http).post('/api/v1/auth/refresh').send({ refreshToken: first }).expect(401);
  });

  it('sets httpOnly cookies and accepts cookie-only requests', async () => {
    const res = await login(OWNER, FY).expect(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('sa_access=') && c.includes('HttpOnly'))).toBe(true);

    await request(http).get('/api/v1/auth/me').set('Cookie', cookies).expect(200);
  });

  // ----------------------------------------------------------------
  // Company + tenancy
  // ----------------------------------------------------------------

  it('has no create-company route (single-business install)', async () => {
    await request(http)
      .post('/api/v1/companies')
      .set(auth())
      .send({ name: 'Rogue Co' })
      .expect(404);
  });

  it('seeded the company with a chart of accounts', async () => {
    const res = await request(http)
      .get(`/api/v1/companies/${companyId}/ledgers`)
      .set(auth())
      .expect(200);
    ledgers = Object.fromEntries(
      (res.body as { id: string; name: string }[]).map((l) => [l.name, l.id]),
    );
    for (const name of ['Cash', 'Sales', 'Purchases', 'CGST Payable', 'SGST Payable']) {
      expect(ledgers[name]).toBeDefined();
    }
  });

  it('isolates tenants — a non-member gets 403', async () => {
    await request(http)
      .get(`/api/v1/companies/${companyId}/invoices`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);
  });

  // ----------------------------------------------------------------
  // Double-entry accounting
  // ----------------------------------------------------------------

  it('rejects unbalanced vouchers', async () => {
    const res = await request(http)
      .post(`/api/v1/companies/${companyId}/vouchers`)
      .set(auth())
      .send({
        type: 'PAYMENT',
        date: D(11),
        lines: [
          { ledgerId: ledgers['Purchases'], type: 'DEBIT', amount: 100 },
          { ledgerId: ledgers['Cash'], type: 'CREDIT', amount: 99.99 },
        ],
      })
      .expect(400);
    expect(res.body.message).toContain('not balanced');
  });

  it('posts balanced vouchers with sequential numbering', async () => {
    const post = (amount: number) =>
      request(http)
        .post(`/api/v1/companies/${companyId}/vouchers`)
        .set(auth())
        .send({
          type: 'PAYMENT',
          date: D(11),
          lines: [
            { ledgerId: ledgers['Purchases'], type: 'DEBIT', amount },
            { ledgerId: ledgers['Cash'], type: 'CREDIT', amount },
          ],
        });

    const v1 = await post(100).expect(201);
    await post(50).expect(201);
    expect(v1.body.voucherNo).toBe(`PMT/${FY}/0001`);
  });

  // ----------------------------------------------------------------
  // Masters
  // ----------------------------------------------------------------

  it('creates customers and vendors with auto-created ledgers', async () => {
    const cust = await request(http)
      .post(`/api/v1/companies/${companyId}/parties`)
      .set(auth())
      .send({ name: 'Ravi Textiles', type: 'CUSTOMER', gstin: '29AAAAA0000A1Z5' })
      .expect(201);
    customerId = cust.body.id;

    const vend = await request(http)
      .post(`/api/v1/companies/${companyId}/parties`)
      .set(auth())
      .send({ name: 'Yarn Suppliers', type: 'VENDOR', gstin: '33BBBBB0000B1Z5' })
      .expect(201);
    vendorId = vend.body.id;
    expect(cust.body.ledgerId).toBeDefined();
  });

  it('creates an item with HSN and GST rate', async () => {
    const res = await request(http)
      .post(`/api/v1/companies/${companyId}/items`)
      .set(auth())
      .send({
        name: 'Cotton Banian',
        unit: 'PCS',
        hsnCode: '6109',
        gstRate: 18,
        salePrice: 500,
        purchasePrice: 400,
      })
      .expect(201);
    itemId = res.body.id;
  });

  // ----------------------------------------------------------------
  // Sales: estimate → invoice → payment
  // ----------------------------------------------------------------

  it('walks the estimate lifecycle: create → accept → convert to invoice', async () => {
    const est = await request(http)
      .post(`/api/v1/companies/${companyId}/estimates`)
      .set(auth())
      .send({
        partyId: customerId,
        date: D(13),
        validUntil: D(30),
        lines: [{ itemId, quantity: 10 }],
      })
      .expect(201);
    expect(est.body.estimateNo).toMatch(/^EST\//);
    expect(est.body.status).toBe('OPEN');
    // Inter-state customer (29 vs 33): 18% IGST on 5000.
    expect(est.body.total).toBe(5900);
    const estimateId = est.body.id as string;

    const pdf = await request(http)
      .get(`/api/v1/companies/${companyId}/estimates/${estimateId}/pdf`)
      .set(auth())
      .expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');

    await request(http)
      .post(`/api/v1/companies/${companyId}/estimates/${estimateId}/status`)
      .set(auth())
      .send({ status: 'ACCEPTED' })
      .expect(201);

    const converted = await request(http)
      .post(`/api/v1/companies/${companyId}/estimates/${estimateId}/convert`)
      .set(auth())
      .expect(201);
    // Convert returns the estimate, now CONVERTED and linked to the new invoice.
    expect(converted.body.status).toBe('CONVERTED');
    expect(converted.body.invoice.invoiceNo).toMatch(/^INV\//);
    expect(converted.body.total).toBe(5900);
  });

  it('creates an inter-state invoice with IGST and posts the SALES voucher', async () => {
    const res = await request(http)
      .post(`/api/v1/companies/${companyId}/invoices`)
      .set(auth())
      .send({
        partyId: customerId,
        date: D(14),
        lines: [{ itemId, quantity: 4, rate: 500, gstRate: 18 }],
      })
      .expect(201);
    invoiceId = res.body.id;
    expect(res.body.isInterState).toBe(true);
    expect(res.body.taxableAmount).toBe(2000);
    expect(res.body.igstAmount).toBe(360);
    expect(res.body.cgstAmount).toBe(0);
    expect(res.body.sgstAmount).toBe(0);
    expect(res.body.total).toBe(2360);
  });

  it('rejects an invoice raised on a vendor', async () => {
    await request(http)
      .post(`/api/v1/companies/${companyId}/invoices`)
      .set(auth())
      .send({ partyId: vendorId, date: D(14), lines: [{ itemId, quantity: 1, rate: 100 }] })
      .expect(400);
  });

  it('walks the payment lifecycle: partial → overpayment rejected → paid', async () => {
    const pay = (amount: number) =>
      request(http)
        .post(`/api/v1/companies/${companyId}/invoices/${invoiceId}/payments`)
        .set(auth())
        .send({ date: D(15), amount, method: 'CASH', ledgerId: ledgers['Cash'] });

    const partial = await pay(1000).expect(201);
    expect(partial.body.paymentStatus).toBe('PARTIAL');
    expect(partial.body.outstanding).toBe(1360);

    await pay(9999).expect(400); // more than what's left

    const settled = await pay(1360).expect(201);
    expect(settled.body.paymentStatus).toBe('PAID');
    expect(settled.body.outstanding).toBe(0);
  });

  // ----------------------------------------------------------------
  // Financial-year scoping
  // ----------------------------------------------------------------

  it('refuses a document dated outside the open financial year', async () => {
    const res = await request(http)
      .post(`/api/v1/companies/${companyId}/invoices`)
      .set(auth())
      .send({
        partyId: customerId,
        date: `${fyStartYear + 1}-06-01`, // next FY
        lines: [{ itemId, quantity: 1, rate: 500, gstRate: 18 }],
      })
      .expect(400);
    expect(res.body.message).toContain(NEXT_FY);
  });

  it('lists only the open year’s documents', async () => {
    const res = await request(http)
      .get(`/api/v1/companies/${companyId}/invoices`)
      .set(auth())
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const inv of res.body) {
      expect(inv.invoiceNo).toContain(FY);
    }
  });

  // ----------------------------------------------------------------
  // Purchases + stock
  // ----------------------------------------------------------------

  it('books an intra-state purchase bill with CGST/SGST input credit', async () => {
    const res = await request(http)
      .post(`/api/v1/companies/${companyId}/purchase-bills`)
      .set(auth())
      .send({
        partyId: vendorId,
        date: D(10),
        supplierBillNo: 'V-001',
        lines: [{ itemId, quantity: 50, rate: 400 }],
      })
      .expect(201);
    expect(res.body.isInterState).toBe(false); // vendor 33, company 33
    expect(res.body.taxableAmount).toBe(20000);
    expect(res.body.cgstAmount).toBe(1800);
    expect(res.body.sgstAmount).toBe(1800);
    expect(res.body.total).toBe(23600);
  });

  it('computes stock from the documents (purchased − sold)', async () => {
    const res = await request(http)
      .get(`/api/v1/companies/${companyId}/stock`)
      .set(auth())
      .expect(200);
    const row = (
      res.body as {
        itemId: string;
        purchasedQty: number;
        soldQty: number;
        onHand: number;
      }[]
    ).find((r) => r.itemId === itemId)!;
    // Bought 50; sold 10 (converted estimate) + 4 (invoice) = 14.
    expect(row.purchasedQty).toBe(50);
    expect(row.soldQty).toBe(14);
    expect(row.onHand).toBe(36);
  });

  // ----------------------------------------------------------------
  // Credit note (sales return)
  // ----------------------------------------------------------------

  it('raises a credit note against an invoice and returns the goods to stock', async () => {
    const before = await request(http).get(`/api/v1/companies/${companyId}/stock`).set(auth());
    const onHandBefore = (before.body as { itemId: string; onHand: number }[]).find(
      (r) => r.itemId === itemId,
    )!.onHand;

    await request(http)
      .post(`/api/v1/companies/${companyId}/notes`)
      .set(auth())
      .send({
        type: 'CREDIT_NOTE',
        invoiceId,
        date: D(16),
        reason: 'Goods returned — damaged in transit',
        lines: [{ itemId, quantity: 1, rate: 500, gstRate: 18 }],
      })
      .expect(201);

    const after = await request(http).get(`/api/v1/companies/${companyId}/stock`).set(auth());
    const onHandAfter = (after.body as { itemId: string; onHand: number }[]).find(
      (r) => r.itemId === itemId,
    )!.onHand;
    expect(onHandAfter).toBe(onHandBefore + 1);
  });

  // ----------------------------------------------------------------
  // Reports
  // ----------------------------------------------------------------

  it('trial balance always balances', async () => {
    const res = await request(http)
      .get(`/api/v1/companies/${companyId}/reports/trial-balance`)
      .set(auth())
      .expect(200);
    expect(res.body.totalDebit).toBeCloseTo(res.body.totalCredit, 2);
  });

  it('GSTR-1 reports the year’s outward supplies', async () => {
    const res = await request(http)
      .get(`/api/v1/companies/${companyId}/reports/gstr1?from=${D(1)}&to=${D(31)}`)
      .set(auth())
      .expect(200);
    expect(res.body).toBeDefined();
  });

  it('gives the customer a document-based statement with outstanding', async () => {
    const res = await request(http)
      .get(`/api/v1/companies/${companyId}/parties/${customerId}/statement`)
      .set(auth())
      .expect(200);
    expect(res.body.docType).toBe('invoice');
    expect(Array.isArray(res.body.documents)).toBe(true);
  });

  it('keeps an audit trail of mutating actions', async () => {
    const res = await request(http)
      .get(`/api/v1/companies/${companyId}/audit-logs`)
      .set(auth())
      .expect(200);
    expect(Array.isArray(res.body.rows ?? res.body)).toBe(true);
  });
});
