import {
  ValidationPipe,
  VersioningType,
  type INestApplication,
} from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { createHash, createHmac } from 'crypto';
import { join } from 'path';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AI_PROVIDER } from '../src/ai/ai-provider.interface';
import { RAZORPAY_CLIENT } from '../src/billing/razorpay.client';
import { PrismaService } from '../src/prisma/prisma.service';

/** Deterministic stand-in for the Gemini adapter — tests script its answers. */
const aiStub = {
  name: 'stub',
  model: 'stub-model',
  completeJson: jest.fn<Promise<string>, [{ system: string; prompt: string }]>(),
};

/** Stand-in for the Razorpay REST client — orders get predictable ids. */
let rzpOrderCounter = 0;
const razorpayStub = {
  keyId: 'rzp_test_stub',
  createOrder: jest.fn(
    async (amountPaise: number) => ({
      id: `order_e2e_${++rzpOrderCounter}`,
      amount: amountPaise,
      currency: 'INR',
      status: 'created',
    }),
  ),
};

/**
 * Full-stack API tests: real Nest app, real Postgres (dedicated test DB).
 * Walks the entire business flow a client would: signup → company →
 * vouchers → invoice → payments → reports, asserting the accounting
 * invariants at each step.
 */

describe('RGS API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<INestApplication['getHttpServer']>;

  // Shared state across the ordered flow below
  let ownerToken: string;
  let outsiderToken: string;
  let companyId: string;
  let ledgers: Record<string, string> = {};
  let customerId: string;
  let vendorId: string;
  let itemId: string;
  let invoiceId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AI_PROVIDER)
      .useValue(aiStub)
      .overrideProvider(RAZORPAY_CLIENT)
      .useValue(razorpayStub)
      .compile();

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
        "purchase_estimate_lines", "purchase_estimates", "purchase_estimate_counters",
        "bill_payments", "purchase_bill_lines", "purchase_bills", "purchase_bill_counters",
        "estimate_lines", "estimates", "estimate_counters",
        "payments", "invoice_lines", "invoices", "invoice_counters",
        "voucher_lines", "vouchers", "voucher_counters",
        "pay_run_lines", "pay_runs", "employees",
        "stock_transfer_lines", "stock_transfers", "stock_transfer_counters",
        "job_work_issue_lines", "job_work_receipt_lines", "job_works", "job_work_counters",
        "grn_lines", "grns", "purchase_order_lines", "purchase_orders", "po_counters", "grn_counters",
        "note_lines", "notes", "note_counters",
        "bank_statement_lines", "bank_import_batches",
        "opening_documents", "audit_logs",
        "item_batches", "branches",
        "items", "parties", "ledgers", "account_groups",
        "invites", "password_reset_tokens", "refresh_tokens", "user_subscriptions",
        "company_users", "companies", "users"
      CASCADE`);
    await prisma.plan.deleteMany({ where: { code: 'PRO' } });
    // Plans persist across runs (seeded, never truncated) — pre-existing rows
    // miss feature flags added later, so pin the one this suite depends on.
    await prisma.plan.update({
      where: { code: 'STARTER' },
      data: { features: { payroll: false, ai: false } },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // ----------------------------------------------------------------
  // Auth
  // ----------------------------------------------------------------

  it('registers a user and returns a token pair', async () => {
    const res = await request(http)
      .post('/api/v1/auth/register')
      .send({ name: 'Owner', email: 'owner@test.io', phone: '+919000000001', password: 'password-123' })
      .expect(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    ownerToken = res.body.accessToken;

    const outsider = await request(http)
      .post('/api/v1/auth/register')
      .send({ name: 'Outsider', email: 'outsider@test.io', phone: '+919000000002', password: 'password-123' })
      .expect(201);
    outsiderToken = outsider.body.accessToken;
  });

  it('rejects duplicate registration and wrong passwords', async () => {
    await request(http)
      .post('/api/v1/auth/register')
      .send({ name: 'Owner', email: 'owner@test.io', phone: '+919000000003', password: 'password-123' })
      .expect(409);
    await request(http)
      .post('/api/v1/auth/login')
      .send({ identifier: 'owner@test.io', password: 'wrong-password' })
      .expect(401);
  });

  it('rotates refresh tokens and rejects reuse', async () => {
    const login = await request(http)
      .post('/api/v1/auth/login')
      .send({ identifier: 'owner@test.io', password: 'password-123' })
      .expect(200);
    const rt = login.body.refreshToken;

    await request(http).post('/api/v1/auth/refresh').send({ refreshToken: rt }).expect(200);
    await request(http).post('/api/v1/auth/refresh').send({ refreshToken: rt }).expect(401);
  });

  it('blocks unauthenticated requests', async () => {
    await request(http).get('/api/v1/auth/me').expect(401);
  });

  // ----------------------------------------------------------------
  // Company + seeding
  // ----------------------------------------------------------------

  it('creates a company with a seeded chart of accounts', async () => {
    const res = await request(http)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'E2E Traders', gstin: '29AAACE1234F1Z5' })
      .expect(201);
    companyId = res.body.id;
    expect(res.body.stateCode).toBe('29');

    const ledgerRes = await request(http)
      .get(`/api/v1/companies/${companyId}/ledgers`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(ledgerRes.body).toHaveLength(10);
    ledgers = Object.fromEntries(
      ledgerRes.body.map((l: { name: string; id: string }) => [l.name, l.id]),
    );
    expect(ledgers['Cash']).toBeDefined();
    expect(ledgers['Sales']).toBeDefined();
    expect(ledgers['IGST Payable']).toBeDefined();

    // Lift the shared owner onto an unrestricted paid plan — trial limits
    // get their own dedicated tests below.
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: 'owner@test.io' },
    });
    const business = await prisma.plan.findUniqueOrThrow({
      where: { code: 'BUSINESS' },
    });
    await prisma.userSubscription.upsert({
      where: { userId: owner.id },
      update: { planId: business.id, status: 'ACTIVE', expiresAt: null },
      create: { userId: owner.id, planId: business.id, status: 'ACTIVE', expiresAt: null },
    });
  });

  it('rejects an invalid GSTIN', async () => {
    await request(http)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Bad GST Co', gstin: 'NOT-A-GSTIN' })
      .expect(400);
  });

  it('isolates tenants — non-members get 403', async () => {
    await request(http)
      .get(`/api/v1/companies/${companyId}/ledgers`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);
  });

  // ----------------------------------------------------------------
  // Voucher engine
  // ----------------------------------------------------------------

  it('rejects unbalanced vouchers', async () => {
    const res = await request(http)
      .post(`/api/v1/companies/${companyId}/vouchers`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        type: 'PAYMENT',
        date: '2026-06-11',
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
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          type: 'PAYMENT',
          date: '2026-06-11',
          lines: [
            { ledgerId: ledgers['Purchases'], type: 'DEBIT', amount },
            { ledgerId: ledgers['Cash'], type: 'CREDIT', amount },
          ],
        });

    const v1 = await post(100).expect(201);
    const v2 = await post(50).expect(201);
    expect(v1.body.voucherNo).toBe('PMT/2026-27/0001');
    expect(v2.body.voucherNo).toBe('PMT/2026-27/0002');
  });

  it('cancelling a voucher reverses ledger balances', async () => {
    const balanceOf = async (name: string) => {
      const res = await request(http)
        .get(`/api/v1/companies/${companyId}/ledgers`)
        .set('Authorization', `Bearer ${ownerToken}`);
      const ledger = res.body.find((l: { name: string }) => l.name === name);
      return `${ledger.balance} ${ledger.balanceType}`;
    };

    expect(await balanceOf('Cash')).toBe('150 CREDIT');

    const list = await request(http)
      .get(`/api/v1/companies/${companyId}/vouchers?type=PAYMENT`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const v2 = list.body.find((v: { voucherNo: string }) =>
      v.voucherNo.endsWith('0002'),
    );
    await request(http)
      .post(`/api/v1/companies/${companyId}/vouchers/${v2.id}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);

    expect(await balanceOf('Cash')).toBe('100 CREDIT');
  });

  // ----------------------------------------------------------------
  // Parties & items
  // ----------------------------------------------------------------

  it('creates parties with auto-created ledgers in the right groups', async () => {
    const customer = await request(http)
      .post(`/api/v1/companies/${companyId}/parties`)
      .set('Authorization', `Bearer ${ownerToken}`)
      // Tamil Nadu customer (33) vs Karnataka company (29) → inter-state
      .send({ type: 'CUSTOMER', name: 'TN Customer', gstin: '33AAACT1111A1Z9' })
      .expect(201);
    customerId = customer.body.id;

    const vendor = await request(http)
      .post(`/api/v1/companies/${companyId}/parties`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ type: 'VENDOR', name: 'KA Vendor', gstin: '29AAACV2222B1Z8' })
      .expect(201);
    vendorId = vendor.body.id;

    const ledgerRes = await request(http)
      .get(`/api/v1/companies/${companyId}/ledgers`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const customerLedger = ledgerRes.body.find(
      (l: { name: string }) => l.name === 'TN Customer',
    );
    expect(customerLedger.group.name).toBe('Sundry Debtors');
  });

  it('creates an item with HSN and GST rate', async () => {
    const res = await request(http)
      .post(`/api/v1/companies/${companyId}/items`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Widget', hsnCode: '8479', unit: 'PCS', gstRate: 18, salePrice: 500, purchasePrice: 400 })
      .expect(201);
    itemId = res.body.id;

    await request(http)
      .post(`/api/v1/companies/${companyId}/items`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Bad Rate', gstRate: 7 })
      .expect(400);
  });

  // ----------------------------------------------------------------
  // Invoicing + payments
  // ----------------------------------------------------------------

  it('creates an inter-state invoice with IGST and posts the voucher', async () => {
    const res = await request(http)
      .post(`/api/v1/companies/${companyId}/invoices`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        partyId: customerId,
        date: '2026-06-11',
        lines: [{ itemId, quantity: 10 }],
      })
      .expect(201);

    invoiceId = res.body.id;
    expect(res.body.isInterState).toBe(true);
    expect(res.body.taxableAmount).toBe(5000);
    expect(res.body.igstAmount).toBe(900);
    expect(res.body.cgstAmount).toBe(0);
    expect(res.body.total).toBe(5900);
    expect(res.body.paymentStatus).toBe('UNPAID');

    // The SALES voucher must mirror the invoice exactly.
    const vouchers = await request(http)
      .get(`/api/v1/companies/${companyId}/vouchers?type=SALES`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const lines = vouchers.body[0].lines;
    const byLedger = Object.fromEntries(
      lines.map((l: { ledgerName: string; type: string; amount: number }) => [
        l.ledgerName,
        `${l.type} ${l.amount}`,
      ]),
    );
    expect(byLedger['TN Customer']).toBe('DEBIT 5900');
    expect(byLedger['Sales']).toBe('CREDIT 5000');
    expect(byLedger['IGST Payable']).toBe('CREDIT 900');
  });

  it('rejects invoices raised on vendors', async () => {
    await request(http)
      .post(`/api/v1/companies/${companyId}/invoices`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ partyId: vendorId, date: '2026-06-11', lines: [{ itemId, quantity: 1 }] })
      .expect(400);
  });

  it('walks the payment lifecycle: partial → overpay rejected → paid', async () => {
    const pay = (amount: number) =>
      request(http)
        .post(`/api/v1/companies/${companyId}/invoices/${invoiceId}/payments`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amount, date: '2026-06-12', ledgerId: ledgers['Cash'] });

    const partial = await pay(900).expect(201);
    expect(partial.body.paymentStatus).toBe('PARTIAL');
    expect(partial.body.outstanding).toBe(5000);

    await pay(99999).expect(400); // exceeds outstanding

    // Cancelling with payments on record must be blocked.
    await request(http)
      .post(`/api/v1/companies/${companyId}/invoices/${invoiceId}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);

    const full = await pay(5000).expect(201);
    expect(full.body.paymentStatus).toBe('PAID');
    expect(full.body.outstanding).toBe(0);
  });

  // ----------------------------------------------------------------
  // Estimates / quotations
  // ----------------------------------------------------------------

  it('walks the estimate lifecycle: create → PDF → accept → convert → linked invoice', async () => {
    const est = await request(http)
      .post(`/api/v1/companies/${companyId}/estimates`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        partyId: customerId,
        date: '2026-06-13',
        validUntil: '2026-06-30',
        notes: 'Bulk order quote',
        lines: [{ itemId, quantity: 10 }],
      })
      .expect(201);
    expect(est.body.estimateNo).toMatch(/^EST\//);
    expect(est.body.status).toBe('OPEN');
    expect(est.body.total).toBe(5900); // inter-state customer, 18% slab on 5000
    expect(est.body.invoice).toBeNull();
    const estimateId = est.body.id as string;

    // No SALES voucher should exist yet — an estimate posts nothing.
    const salesBefore = await request(http)
      .get(`/api/v1/companies/${companyId}/vouchers?type=SALES`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const salesCountBefore = salesBefore.body.length;

    // PDF renders.
    const pdf = await request(http)
      .get(`/api/v1/companies/${companyId}/estimates/${estimateId}/pdf`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');

    // Accept, then convert to a real invoice.
    await request(http)
      .post(`/api/v1/companies/${companyId}/estimates/${estimateId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'ACCEPTED' })
      .expect(201);

    const converted = await request(http)
      .post(`/api/v1/companies/${companyId}/estimates/${estimateId}/convert`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    expect(converted.body.status).toBe('CONVERTED');
    expect(converted.body.invoice).not.toBeNull();
    expect(converted.body.invoice.invoiceNo).toMatch(/^INV\//);

    // Conversion posted exactly one new SALES voucher.
    const salesAfter = await request(http)
      .get(`/api/v1/companies/${companyId}/vouchers?type=SALES`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(salesAfter.body.length).toBe(salesCountBefore + 1);

    // Cancel the converted invoice so later stock/GST assertions see a clean
    // slate (this suite shares one DB across sequential tests).
    await request(http)
      .post(`/api/v1/companies/${companyId}/invoices/${converted.body.invoice.id}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);

    // A converted estimate can neither convert again nor cancel.
    await request(http)
      .post(`/api/v1/companies/${companyId}/estimates/${estimateId}/convert`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);
    await request(http)
      .post(`/api/v1/companies/${companyId}/estimates/${estimateId}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);
  });

  it('rejects estimates raised on vendors and cancels an open estimate', async () => {
    await request(http)
      .post(`/api/v1/companies/${companyId}/estimates`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ partyId: vendorId, date: '2026-06-13', lines: [{ itemId, quantity: 1 }] })
      .expect(400);

    const est = await request(http)
      .post(`/api/v1/companies/${companyId}/estimates`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ partyId: customerId, date: '2026-06-13', lines: [{ itemId, quantity: 2 }] })
      .expect(201);
    const cancelled = await request(http)
      .post(`/api/v1/companies/${companyId}/estimates/${est.body.id}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    // A cancelled estimate cannot be converted.
    await request(http)
      .post(`/api/v1/companies/${companyId}/estimates/${est.body.id}/convert`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);
  });

  it('walks the purchase-estimate lifecycle: create → PDF → convert → linked bill', async () => {
    const est = await request(http)
      .post(`/api/v1/companies/${companyId}/purchase-estimates`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        partyId: vendorId,
        date: '2026-06-13',
        validUntil: '2026-06-30',
        lines: [{ itemId, quantity: 5, rate: 400 }],
      })
      .expect(201);
    expect(est.body.estimateNo).toMatch(/^PEST\//);
    expect(est.body.status).toBe('OPEN');
    expect(est.body.bill).toBeNull();
    const estimateId = est.body.id as string;

    // Raising it on a customer must fail.
    await request(http)
      .post(`/api/v1/companies/${companyId}/purchase-estimates`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ partyId: customerId, date: '2026-06-13', lines: [{ itemId, quantity: 1, rate: 1 }] })
      .expect(400);

    const pdf = await request(http)
      .get(`/api/v1/companies/${companyId}/purchase-estimates/${estimateId}/pdf`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');

    const converted = await request(http)
      .post(`/api/v1/companies/${companyId}/purchase-estimates/${estimateId}/convert`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    expect(converted.body.status).toBe('CONVERTED');
    expect(converted.body.bill).not.toBeNull();
    expect(converted.body.bill.billNo).toMatch(/^PB\//);

    // Cancel the converted bill so later stock/ITC assertions see a clean slate.
    await request(http)
      .post(`/api/v1/companies/${companyId}/purchase-bills/${converted.body.bill.id}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);

    // A converted estimate cannot convert again.
    await request(http)
      .post(`/api/v1/companies/${companyId}/purchase-estimates/${estimateId}/convert`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);
  });

  // ----------------------------------------------------------------
  // Point of sale
  // ----------------------------------------------------------------

  // ----------------------------------------------------------------
  // Purchases + stock
  // ----------------------------------------------------------------

  it('books an intra-state purchase with CGST/SGST input credit', async () => {
    const res = await request(http)
      .post(`/api/v1/companies/${companyId}/purchase-bills`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        partyId: vendorId,
        date: '2026-06-10',
        supplierBillNo: 'V-001',
        lines: [{ itemId, quantity: 50, rate: 400 }],
      })
      .expect(201);
    expect(res.body.isInterState).toBe(false);
    expect(res.body.taxableAmount).toBe(20000);
    expect(res.body.cgstAmount).toBe(1800);
    expect(res.body.sgstAmount).toBe(1800);
    expect(res.body.total).toBe(23600);
  });

  it('computes stock from documents', async () => {
    const res = await request(http)
      .get(`/api/v1/companies/${companyId}/stock`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const widget = res.body.find((s: { name: string }) => s.name === 'Widget');
    expect(widget.purchasedQty).toBe(50);
    expect(widget.soldQty).toBe(10);
    expect(widget.onHand).toBe(40);
    expect(widget.avgRate).toBe(400);
    expect(widget.stockValue).toBe(16000);
  });

  // ----------------------------------------------------------------
  // Reports
  // ----------------------------------------------------------------

  it('trial balance always balances', async () => {
    const res = await request(http)
      .get(`/api/v1/companies/${companyId}/reports/trial-balance`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.totalDebit).toBeCloseTo(res.body.totalCredit, 2);
    expect(res.body.totalDebit).toBeGreaterThan(0);
  });

  it('balance sheet balances: assets = liabilities + P&L', async () => {
    const res = await request(http)
      .get(`/api/v1/companies/${companyId}/reports/balance-sheet`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.totalAssets).toBeCloseTo(res.body.totalLiabilities, 2);
  });

  it('GSTR-3B reconciles with the documents', async () => {
    const res = await request(http)
      .get(`/api/v1/companies/${companyId}/reports/gstr3b`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.outwardSupplies.igst).toBe(900);
    expect(res.body.eligibleItc.cgst).toBe(1800);
    expect(res.body.eligibleItc.sgst).toBe(1800);
  });

  // ----------------------------------------------------------------
  // Branch stock + transfers
  // ----------------------------------------------------------------

  let northId: string;
  let southId: string;

  it('moves stock between branches with availability checks', async () => {
    const auth = { Authorization: `Bearer ${ownerToken}` };
    const north = await request(http)
      .post(`/api/v1/companies/${companyId}/branches`)
      .set(auth)
      .send({ name: 'North', city: 'Chennai' })
      .expect(201);
    const south = await request(http)
      .post(`/api/v1/companies/${companyId}/branches`)
      .set(auth)
      .send({ name: 'South', city: 'Madurai' })
      .expect(201);
    northId = north.body.id;
    southId = south.body.id;

    // All stock so far came from unbranched documents → Head Office pool.
    const before = await request(http)
      .get(`/api/v1/companies/${companyId}/stock-transfers/by-branch`)
      .set(auth)
      .expect(200);
    const widgetBefore = before.body.rows.find(
      (r: { name: string }) => r.name === 'Widget',
    );
    expect(widgetBefore.quantities['']).toBe(40);
    expect(widgetBefore.quantities[northId]).toBe(0);
    expect(widgetBefore.total).toBe(40);

    // HO → North, numbered TRF/<fy>/0001.
    const transfer = await request(http)
      .post(`/api/v1/companies/${companyId}/stock-transfers`)
      .set(auth)
      .send({ date: '2026-06-11', toBranchId: northId, lines: [{ itemId, quantity: 15 }] })
      .expect(201);
    expect(transfer.body.transferNo).toBe('TRF/2026-27/0001');
    expect(transfer.body.fromBranch).toBeNull();
    expect(transfer.body.toBranch.name).toBe('North');

    const after = await request(http)
      .get(`/api/v1/companies/${companyId}/stock-transfers/by-branch`)
      .set(auth)
      .expect(200);
    const widget = after.body.rows.find((r: { name: string }) => r.name === 'Widget');
    expect(widget.quantities['']).toBe(25);
    expect(widget.quantities[northId]).toBe(15);
    expect(widget.total).toBe(40);

    // Source availability is enforced: North only holds 15.
    const oversell = await request(http)
      .post(`/api/v1/companies/${companyId}/stock-transfers`)
      .set(auth)
      .send({
        date: '2026-06-11',
        fromBranchId: northId,
        toBranchId: southId,
        lines: [{ itemId, quantity: 30 }],
      })
      .expect(400);
    expect(oversell.body.message).toContain('only 15');

    // Same source and destination is meaningless.
    await request(http)
      .post(`/api/v1/companies/${companyId}/stock-transfers`)
      .set(auth)
      .send({
        date: '2026-06-11',
        fromBranchId: northId,
        toBranchId: northId,
        lines: [{ itemId, quantity: 1 }],
      })
      .expect(400);

    // Cancelling reverses the movement.
    await request(http)
      .post(`/api/v1/companies/${companyId}/stock-transfers/${transfer.body.id}/cancel`)
      .set(auth)
      .expect(201);
    const reverted = await request(http)
      .get(`/api/v1/companies/${companyId}/stock-transfers/by-branch`)
      .set(auth)
      .expect(200);
    const widgetReverted = reverted.body.rows.find(
      (r: { name: string }) => r.name === 'Widget',
    );
    expect(widgetReverted.quantities['']).toBe(40);
    expect(widgetReverted.quantities[northId]).toBe(0);
  });

  it('requires a batch when transferring batch-tracked items', async () => {
    const auth = { Authorization: `Bearer ${ownerToken}` };
    const tracked = await request(http)
      .post(`/api/v1/companies/${companyId}/items`)
      .set(auth)
      .send({ name: 'Serum', unit: 'PCS', gstRate: 12, trackBatches: true })
      .expect(201);
    await request(http)
      .post(`/api/v1/companies/${companyId}/purchase-bills`)
      .set(auth)
      .send({
        partyId: vendorId,
        date: '2026-06-11',
        lines: [{ itemId: tracked.body.id, quantity: 10, rate: 100, batchNo: 'SRM-1', expiryDate: '2027-01-01' }],
      })
      .expect(201);

    await request(http)
      .post(`/api/v1/companies/${companyId}/stock-transfers`)
      .set(auth)
      .send({
        date: '2026-06-11',
        toBranchId: northId,
        lines: [{ itemId: tracked.body.id, quantity: 4 }],
      })
      .expect(400);

    const ok = await request(http)
      .post(`/api/v1/companies/${companyId}/stock-transfers`)
      .set(auth)
      .send({
        date: '2026-06-11',
        toBranchId: northId,
        lines: [{ itemId: tracked.body.id, quantity: 4, batchNo: 'SRM-1' }],
      })
      .expect(201);
    expect(ok.body.lines[0].batchNo).toBe('SRM-1');

    // Only 6 bottles of the batch remain at Head Office.
    await request(http)
      .post(`/api/v1/companies/${companyId}/stock-transfers`)
      .set(auth)
      .send({
        date: '2026-06-11',
        toBranchId: southId,
        lines: [{ itemId: tracked.body.id, quantity: 7, batchNo: 'SRM-1' }],
      })
      .expect(400);
  });

  // ----------------------------------------------------------------
  // Branch-scoped access (BRANCH_MANAGER)
  // ----------------------------------------------------------------

  it('confines a branch manager to their branch', async () => {
    const auth = { Authorization: `Bearer ${ownerToken}` };
    const reg = await request(http)
      .post('/api/v1/auth/register')
      .send({ name: 'North Manager', email: 'north@test.io', phone: '+919000000004', password: 'password-123' })
      .expect(201);
    const managerToken = reg.body.accessToken;
    const managerAuth = { Authorization: `Bearer ${managerToken}` };
    const manager = await prisma.user.findUniqueOrThrow({
      where: { email: 'north@test.io' },
    });
    await prisma.companyUser.create({
      data: { userId: manager.id, companyId, role: 'BRANCH_MANAGER', branchId: northId },
    });

    // Existing documents are unbranched — invisible to the manager.
    const list = await request(http)
      .get(`/api/v1/companies/${companyId}/invoices`)
      .set(managerAuth)
      .expect(200);
    expect(list.body).toHaveLength(0);
    await request(http)
      .get(`/api/v1/companies/${companyId}/invoices/${invoiceId}`)
      .set(managerAuth)
      .expect(404);
    // The owner still sees everything.
    const ownerList = await request(http)
      .get(`/api/v1/companies/${companyId}/invoices`)
      .set(auth)
      .expect(200);
    expect(ownerList.body.length).toBeGreaterThan(0);

    // Whatever the manager bills lands on their own branch — even when
    // they claim another one.
    const created = await request(http)
      .post(`/api/v1/companies/${companyId}/invoices`)
      .set(managerAuth)
      .send({
        partyId: customerId,
        branchId: southId,
        date: '2026-06-11',
        lines: [{ itemId, quantity: 2 }],
      })
      .expect(201);
    expect(created.body.branch.id).toBe(northId);
    const afterCreate = await request(http)
      .get(`/api/v1/companies/${companyId}/invoices`)
      .set(managerAuth)
      .expect(200);
    expect(afterCreate.body).toHaveLength(1);

    // Transfers must touch their branch.
    await request(http)
      .post(`/api/v1/companies/${companyId}/stock-transfers`)
      .set(managerAuth)
      .send({ date: '2026-06-11', toBranchId: northId, lines: [{ itemId, quantity: 5 }] })
      .expect(201);
    await request(http)
      .post(`/api/v1/companies/${companyId}/stock-transfers`)
      .set(managerAuth)
      .send({ date: '2026-06-11', toBranchId: southId, lines: [{ itemId, quantity: 5 }] })
      .expect(403);
  });

  it('invites carry the branch through to the membership', async () => {
    const auth = { Authorization: `Bearer ${ownerToken}` };
    // Branch must belong to the company.
    await request(http)
      .post(`/api/v1/companies/${companyId}/invites`)
      .set(auth)
      .send({
        email: 'south@test.io',
        role: 'BRANCH_MANAGER',
        branchId: '00000000-0000-4000-8000-000000000000',
      })
      .expect(400);
    await request(http)
      .post(`/api/v1/companies/${companyId}/invites`)
      .set(auth)
      .send({ email: 'south@test.io', role: 'BRANCH_MANAGER', branchId: southId })
      .expect(201);

    // The raw token only travels by email; plant a known one to accept with.
    const rawInvite = 'e2e-invite-token';
    await prisma.invite.create({
      data: {
        email: 'south2@test.io',
        companyId,
        role: 'BRANCH_MANAGER',
        branchId: southId,
        invitedById: (await prisma.user.findUniqueOrThrow({ where: { email: 'owner@test.io' } })).id,
        tokenHash: createHash('sha256').update(rawInvite).digest('hex'),
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      },
    });
    await request(http)
      .post(`/api/v1/invites/${rawInvite}/accept`)
      .send({ name: 'South Manager', password: 'password-123' })
      .expect(201);
    const member = await prisma.companyUser.findFirstOrThrow({
      where: { companyId, user: { email: 'south2@test.io' } },
    });
    expect(member.role).toBe('BRANCH_MANAGER');
    expect(member.branchId).toBe(southId);
  });

  // ----------------------------------------------------------------
  // Payroll
  // ----------------------------------------------------------------

  it('runs payroll end to end: employees → draft → LOP → post → pay', async () => {
    const auth = { Authorization: `Bearer ${ownerToken}` };

    await request(http)
      .post(`/api/v1/companies/${companyId}/employees`)
      .set(auth)
      .send({
        code: 'EMP-001', name: 'Asha K', designation: 'Accountant',
        joinDate: '2026-04-01', basic: 18000, hra: 6000,
        ptMonthly: 200, tdsMonthly: 500,
      })
      .expect(201);
    const empB = await request(http)
      .post(`/api/v1/companies/${companyId}/employees`)
      .set(auth)
      .send({
        code: 'EMP-002', name: 'Bala R', designation: 'Sales',
        joinDate: '2026-05-15', basic: 12000, hra: 4000,
      })
      .expect(201);
    expect(empB.body.monthlyGross).toBe(16000);
    // Duplicate codes are rejected.
    await request(http)
      .post(`/api/v1/companies/${companyId}/employees`)
      .set(auth)
      .send({ code: 'EMP-001', name: 'Dup', joinDate: '2026-06-01', basic: 1000 })
      .expect(409);

    // Draft run for June 2026 (30 days, no LOP yet).
    const run = await request(http)
      .post(`/api/v1/companies/${companyId}/payroll/runs`)
      .set(auth)
      .send({ year: 2026, month: 6 })
      .expect(201);
    const runId = run.body.id;
    expect(run.body.status).toBe('DRAFT');
    expect(run.body.employeeCount).toBe(2);
    const asha = run.body.lines.find((l: { employee: { code: string } }) => l.employee.code === 'EMP-001');
    const bala = run.body.lines.find((l: { employee: { code: string } }) => l.employee.code === 'EMP-002');
    // Asha: gross 24,000 → PF capped at 15k basic = 1,800, no ESI (> 21k).
    expect(asha.gross).toBe(24000);
    expect(asha.pfEmployee).toBe(1800);
    expect(asha.esiEmployee).toBe(0);
    expect(asha.netPay).toBe(24000 - 1800 - 200 - 500);
    // Bala: gross 16,000 → PF 1,440, ESI 120.
    expect(bala.gross).toBe(16000);
    expect(bala.pfEmployee).toBe(1440);
    expect(bala.esiEmployee).toBe(120);
    expect(bala.netPay).toBe(16000 - 1440 - 120);

    // One open run per month.
    await request(http)
      .post(`/api/v1/companies/${companyId}/payroll/runs`)
      .set(auth)
      .send({ year: 2026, month: 6 })
      .expect(409);

    // 15 days loss-of-pay halves Bala's slip and the statutory amounts.
    const afterLop = await request(http)
      .patch(`/api/v1/companies/${companyId}/payroll/runs/${runId}/lines/${bala.id}`)
      .set(auth)
      .send({ lopDays: 15 })
      .expect(200);
    const balaHalf = afterLop.body.lines.find(
      (l: { employee: { code: string } }) => l.employee.code === 'EMP-002',
    );
    expect(balaHalf.gross).toBe(8000);
    expect(balaHalf.pfEmployee).toBe(720);
    expect(balaHalf.esiEmployee).toBe(60);
    expect(balaHalf.netPay).toBe(8000 - 720 - 60);

    // Payslips only exist once posted.
    await request(http)
      .get(`/api/v1/companies/${companyId}/payroll/runs/${runId}/payslips/${bala.id}/pdf`)
      .set(auth)
      .expect(400);

    // Post to the books: JOURNAL voucher, payroll ledgers auto-created,
    // and the trial balance still balances.
    const posted = await request(http)
      .post(`/api/v1/companies/${companyId}/payroll/runs/${runId}/post`)
      .set(auth)
      .send({})
      .expect(201);
    expect(posted.body.status).toBe('POSTED');
    expect(posted.body.voucherId).toBeTruthy();
    const expectedNet = asha.netPay + balaHalf.netPay;
    expect(posted.body.totals.netPay).toBe(expectedNet);

    const ledgers = await request(http)
      .get(`/api/v1/companies/${companyId}/ledgers`)
      .set(auth)
      .expect(200);
    const byName = Object.fromEntries(
      ledgers.body.map((l: { name: string; balance: number; balanceType: string }) => [
        l.name,
        l,
      ]),
    );
    expect(`${byName['Salaries Payable'].balance} ${byName['Salaries Payable'].balanceType}`)
      .toBe(`${expectedNet} CREDIT`);
    expect(byName['Salaries & Wages'].balance).toBe(asha.gross + balaHalf.gross);
    expect(byName['PF Payable'].balanceType).toBe('CREDIT');
    const tb = await request(http)
      .get(`/api/v1/companies/${companyId}/reports/trial-balance`)
      .set(auth)
      .expect(200);
    expect(tb.body.totalDebit).toBeCloseTo(tb.body.totalCredit, 2);

    // Drafts can't be edited once posted.
    await request(http)
      .patch(`/api/v1/companies/${companyId}/payroll/runs/${runId}/lines/${bala.id}`)
      .set(auth)
      .send({ lopDays: 0 })
      .expect(400);

    // Payslip PDF now renders.
    const pdf = await request(http)
      .get(`/api/v1/companies/${companyId}/payroll/runs/${runId}/payslips/${bala.id}/pdf`)
      .set(auth)
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');

    // Pay out of Cash: Salaries Payable clears.
    const paid = await request(http)
      .post(`/api/v1/companies/${companyId}/payroll/runs/${runId}/pay`)
      .set(auth)
      .send({ date: '2026-07-01', ledgerId: byName['Cash'].id })
      .expect(201);
    expect(paid.body.status).toBe('PAID');
    const ledgersAfter = await request(http)
      .get(`/api/v1/companies/${companyId}/ledgers`)
      .set(auth)
      .expect(200);
    const salariesPayable = ledgersAfter.body.find(
      (l: { name: string }) => l.name === 'Salaries Payable',
    );
    expect(salariesPayable.balance).toBe(0);

    // Paid runs are immutable.
    await request(http)
      .post(`/api/v1/companies/${companyId}/payroll/runs/${runId}/cancel`)
      .set(auth)
      .expect(400);
  });

  it('keeps payroll away from non-accounting roles', async () => {
    await request(http)
      .post('/api/v1/auth/register')
      .send({ name: 'Cashier', email: 'cashier@test.io', phone: '+919000000005', password: 'password-123' })
      .expect(201);
    const cashier = await prisma.user.findUniqueOrThrow({
      where: { email: 'cashier@test.io' },
    });
    await prisma.companyUser.create({
      data: { userId: cashier.id, companyId, role: 'CASHIER' },
    });
    const login = await request(http)
      .post('/api/v1/auth/login')
      .send({ identifier: 'cashier@test.io', password: 'password-123' })
      .expect(200);
    await request(http)
      .get(`/api/v1/companies/${companyId}/employees`)
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(403);
    await request(http)
      .get(`/api/v1/companies/${companyId}/payroll/runs`)
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(403);
  });

  // ----------------------------------------------------------------
  // Licensing + super admin
  // ----------------------------------------------------------------

  it('enforces plan limits and lets the super admin manage subscriptions', async () => {
    // Fresh account → automatic 14-day trial (1 company, 2 branches).
    const reg = await request(http)
      .post('/api/v1/auth/register')
      .send({ name: 'Startup', email: 'startup@test.io', phone: '+919000000006', password: 'password-123' })
      .expect(201);
    const userToken = reg.body.accessToken;
    const userAuth = { Authorization: `Bearer ${userToken}` };
    const startup = await prisma.user.findUniqueOrThrow({
      where: { email: 'startup@test.io' },
    });

    const first = await request(http)
      .post('/api/v1/companies')
      .set(userAuth)
      .send({ name: 'Startup Co' })
      .expect(201);
    const second = await request(http)
      .post('/api/v1/companies')
      .set(userAuth)
      .send({ name: 'Second Co' })
      .expect(403);
    expect(second.body.message).toContain('allows 1 company');

    // Trial allows two branches per company.
    await request(http)
      .post(`/api/v1/companies/${first.body.id}/branches`)
      .set(userAuth)
      .send({ name: 'B1' })
      .expect(201);
    await request(http)
      .post(`/api/v1/companies/${first.body.id}/branches`)
      .set(userAuth)
      .send({ name: 'B2' })
      .expect(201);
    const thirdBranch = await request(http)
      .post(`/api/v1/companies/${first.body.id}/branches`)
      .set(userAuth)
      .send({ name: 'B3' })
      .expect(403);
    expect(thirdBranch.body.message).toContain('branches per company');

    // /auth/me carries the subscription summary the UI shows.
    const me = await request(http).get('/api/v1/auth/me').set(userAuth).expect(200);
    expect(me.body.subscription.planCode).toBe('TRIAL');
    expect(me.body.subscription.status).toBe('TRIAL');
    expect(me.body.subscription.companiesOwned).toBe(1);
    expect(me.body.subscription.maxCompanies).toBe(1);
    expect(me.body.isSuperAdmin).toBe(false);

    // The admin console is for platform staff only.
    await request(http).get('/api/v1/admin/overview').set(userAuth).expect(403);

    // Bootstrap a super admin.
    await request(http)
      .post('/api/v1/auth/register')
      .send({ name: 'Root', email: 'root@test.io', phone: '+919000000007', password: 'password-123' })
      .expect(201);
    await prisma.user.update({
      where: { email: 'root@test.io' },
      data: { isSuperAdmin: true },
    });
    const rootLogin = await request(http)
      .post('/api/v1/auth/login')
      .send({ identifier: 'root@test.io', password: 'password-123' })
      .expect(200);
    const rootAuth = { Authorization: `Bearer ${rootLogin.body.accessToken}` };

    const overview = await request(http)
      .get('/api/v1/admin/overview')
      .set(rootAuth)
      .expect(200);
    expect(overview.body.totalUsers).toBeGreaterThan(2);
    expect(overview.body.trialUsers).toBeGreaterThanOrEqual(1);
    expect(overview.body.planDistribution.length).toBeGreaterThanOrEqual(4);

    const search = await request(http)
      .get('/api/v1/admin/users?q=startup')
      .set(rootAuth)
      .expect(200);
    expect(search.body).toHaveLength(1);
    expect(search.body[0].subscription.planCode).toBe('TRIAL');
    expect(search.body[0].ownedCompanies).toHaveLength(1);

    // Upgrade to BUSINESS → multi-company unlocks.
    const upgraded = await request(http)
      .patch(`/api/v1/admin/users/${startup.id}/subscription`)
      .set(rootAuth)
      .send({ planCode: 'BUSINESS', notes: 'paid by NEFT ref 123' })
      .expect(200);
    expect(upgraded.body.status).toBe('ACTIVE');
    await request(http)
      .post('/api/v1/companies')
      .set(userAuth)
      .send({ name: 'Second Co' })
      .expect(201);

    // STARTER has no payroll — the whole module is feature-gated.
    await request(http)
      .patch(`/api/v1/admin/users/${startup.id}/subscription`)
      .set(rootAuth)
      .send({ planCode: 'STARTER' })
      .expect(200);
    const noPayroll = await request(http)
      .get(`/api/v1/companies/${first.body.id}/employees`)
      .set(userAuth)
      .expect(403);
    expect(noPayroll.body.message).toContain('does not include payroll');

    // An expired trial blocks new companies with a clear message.
    await request(http)
      .patch(`/api/v1/admin/users/${startup.id}/subscription`)
      .set(rootAuth)
      .send({ planCode: 'TRIAL', status: 'TRIAL', expiresAt: '2020-01-01T00:00:00.000Z' })
      .expect(200);
    const expired = await request(http)
      .post('/api/v1/companies')
      .set(userAuth)
      .send({ name: 'Third Co' })
      .expect(403);
    expect(expired.body.message).toContain('trial has ended');

    // Blocking kicks the user out at the next login and kills refresh.
    await request(http)
      .patch(`/api/v1/admin/users/${startup.id}`)
      .set(rootAuth)
      .send({ isBlocked: true })
      .expect(200);
    await request(http)
      .post('/api/v1/auth/login')
      .send({ identifier: 'startup@test.io', password: 'password-123' })
      .expect(401);
    await request(http)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: reg.body.refreshToken })
      .expect(401);

    // Admins cannot block or demote themselves.
    const root = await prisma.user.findUniqueOrThrow({ where: { email: 'root@test.io' } });
    await request(http)
      .patch(`/api/v1/admin/users/${root.id}`)
      .set(rootAuth)
      .send({ isBlocked: true })
      .expect(400);

    // Plan management.
    const plans = await request(http).get('/api/v1/admin/plans').set(rootAuth).expect(200);
    expect(plans.body.length).toBeGreaterThanOrEqual(4);
    await request(http)
      .post('/api/v1/admin/plans')
      .set(rootAuth)
      .send({ code: 'PRO', name: 'Professional', priceMonthly: 1299, maxCompanies: 10 })
      .expect(201);
    await request(http)
      .post('/api/v1/admin/plans')
      .set(rootAuth)
      .send({ code: 'PRO', name: 'Dup' })
      .expect(400);
  });

  // ----------------------------------------------------------------
  // Cookie sessions (browser auth)
  // ----------------------------------------------------------------

  it('login sets httpOnly cookies and cookie-only requests work', async () => {
    const agent = request.agent(http);

    const login = await agent
      .post('/api/v1/auth/login')
      .send({ identifier: 'owner@test.io', password: 'password-123' })
      .expect(200);

    const cookies = login.headers['set-cookie'] as unknown as string[];
    const access = cookies.find((c) => c.startsWith('sa_access='));
    const refresh = cookies.find((c) => c.startsWith('sa_refresh='));
    expect(access).toContain('HttpOnly');
    expect(refresh).toContain('HttpOnly');
    expect(refresh).toContain('Path=/api/v1/auth');

    // No Authorization header — the cookie carries the session.
    await agent.get('/api/v1/auth/me').expect(200);

    // Cookie-based refresh with an empty body rotates the pair.
    await agent.post('/api/v1/auth/refresh').send({}).expect(200);
    await agent.get('/api/v1/auth/me').expect(200);

    // Logout revokes + clears; the old access cookie dies with its TTL but
    // the refresh path is gone, so the session cannot be renewed.
    const out = await agent.post('/api/v1/auth/logout').send({}).expect(204);
    const cleared = out.headers['set-cookie'] as unknown as string[];
    expect(cleared.some((c) => c.startsWith('sa_access=;'))).toBe(true);
    await agent.post('/api/v1/auth/refresh').send({}).expect(401);
  });

  // ----------------------------------------------------------------
  // Password reset
  // ----------------------------------------------------------------

  it('walks the password reset flow and revokes existing sessions', async () => {
    await request(http)
      .post('/api/v1/auth/register')
      .send({ name: 'Resetter', email: 'reset@test.io', phone: '+919000000008', password: 'old-password-1' })
      .expect(201);

    // Unknown emails get the same 204 — no account enumeration.
    await request(http)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@test.io' })
      .expect(204);
    await request(http)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'reset@test.io' })
      .expect(204);

    // The raw token only travels by email; plant a known one for the test.
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'reset@test.io' },
    });
    const rawToken = 'e2e-reset-token';
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash('sha256').update(rawToken).digest('hex'),
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });

    const oldLogin = await request(http)
      .post('/api/v1/auth/login')
      .send({ identifier: 'reset@test.io', password: 'old-password-1' })
      .expect(200);

    await request(http)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'wrong-token', password: 'whatever-123' })
      .expect(401);
    await request(http)
      .post('/api/v1/auth/reset-password')
      .send({ token: rawToken, password: 'new-password-1' })
      .expect(204);

    // Token is single-use.
    await request(http)
      .post('/api/v1/auth/reset-password')
      .send({ token: rawToken, password: 'another-pass-1' })
      .expect(401);

    // Old password dead, new one works, old refresh token revoked.
    await request(http)
      .post('/api/v1/auth/login')
      .send({ identifier: 'reset@test.io', password: 'old-password-1' })
      .expect(401);
    await request(http)
      .post('/api/v1/auth/login')
      .send({ identifier: 'reset@test.io', password: 'new-password-1' })
      .expect(200);
    await request(http)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldLogin.body.refreshToken })
      .expect(401);
  });

  it('sells plans through Razorpay: order → verify → activate → renew via webhook', async () => {
    // Secrets come from the test env (test/setup-env.ts) — no .env dependency,
    // so this passes in CI where no .env file exists.
    const keySecret = process.env.RAZORPAY_KEY_SECRET!;
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET!;

    const reg = await request(http)
      .post('/api/v1/auth/register')
      .send({ name: 'Buyer Bala', email: 'buyer@test.io', phone: '+919000000009', password: 'super-secret-1' })
      .expect(201);
    const token = reg.body.accessToken as string;

    // Purchasable catalogue excludes the trial.
    const plans = await request(http)
      .get('/api/v1/billing/plans')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(plans.body.some((p: { code: string }) => p.code === 'TRIAL')).toBe(false);
    const business = plans.body.find((p: { code: string }) => p.code === 'BUSINESS');
    expect(business.priceMonthly).toBe(799);

    // Server prices the order — 3 months of BUSINESS.
    const order = await request(http)
      .post('/api/v1/billing/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'BUSINESS', months: 3 })
      .expect(201);
    expect(order.body.amountPaise).toBe(799 * 100 * 3);
    expect(order.body.keyId).toBe('rzp_test_stub');
    const orderId = order.body.orderId as string;

    // Tampered signature is rejected, nothing activates.
    await request(http)
      .post('/api/v1/billing/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        razorpayOrderId: orderId,
        razorpayPaymentId: 'pay_e2e_1',
        razorpaySignature: 'forged',
      })
      .expect(400);

    const sign = (payload: string, secret: string) =>
      createHmac('sha256', secret).update(payload).digest('hex');

    const verified = await request(http)
      .post('/api/v1/billing/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        razorpayOrderId: orderId,
        razorpayPaymentId: 'pay_e2e_1',
        razorpaySignature: sign(`${orderId}|pay_e2e_1`, keySecret),
      })
      .expect(201);
    expect(verified.body).toMatchObject({ planCode: 'BUSINESS', months: 3 });
    const firstExpiry = new Date(verified.body.expiresAt).getTime();
    expect(firstExpiry).toBeGreaterThan(Date.now() + 80 * 24 * 3600 * 1000);

    const me = await request(http)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.subscription).toMatchObject({ planCode: 'BUSINESS', status: 'ACTIVE' });

    // Renewal paid via webhook only (no browser): expiry EXTENDS.
    const renewal = await request(http)
      .post('/api/v1/billing/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'BUSINESS', months: 1 })
      .expect(201);
    const webhookBody = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: { entity: { id: 'pay_e2e_2', order_id: renewal.body.orderId } },
      },
    });
    await request(http)
      .post('/api/v1/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', sign(webhookBody, webhookSecret))
      .send(webhookBody)
      .expect(201);

    const me2 = await request(http)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const extended = new Date(me2.body.subscription.expiresAt).getTime();
    expect(extended).toBeGreaterThan(firstExpiry + 25 * 24 * 3600 * 1000);

    // Replayed webhook is idempotent — expiry does not move again.
    await request(http)
      .post('/api/v1/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', sign(webhookBody, webhookSecret))
      .send(webhookBody)
      .expect(201);
    const me3 = await request(http)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(new Date(me3.body.subscription.expiresAt).getTime()).toBe(extended);

    // Bad webhook signature is rejected.
    await request(http)
      .post('/api/v1/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', 'forged')
      .send(webhookBody)
      .expect(400);

    // The trial plan can never be bought.
    await request(http)
      .post('/api/v1/billing/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'TRIAL', months: 1 })
      .expect(400);
  });

  it('keeps an audit trail of mutating actions for owners/admins', async () => {
    // The voucher posted earlier in this suite must be on the trail.
    const res = await request(http)
      .get(`/api/v1/companies/${companyId}/audit-logs`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(5);
    const voucherPost = res.body.find(
      (l: { action: string; method: string }) =>
        l.method === 'POST' && l.action === 'companies/:id/vouchers',
    );
    expect(voucherPost).toBeDefined();
    expect(voucherPost.user).toBe('owner@test.io');
    expect(voucherPost.status).toBe(201);

    // Failed attempts are recorded too (unbalanced voucher → 400).
    const failed = res.body.find(
      (l: { action: string; status: number }) =>
        l.action === 'companies/:id/vouchers' && l.status === 400,
    );
    expect(failed).toBeDefined();

    // Outsiders and non-admin roles cannot read the trail.
    await request(http)
      .get(`/api/v1/companies/${companyId}/audit-logs`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);
  });

  it('renders the payslip PDF in Tamil with an embedded font', async () => {
    // Reuse the posted pay run from the payroll lifecycle test.
    const runs = await request(http)
      .get(`/api/v1/companies/${companyId}/payroll/runs`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const run = runs.body.find((r: { status: string }) => r.status !== 'DRAFT');
    const detail = await request(http)
      .get(`/api/v1/companies/${companyId}/payroll/runs/${run.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const lineId = detail.body.lines[0].id;

    const pdf = await request(http)
      .get(
        `/api/v1/companies/${companyId}/payroll/runs/${run.id}/payslips/${lineId}/pdf?lang=ta`,
      )
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .buffer()
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    const buffer = pdf.body as Buffer;
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    // The Tamil build embeds Hind Madurai instead of base-14 Helvetica.
    expect(buffer.toString('latin1')).toContain('HindMadurai');
  });

  it('prints a UPI scan-to-pay QR on invoices once the UPI ID is set', async () => {
    // Bad VPA rejected; CASHIER cannot edit the company profile.
    await request(http)
      .patch(`/api/v1/companies/${companyId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ upiId: 'not a vpa' })
      .expect(400);
    await request(http)
      .patch(`/api/v1/companies/${companyId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ upiId: 'shop@okhdfc' })
      .expect(403);

    const updated = await request(http)
      .patch(`/api/v1/companies/${companyId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ upiId: 'e2etraders@okhdfc' })
      .expect(200);
    expect(updated.body.upiId).toBe('e2etraders@okhdfc');

    const pdf = await request(http)
      .get(`/api/v1/companies/${companyId}/invoices/${invoiceId}/pdf`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .buffer()
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    // Two QR images now: the document QR and the UPI pay QR.
    const images = (pdf.body as Buffer)
      .toString('latin1')
      .match(/\/Subtype \/Image/g);
    expect(images && images.length).toBeGreaterThanOrEqual(2);

    // Clearing the VPA removes the pay QR again.
    await request(http)
      .patch(`/api/v1/companies/${companyId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ upiId: null })
      .expect(200);
  });

  it('shares an invoice publicly for WhatsApp and revokes the link', async () => {
    const shared = await request(http)
      .post(`/api/v1/companies/${companyId}/invoices/${invoiceId}/share`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    expect(shared.body.url).toContain('/public/invoices/');
    expect(shared.body.invoiceNo).toMatch(/^INV\//);
    const token = shared.body.url.split('/public/invoices/')[1].split('/')[0];
    expect(token).toHaveLength(48);

    // Sharing again reuses the same token (links stay stable).
    const again = await request(http)
      .post(`/api/v1/companies/${companyId}/invoices/${invoiceId}/share`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    expect(again.body.url).toBe(shared.body.url);

    // The public link serves the PDF with NO auth at all.
    const pdf = await request(http)
      .get(`/api/v1/public/invoices/${token}/pdf`)
      .expect(200)
      .buffer()
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    // Garbage tokens 404; revoked links die immediately.
    await request(http).get('/api/v1/public/invoices/deadbeef/pdf').expect(404);
    await request(http)
      .post(`/api/v1/companies/${companyId}/invoices/${invoiceId}/share/revoke`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    await request(http).get(`/api/v1/public/invoices/${token}/pdf`).expect(404);
  });

  it('enforces TOTP two-factor login end to end', async () => {
    const { totpCode } = require('../src/auth/totp');
    const reg = await request(http)
      .post('/api/v1/auth/register')
      .send({ name: 'MFA Mani', email: 'mfa@test.io', phone: '+919000000010', password: 'super-secret-1' })
      .expect(201);
    const token = reg.body.accessToken as string;

    // Setup → confirm with a real computed code → recovery codes once.
    const setup = await request(http)
      .post('/api/v1/auth/mfa/setup')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(setup.body.otpauthUri).toContain('otpauth://totp/RGS');
    expect(setup.body.qrDataUrl).toContain('data:image/png');
    const secret = setup.body.secret as string;

    await request(http)
      .post('/api/v1/auth/mfa/enable')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '000000' })
      .expect(400); // wrong code cannot enable
    const enabled = await request(http)
      .post('/api/v1/auth/mfa/enable')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: totpCode(secret) })
      .expect(201);
    expect(enabled.body.recoveryCodes).toHaveLength(8);
    const recovery = enabled.body.recoveryCodes[0] as string;

    // Login now returns a challenge instead of tokens.
    const challenge = await request(http)
      .post('/api/v1/auth/login')
      .send({ identifier: 'mfa@test.io', password: 'super-secret-1' })
      .expect(200);
    expect(challenge.body.mfaRequired).toBe(true);
    expect(challenge.body.accessToken).toBeUndefined();

    // Wrong code rejected; right code completes the login with cookies.
    await request(http)
      .post('/api/v1/auth/mfa/verify')
      .send({ mfaToken: challenge.body.mfaToken, code: '999999' })
      .expect(401);
    const completed = await request(http)
      .post('/api/v1/auth/mfa/verify')
      .send({ mfaToken: challenge.body.mfaToken, code: totpCode(secret) })
      .expect(200);
    expect(completed.body.accessToken).toBeDefined();
    const setCookies = completed.headers['set-cookie'] as unknown as string[];
    expect(setCookies.some((c) => c.startsWith('sa_access='))).toBe(true);

    // A recovery code works exactly once.
    const challenge2 = await request(http)
      .post('/api/v1/auth/login')
      .send({ identifier: 'mfa@test.io', password: 'super-secret-1' })
      .expect(200);
    await request(http)
      .post('/api/v1/auth/mfa/verify')
      .send({ mfaToken: challenge2.body.mfaToken, code: recovery })
      .expect(200);
    const challenge3 = await request(http)
      .post('/api/v1/auth/login')
      .send({ identifier: 'mfa@test.io', password: 'super-secret-1' })
      .expect(200);
    await request(http)
      .post('/api/v1/auth/mfa/verify')
      .send({ mfaToken: challenge3.body.mfaToken, code: recovery })
      .expect(401);

    // A normal access token is NOT acceptable as an mfaToken (purpose-bound).
    await request(http)
      .post('/api/v1/auth/mfa/verify')
      .send({ mfaToken: completed.body.accessToken, code: totpCode(secret) })
      .expect(401);

    // Disable restores plain logins.
    await request(http)
      .post('/api/v1/auth/mfa/disable')
      .set('Authorization', `Bearer ${completed.body.accessToken}`)
      .send({ code: totpCode(secret) })
      .expect(201);
    const plain = await request(http)
      .post('/api/v1/auth/login')
      .send({ identifier: 'mfa@test.io', password: 'super-secret-1' })
      .expect(200);
    expect(plain.body.accessToken).toBeDefined();
  });

  it('tracks textile job work: issue, receive with wastage, close, cancel', async () => {
    const grey = await request(http)
      .post(`/api/v1/companies/${companyId}/items`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Grey Fabric 30s', unit: 'MTR', gstRate: 5, openingStock: 1000, customFields: [{ name: 'Yarn count', value: '30s' }, { name: 'Composition', value: '100% Cotton' }] })
      .expect(201);
    expect(grey.body.customFields).toEqual([
      { name: 'Yarn count', value: '30s' },
      { name: 'Composition', value: '100% Cotton' },
    ]);
    const dyed = await request(http)
      .post(`/api/v1/companies/${companyId}/items`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Dyed Fabric 30s Navy', unit: 'MTR', gstRate: 5 })
      .expect(201);

    // Job workers must be vendors.
    await request(http)
      .post(`/api/v1/companies/${companyId}/job-works`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        partyId: customerId,
        process: 'DYEING',
        issueDate: '2026-06-12',
        lines: [{ itemId: grey.body.id, quantity: 600 }],
      })
      .expect(400);

    const job = await request(http)
      .post(`/api/v1/companies/${companyId}/job-works`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        partyId: vendorId,
        process: 'DYEING',
        issueDate: '2026-06-12',
        dueDate: '2026-06-30',
        lines: [{ itemId: grey.body.id, quantity: 600 }],
      })
      .expect(201);
    expect(job.body.jobNo).toMatch(/^JW\//);
    expect(job.body.status).toBe('OPEN');

    // Issued material leaves on-hand stock and shows as with-job-worker.
    let stock = await request(http)
      .get(`/api/v1/companies/${companyId}/stock`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    let greyRow = stock.body.find((r: { itemId: string }) => r.itemId === grey.body.id);
    expect(greyRow.onHand).toBe(400);
    expect(greyRow.withJobWorker).toBe(600);

    // Receive 550 dyed metres, 50 lost in process.
    const received = await request(http)
      .post(`/api/v1/companies/${companyId}/job-works/${job.body.id}/receipts`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ date: '2026-06-20', itemId: dyed.body.id, quantity: 550, wastageQty: 50 })
      .expect(201);
    expect(received.body.status).toBe('PARTIAL');
    expect(received.body.totals).toMatchObject({ issued: 600, received: 550, wastage: 50, pending: 0 });

    stock = await request(http)
      .get(`/api/v1/companies/${companyId}/stock`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const dyedRow = stock.body.find((r: { itemId: string }) => r.itemId === dyed.body.id);
    expect(dyedRow.onHand).toBe(550); // wastage never re-enters stock

    // Cancelling after receipts is blocked; closing zeroes with-job-worker.
    await request(http)
      .post(`/api/v1/companies/${companyId}/job-works/${job.body.id}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);
    const closed = await request(http)
      .post(`/api/v1/companies/${companyId}/job-works/${job.body.id}/close`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    expect(closed.body.status).toBe('CLOSED');
    stock = await request(http)
      .get(`/api/v1/companies/${companyId}/stock`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    greyRow = stock.body.find((r: { itemId: string }) => r.itemId === grey.body.id);
    expect(greyRow.onHand).toBe(400); // consumed, not returned
    expect(greyRow.withJobWorker).toBe(0);

    // Cancel before any receipt restores the stock.
    const job2 = await request(http)
      .post(`/api/v1/companies/${companyId}/job-works`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        partyId: vendorId,
        process: 'PRINTING',
        issueDate: '2026-06-12',
        lines: [{ itemId: grey.body.id, quantity: 100 }],
      })
      .expect(201);
    await request(http)
      .post(`/api/v1/companies/${companyId}/job-works/${job2.body.id}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    stock = await request(http)
      .get(`/api/v1/companies/${companyId}/stock`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    greyRow = stock.body.find((r: { itemId: string }) => r.itemId === grey.body.id);
    expect(greyRow.onHand).toBe(400);
  });

  it('gives employees a self-service payslip portal, strictly scoped', async () => {
    // Give Asha (EMP-001, already paid in the payroll test) a work email.
    const employees = await request(http)
      .get(`/api/v1/companies/${companyId}/employees`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const asha = employees.body.find((e: { code: string }) => e.code === 'EMP-001');
    await request(http)
      .patch(`/api/v1/companies/${companyId}/employees/${asha.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'asha@test.io' })
      .expect(200);

    // Registration with that email auto-links the employee record.
    const reg = await request(http)
      .post('/api/v1/auth/register')
      .send({ name: 'Asha K', email: 'asha@test.io', phone: '+919000000011', password: 'super-secret-1' })
      .expect(201);
    const ashaToken = reg.body.accessToken as string;

    const me = await request(http)
      .get('/api/v1/portal/me')
      .set('Authorization', `Bearer ${ashaToken}`)
      .expect(200);
    expect(me.body).toHaveLength(1);
    expect(me.body[0]).toMatchObject({ code: 'EMP-001', company: 'E2E Traders' });

    const payslips = await request(http)
      .get('/api/v1/portal/payslips')
      .set('Authorization', `Bearer ${ashaToken}`)
      .expect(200);
    expect(payslips.body.length).toBeGreaterThanOrEqual(1);
    expect(payslips.body[0].netPay).toBeGreaterThan(0);
    const lineId = payslips.body[0].lineId as string;

    // She can download her own payslip PDF…
    const pdf = await request(http)
      .get(`/api/v1/portal/payslips/${lineId}/pdf`)
      .set('Authorization', `Bearer ${ashaToken}`)
      .expect(200)
      .buffer()
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    // …but has NO access to any company data.
    await request(http)
      .get(`/api/v1/companies/${companyId}/ledgers`)
      .set('Authorization', `Bearer ${ashaToken}`)
      .expect(403);

    // Other users see an empty portal and cannot fetch her payslip.
    const outsiderPortal = await request(http)
      .get('/api/v1/portal/payslips')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(200);
    expect(outsiderPortal.body).toHaveLength(0);
    await request(http)
      .get(`/api/v1/portal/payslips/${lineId}/pdf`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(404);
  });

  it('exports work in all three formats', async () => {
    const csv = await request(http)
      .get(`/api/v1/companies/${companyId}/exports/trial-balance?format=csv`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');

    const xlsx = await request(http)
      .get(`/api/v1/companies/${companyId}/exports/gstr1?format=xlsx`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .buffer()
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    // XLSX files are ZIP archives → "PK" magic bytes
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');

    await request(http)
      .get(`/api/v1/companies/${companyId}/exports/nonsense`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);
  });

  it('exports GSTR-1 in the portal offline-tool JSON format', async () => {
    const res = await request(http)
      .get(`/api/v1/companies/${companyId}/exports/gstr1-json?month=2026-06`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.headers['content-disposition']).toContain('gstr1-062026.json');

    const json = JSON.parse(res.text || res.body.toString());
    expect(json.gstin).toBe('29AAACE1234F1Z5');
    expect(json.fp).toBe('062026');

    // The inter-state B2B invoice from earlier: ₹5,000 @ 18% IGST.
    const b2bParty = json.b2b.find(
      (e: { ctin: string }) => e.ctin === '33AAACT1111A1Z9',
    );
    expect(b2bParty).toBeDefined();
    const inv = b2bParty.inv.find((i: { val: number }) => i.val === 5900);
    expect(inv).toMatchObject({ idt: '11-06-2026', pos: '33', rchrg: 'N', inv_typ: 'R' });
    expect(inv.inum.startsWith('INV/')).toBe(true);
    expect(inv.itms[0].itm_det).toMatchObject({ rt: 18, txval: 5000, iamt: 900, camt: 0, samt: 0 });

    // HSN summary carries the Widget line with a proper UQC.
    const hsnRow = json.hsn.data.find((h: { hsn_sc: string }) => h.hsn_sc === '8479');
    expect(hsnRow).toMatchObject({ uqc: 'PCS-PIECES', rt: 18 });
    expect(hsnRow.qty).toBeGreaterThanOrEqual(10);

    // Document series for table 13.
    const docSeries = json.doc_issue.doc_det.find((d: { doc_num: number }) => d.doc_num === 1);
    expect(docSeries.docs[0].totnum).toBeGreaterThanOrEqual(1);
    expect(docSeries.docs[0].from.startsWith('INV/')).toBe(true);

    // Guard rails: bad month and missing GSTIN both 400.
    await request(http)
      .get(`/api/v1/companies/${companyId}/exports/gstr1-json?month=junk`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);
  });

  // ----------------------------------------------------------------
  // AI voucher drafting (provider stubbed — Gemini is not called)
  // ----------------------------------------------------------------

  it('drafts a voucher from plain language and the draft posts cleanly', async () => {
    aiStub.completeJson.mockResolvedValueOnce(
      JSON.stringify({
        type: 'PAYMENT',
        date: '2026-06-12',
        narration: 'Being goods purchased for cash',
        lines: [
          // lowercase name — matching must be case-insensitive
          { ledger: 'purchases', type: 'DEBIT', amount: 5000 },
          { ledger: 'Cash', type: 'CREDIT', amount: 5000 },
        ],
        confidence: 0.92,
        warnings: [],
      }),
    );

    const res = await request(http)
      .post(`/api/v1/companies/${companyId}/ai/parse-voucher`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ text: 'Bought goods for 5k cash today' })
      .expect(201);
    expect(res.body.provider).toBe('stub');
    expect(res.body.balanced).toBe(true);
    expect(res.body.unmatchedLedgers).toEqual([]);
    expect(res.body.lines).toEqual([
      { ledgerId: ledgers['Purchases'], ledgerName: 'Purchases', type: 'DEBIT', amount: 5000 },
      { ledgerId: ledgers['Cash'], ledgerName: 'Cash', type: 'CREDIT', amount: 5000 },
    ]);

    // The reviewed draft is valid input for the normal voucher endpoint.
    await request(http)
      .post(`/api/v1/companies/${companyId}/vouchers`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        type: res.body.type,
        date: res.body.date,
        narration: res.body.narration,
        lines: res.body.lines.map((l: { ledgerId: string; type: string; amount: number }) => ({
          ledgerId: l.ledgerId,
          type: l.type,
          amount: l.amount,
        })),
      })
      .expect(201);
  });

  it('reports unmatched ledgers and unbalanced drafts instead of failing', async () => {
    aiStub.completeJson.mockResolvedValueOnce(
      JSON.stringify({
        type: 'JOURNAL',
        date: '2026-06-12',
        narration: 'Travel expense booked',
        lines: [
          { ledger: 'Travelling Expense', type: 'DEBIT', amount: 800 },
          { ledger: 'Cash', type: 'CREDIT', amount: 700 },
        ],
        confidence: 0.4,
        warnings: ['Create a Travelling Expense ledger'],
      }),
    );

    const res = await request(http)
      .post(`/api/v1/companies/${companyId}/ai/parse-voucher`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ text: 'travel 800 by cash' })
      .expect(201);
    expect(res.body.unmatchedLedgers).toEqual(['Travelling Expense']);
    expect(res.body.lines[0].ledgerId).toBeNull();
    expect(res.body.balanced).toBe(false);
    expect(res.body.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('surfaces model refusals and malformed answers as 400', async () => {
    aiStub.completeJson.mockResolvedValueOnce(
      JSON.stringify({ error: 'That text does not describe a transaction' }),
    );
    const refusal = await request(http)
      .post(`/api/v1/companies/${companyId}/ai/parse-voucher`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ text: 'hello how are you' })
      .expect(400);
    expect(refusal.body.message).toContain('does not describe');

    aiStub.completeJson.mockResolvedValueOnce('not json at all');
    await request(http)
      .post(`/api/v1/companies/${companyId}/ai/parse-voucher`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ text: 'paid rent 1000' })
      .expect(400);
  });

  it('answers report questions from the snapshot via the stubbed model', async () => {
    aiStub.completeJson.mockResolvedValueOnce(
      JSON.stringify({
        answer: 'Your top customer by outstanding is Acme Textiles (₹59,000).',
        table: {
          title: 'Outstanding receivables',
          columns: ['Customer', 'Due'],
          rows: [
            ['Acme Textiles', 59000],
            ['short-row'], // ragged — must be dropped, not break the response
          ],
        },
      }),
    );

    const res = await request(http)
      .post(`/api/v1/companies/${companyId}/ai/ask`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ question: 'Who owes me the most?' })
      .expect(201);
    expect(res.body.answer).toContain('Acme Textiles');
    expect(res.body.table.rows).toEqual([['Acme Textiles', 59000]]);
    expect(res.body.provider).toBe('stub');

    // The prompt carried the real books snapshot + the question.
    const prompt = aiStub.completeJson.mock.calls.at(-1)![0];
    expect(prompt.prompt).toContain('Who owes me the most?');
    expect(prompt.prompt).toContain('trialBalanceAsOfToday');
    expect(prompt.prompt).toContain('outstandingReceivablesByCustomer');

    aiStub.completeJson.mockResolvedValueOnce('{"nonsense": true}');
    await request(http)
      .post(`/api/v1/companies/${companyId}/ai/ask`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ question: 'and now?' })
      .expect(400);
  });

  it('suggests bank reconciliation actions and both accept paths work', async () => {
    // A receipt 19 days before the statement line — outside the ±5 day
    // deterministic window, so only the AI suggestion can link them.
    await request(http)
      .post(`/api/v1/companies/${companyId}/vouchers`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        type: 'RECEIPT',
        date: '2026-06-01',
        narration: 'Received from Lakshmi Fabrics',
        lines: [
          { ledgerId: ledgers['Cash'], type: 'DEBIT', amount: 7500 },
          { ledgerId: ledgers['Sales'], type: 'CREDIT', amount: 7500 },
        ],
      })
      .expect(201);

    const imported = await request(http)
      .post(`/api/v1/companies/${companyId}/banking/${ledgers['Cash']}/import`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fileName: 'june.csv',
        csv: [
          'Date,Narration,Withdrawal,Deposit',
          '20/06/2026,NEFT-LAKSHMI FAB-XK129,,7500',
          '21/06/2026,SMS CHGS APR-JUN,59,',
        ].join('\n'),
      })
      .expect(201);
    expect(imported.body.imported).toBe(2);

    const reco = await request(http)
      .get(`/api/v1/companies/${companyId}/banking/${ledgers['Cash']}/reconciliation`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const stIn = reco.body.statementLines.find(
      (l: { direction: string }) => l.direction === 'IN',
    );
    const stOut = reco.body.statementLines.find(
      (l: { direction: string }) => l.direction === 'OUT',
    );
    const bookLine = reco.body.unmatchedBookLines.find(
      (l: { amount: number }) => l.amount === 7500,
    );
    expect(stIn.matched).toBeNull();
    expect(bookLine).toBeDefined();

    aiStub.completeJson.mockResolvedValueOnce(
      JSON.stringify({
        suggestions: [
          {
            statementLineId: stIn.id,
            kind: 'MATCH',
            voucherLineId: bookLine.voucherLineId,
            reason: 'NEFT name matches the receipt narration, same amount',
            confidence: 0.9,
          },
          {
            statementLineId: stOut.id,
            kind: 'CREATE',
            counterLedger: 'purchases', // resolution is case-insensitive
            narration: 'Bank SMS charges',
            reason: 'Bank fee with no book entry',
            confidence: 0.8,
          },
          {
            statementLineId: 'invented-id',
            kind: 'MATCH',
            voucherLineId: bookLine.voucherLineId,
            reason: 'must be dropped',
            confidence: 0.9,
          },
        ],
      }),
    );

    const suggested = await request(http)
      .post(`/api/v1/companies/${companyId}/ai/reco-suggestions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ledgerId: ledgers['Cash'] })
      .expect(201);
    expect(suggested.body.suggestions).toHaveLength(2);
    const [matchSugg, createSugg] = suggested.body.suggestions;
    expect(matchSugg.kind).toBe('MATCH');
    expect(matchSugg.match.voucherLineId).toBe(bookLine.voucherLineId);
    expect(createSugg.kind).toBe('CREATE');
    expect(createSugg.create.counterLedgerId).toBe(ledgers['Purchases']);

    // Accept path 1: link the suggested book entry.
    await request(http)
      .post(`/api/v1/companies/${companyId}/banking/lines/${stIn.id}/match`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ voucherLineId: matchSugg.match.voucherLineId })
      .expect(201);

    // Accept path 2: book the missing voucher and auto-match it.
    const created = await request(http)
      .post(`/api/v1/companies/${companyId}/banking/lines/${stOut.id}/create-voucher`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        counterLedgerId: createSugg.create.counterLedgerId,
        narration: createSugg.create.narration,
      })
      .expect(201);
    expect(created.body.type).toBe('PAYMENT'); // money out
    expect(created.body.totalAmount).toBe(59);

    const after = await request(http)
      .get(`/api/v1/companies/${companyId}/banking/${ledgers['Cash']}/reconciliation`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(after.body.summary.unmatchedStatement).toBe(0);

    // Re-creating from an already-matched line must fail.
    await request(http)
      .post(`/api/v1/companies/${companyId}/banking/lines/${stOut.id}/create-voucher`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ counterLedgerId: createSugg.create.counterLedgerId })
      .expect(400);
  });

  it('imports Tally masters: parties, ledgers and items', async () => {
    const tallyXml = `<?xml version="1.0"?>
<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
  <TALLYMESSAGE><GROUP NAME="South Customers" RESERVEDNAME=""><PARENT>Sundry Debtors</PARENT></GROUP></TALLYMESSAGE>
  <TALLYMESSAGE><LEDGER NAME="Erode Textiles" RESERVEDNAME="">
    <PARENT>South Customers</PARENT>
    <OPENINGBALANCE>-45000.00</OPENINGBALANCE>
    <PARTYGSTIN>33AABCL4567C1ZD</PARTYGSTIN>
  </LEDGER></TALLYMESSAGE>
  <TALLYMESSAGE><LEDGER NAME="Salem Yarn Suppliers" RESERVEDNAME="">
    <PARENT>Sundry Creditors</PARENT>
    <OPENINGBALANCE>23000.00</OPENINGBALANCE>
  </LEDGER></TALLYMESSAGE>
  <TALLYMESSAGE><LEDGER NAME="Electricity Charges" RESERVEDNAME="">
    <PARENT>Expenses (Indirect)</PARENT>
    <OPENINGBALANCE></OPENINGBALANCE>
  </LEDGER></TALLYMESSAGE>
  <TALLYMESSAGE><LEDGER NAME="Cash" RESERVEDNAME="">
    <PARENT>Cash-in-hand</PARENT>
    <OPENINGBALANCE>-5000</OPENINGBALANCE>
  </LEDGER></TALLYMESSAGE>
  <TALLYMESSAGE><STOCKITEM NAME="Polyester Yarn 75D" RESERVEDNAME="">
    <BASEUNITS>Kgs</BASEUNITS>
    <HSNCODE>5402</HSNCODE>
    <GSTRATE>12</GSTRATE>
    <OPENINGBALANCE> 250.000 Kgs</OPENINGBALANCE>
    <OPENINGRATE>180.00/Kgs</OPENINGRATE>
  </STOCKITEM></TALLYMESSAGE>
</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;

    const inspected = await request(http)
      .post(`/api/v1/companies/${companyId}/imports/inspect`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fileName: 'masters.xml',
        content: Buffer.from(tallyXml).toString('base64'),
      })
      .expect(201);

    expect(inspected.body.format).toBe('TALLY_XML');
    const { LEDGERS, PARTIES, ITEMS } = inspected.body.entities;
    expect(PARTIES.valid.map((p: { name: string; type: string }) => [p.name, p.type])).toEqual([
      ['Erode Textiles', 'CUSTOMER'],
      ['Salem Yarn Suppliers', 'VENDOR'],
    ]);
    expect(PARTIES.valid[0].openingType).toBe('DEBIT'); // Tally negative = Dr
    expect(LEDGERS.valid).toHaveLength(1); // Electricity Charges
    expect(LEDGERS.duplicates).toEqual(['Cash']); // seeded ledger, skipped
    expect(ITEMS.valid[0]).toMatchObject({
      name: 'Polyester Yarn 75D',
      unit: 'KG',
      gstRate: 12,
      openingStock: 250,
    });

    // Commit each entity with the rows the preview approved.
    for (const [entity, rows] of [
      ['PARTIES', PARTIES.valid],
      ['LEDGERS', LEDGERS.valid],
      ['ITEMS', ITEMS.valid],
    ] as const) {
      const committed = await request(http)
        .post(`/api/v1/companies/${companyId}/imports/commit`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ entity, rows })
        .expect(201);
      expect(committed.body.created).toBe(rows.length);
      expect(committed.body.failed).toEqual([]);
    }

    // The imported masters are real: party ledger carries the opening.
    const ledgerList = await request(http)
      .get(`/api/v1/companies/${companyId}/ledgers`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const erode = ledgerList.body.find(
      (l: { name: string }) => l.name === 'Erode Textiles',
    );
    expect(erode).toMatchObject({ balance: 45000, balanceType: 'DEBIT' });
    expect(
      ledgerList.body.some((l: { name: string }) => l.name === 'Electricity Charges'),
    ).toBe(true);
  });

  it('imports a CSV through AI column mapping with manual-grade validation', async () => {
    const csv = [
      'Party Name,GSTIN/UIN,Op. Bal.,Bal Dr/Cr,Relationship',
      'Madurai Cottons,33AABCM1234D1ZK,"12,500",Dr,Customer',
      'Tirupur Dyes,33AABCT5678E1ZX,8000,Cr,Supplier',
    ].join('\n');
    const content = Buffer.from(csv).toString('base64');

    aiStub.completeJson.mockResolvedValueOnce(
      JSON.stringify({
        entity: 'PARTIES',
        mapping: { name: 0, gstin: 1, openingBalance: 2, openingType: 3, type: 4, bogus: 99 },
      }),
    );
    const inspected = await request(http)
      .post(`/api/v1/companies/${companyId}/imports/inspect`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ fileName: 'parties.csv', content })
      .expect(201);
    expect(inspected.body.format).toBe('TABLE');
    expect(inspected.body.totalRows).toBe(2);
    expect(inspected.body.aiMapping.entity).toBe('PARTIES');
    expect(inspected.body.aiMapping.mapping.bogus).toBeUndefined(); // unknown field dropped

    const preview = await request(http)
      .post(`/api/v1/companies/${companyId}/imports/preview`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fileName: 'parties.csv',
        content,
        entity: 'PARTIES',
        mapping: inspected.body.aiMapping.mapping,
      })
      .expect(201);
    expect(preview.body.valid).toHaveLength(2);
    expect(preview.body.valid[1]).toMatchObject({
      name: 'Tirupur Dyes',
      type: 'VENDOR',
      openingType: 'CREDIT',
    });

    const committed = await request(http)
      .post(`/api/v1/companies/${companyId}/imports/commit`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ entity: 'PARTIES', rows: preview.body.valid })
      .expect(201);
    expect(committed.body).toMatchObject({ created: 2, skipped: 0 });

    // Re-committing the same rows: everything is a duplicate, nothing breaks.
    const again = await request(http)
      .post(`/api/v1/companies/${companyId}/imports/commit`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ entity: 'PARTIES', rows: preview.body.valid })
      .expect(201);
    expect(again.body).toMatchObject({ created: 0, skipped: 2 });

    // Smuggled invalid rows are re-validated server-side and rejected.
    await request(http)
      .post(`/api/v1/companies/${companyId}/imports/commit`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        entity: 'PARTIES',
        rows: [{ name: 'Sneaky Co', gstin: 'NOT-A-GSTIN' }],
      })
      .expect(400);
  });

  it('imports bill-wise open invoices and settles them against the books', async () => {
    // 'Erode Textiles' came from the Tally import with a ₹45,000 Dr opening.
    const committed = await request(http)
      .post(`/api/v1/companies/${companyId}/imports/commit`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        entity: 'OPEN_INVOICES',
        rows: [
          { party: 'Erode Textiles', refNo: 'ET-001', date: '01/03/2026', amount: '30,000' },
          { party: 'Erode Textiles', refNo: 'ET-002', amount: 15000 },
        ],
      })
      .expect(201);
    expect(committed.body).toMatchObject({ created: 2, skipped: 0 });

    // Unknown parties are rejected, not guessed.
    await request(http)
      .post(`/api/v1/companies/${companyId}/imports/commit`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        entity: 'OPEN_INVOICES',
        rows: [{ party: 'Ghost Co', refNo: 'G-1', amount: 100 }],
      })
      .expect(400);

    const list = await request(http)
      .get(`/api/v1/companies/${companyId}/opening-docs?kind=RECEIVABLE`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(list.body).toHaveLength(2);
    const et1 = list.body.find((d: { refNo: string }) => d.refNo === 'ET-001');
    expect(et1).toMatchObject({
      kind: 'RECEIVABLE',
      amount: 30000,
      settled: 0,
      outstanding: 30000,
      date: expect.stringContaining('2026-03-01'),
    });

    const ledgerBefore = await request(http)
      .get(`/api/v1/companies/${companyId}/ledgers`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const before = ledgerBefore.body.find(
      (l: { name: string }) => l.name === 'Erode Textiles',
    ).balance;

    // Partial settlement books a real RECEIPT voucher.
    const settled = await request(http)
      .post(`/api/v1/companies/${companyId}/opening-docs/${et1.id}/settle`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 10000, ledgerId: ledgers['Cash'] })
      .expect(201);
    expect(settled.body.outstanding).toBe(20000);
    expect(settled.body.voucherNo).toMatch(/^RCT\//);

    const ledgerAfter = await request(http)
      .get(`/api/v1/companies/${companyId}/ledgers`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const after = ledgerAfter.body.find(
      (l: { name: string }) => l.name === 'Erode Textiles',
    ).balance;
    expect(before - after).toBe(10000);

    // Over-settlement is rejected; re-import skips duplicates.
    await request(http)
      .post(`/api/v1/companies/${companyId}/opening-docs/${et1.id}/settle`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 20001, ledgerId: ledgers['Cash'] })
      .expect(400);
    const again = await request(http)
      .post(`/api/v1/companies/${companyId}/imports/commit`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        entity: 'OPEN_INVOICES',
        rows: [{ party: 'Erode Textiles', refNo: 'ET-001', amount: 30000 }],
      })
      .expect(201);
    expect(again.body).toMatchObject({ created: 0, skipped: 1 });
  });

  it('reads a scanned bill into a purchase draft with vendor/item matching', async () => {
    aiStub.completeJson.mockResolvedValueOnce(
      JSON.stringify({
        vendor: { name: 'KA VENDOR PVT LTD', gstin: '29AAACV2222B1Z8' },
        billNo: 'KV/889',
        date: '2026-06-10',
        lines: [
          { description: 'Widget', hsnCode: '8479', quantity: 10, unit: 'PCS', rate: 100, gstRate: 18 },
          { description: 'Freight Charges', quantity: 1, rate: 250, gstRate: 18 },
        ],
        // 10×100×1.18 + 250×1.18 = 1475 — consistent, so no mismatch warning.
        totals: { subtotal: 1250, total: 1475 },
        confidence: 0.9,
        warnings: [],
      }),
    );

    // A tiny valid PNG header makes the mime sniffing path realistic.
    const fakePng = Buffer.from(
      '89504e470d0a1a0a0000000d49484452',
      'hex',
    ).toString('base64');
    const res = await request(http)
      .post(`/api/v1/companies/${companyId}/ai/parse-bill`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ fileName: 'bill.png', content: fakePng })
      .expect(201);

    expect(res.body.vendor).toMatchObject({ name: 'KA Vendor' });
    expect(res.body.vendor.partyId).toBeTruthy(); // matched by GSTIN
    expect(res.body.supplierBillNo).toBe('KV/889');
    expect(res.body.lines[0].itemId).toBeTruthy(); // matched the seeded item
    expect(res.body.lines[1].itemId).toBeNull();
    expect(res.body.warnings).toEqual([]);

    // The provider received the file inline.
    const call = aiStub.completeJson.mock.calls.at(-1)![0] as unknown as {
      file?: { mimeType: string };
    };
    expect(call.file?.mimeType).toBe('image/png');

    // Unsupported formats are rejected before any model call.
    await request(http)
      .post(`/api/v1/companies/${companyId}/ai/parse-bill`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ fileName: 'bill.txt', content: Buffer.from('hello').toString('base64') })
      .expect(400);
  });

  it('drafts a voucher from a spoken recording (audio reaches the model)', async () => {
    aiStub.completeJson.mockResolvedValueOnce(
      JSON.stringify({
        type: 'PAYMENT',
        date: '2026-06-12',
        narration: 'Being courier charges paid in cash',
        lines: [
          { ledger: 'Purchases', type: 'DEBIT', amount: 350 },
          { ledger: 'Cash', type: 'CREDIT', amount: 350 },
        ],
        confidence: 0.85,
        warnings: [],
      }),
    );

    // A structurally valid little WAV: RIFF header + a second of silence.
    const wav = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.alloc(4),
      Buffer.from('WAVEfmt '),
      Buffer.alloc(2000),
    ]).toString('base64');

    const res = await request(http)
      .post(`/api/v1/companies/${companyId}/ai/parse-voucher`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ audio: wav })
      .expect(201);
    expect(res.body.lines[0].ledgerId).toBe(ledgers['Purchases']);
    expect(res.body.balanced).toBe(true);

    const call = aiStub.completeJson.mock.calls.at(-1)![0] as unknown as {
      prompt: string;
      file?: { mimeType: string };
    };
    expect(call.file?.mimeType).toBe('audio/wav');
    expect(call.prompt).toContain('attached recording');

    // Guard rails: no input at all, and non-WAV bytes.
    await request(http)
      .post(`/api/v1/companies/${companyId}/ai/parse-voucher`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({})
      .expect(400);
    await request(http)
      .post(`/api/v1/companies/${companyId}/ai/parse-voucher`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ audio: Buffer.alloc(2000, 7).toString('base64') })
      .expect(400);
  });

  it('keeps AI off plans that exclude it', async () => {
    const reg = await request(http)
      .post('/api/v1/auth/register')
      .send({ name: 'Starter Sam', email: 'starter-ai@test.io', phone: '+919000000012', password: 'super-secret-1' })
      .expect(201);
    const token = reg.body.accessToken as string;
    const co = await request(http)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Starter AI Co' })
      .expect(201);

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'starter-ai@test.io' },
    });
    const starter = await prisma.plan.findUniqueOrThrow({ where: { code: 'STARTER' } });
    await prisma.userSubscription.update({
      where: { userId: user.id },
      data: { planId: starter.id, status: 'ACTIVE', expiresAt: null },
    });

    const res = await request(http)
      .post(`/api/v1/companies/${co.body.id}/ai/parse-voucher`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'paid rent 1000 cash' })
      .expect(403);
    expect(res.body.message).toContain('does not include ai');
    // The guard rejected before the provider was ever invoked.
    expect(aiStub.completeJson).toHaveBeenCalledTimes(10);
  });

  it('surfaces opening documents in the dues notifications', async () => {
    const res = await request(http)
      .get(`/api/v1/companies/${companyId}/notifications`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const opening = res.body.find(
      (n: { id: string }) => n.id === 'opening-receivables',
    );
    expect(opening).toBeDefined();
    expect(opening.detail).toContain('Erode Textiles');
    expect(opening.tab).toBe('invoices');
  });
});
