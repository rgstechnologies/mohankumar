import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EntryType,
  PartyType,
  VoucherStatus,
} from '@prisma/client';
import { displayVoucherNo } from '../accounting/fiscal-year.util';
import { PrismaService } from '../prisma/prisma.service';
import { PartyBalanceService } from '../balances/party-balance.service';
import { ReportsService } from '../reports/reports.service';
import { AI_PROVIDER, type AiProvider } from './ai-provider.interface';
import {
  billAnswerSchema,
  buildBillDraft,
  detectMime,
} from './bill-extract';
import { normalizeTable, reportAnswerSchema } from './report-answer';
import {
  recoAnswerSchema,
  validateSuggestions,
  type BookLineLite,
  type StatementLineLite,
} from './reco-suggestions';
import {
  AI_VOUCHER_TYPES,
  buildDraft,
  extractJson,
  modelAnswerSchema,
  type LedgerCatalogueEntry,
  type VoucherDraft,
} from './voucher-draft';

const SYSTEM_PROMPT = `You are the accounting assistant inside RGS, an Indian double-entry accounting system.
The user describes a business transaction in plain language — English, Tamil, or a mix.
Convert it into ONE balanced voucher and answer with a single JSON object, nothing else:

{
  "type": "JOURNAL" | "PAYMENT" | "RECEIPT" | "CONTRA",
  "date": "YYYY-MM-DD",
  "narration": "one factual sentence in the language the user wrote in",
  "lines": [{ "ledger": "<name from the LEDGERS list>", "type": "DEBIT" | "CREDIT", "amount": <positive rupees> }],
  "confidence": <0..1>,
  "warnings": ["<short note when something needs the user's attention>"]
}

Rules:
- Indian double entry: debit what comes in / expenses, credit what goes out / incomes. Total debits MUST equal total credits.
- type: PAYMENT when cash/bank pays out, RECEIPT when cash/bank receives, CONTRA for cash↔bank moves, JOURNAL otherwise.
- Use ledger names ONLY from the LEDGERS list. If nothing fits, use the most natural ledger name (e.g. "Office Rent") and add a warning that it must be created.
- Amounts: interpret Indian notation — "1.5 lakh" = 150000, "2 crore" = 20000000, "5k" = 5000. Never invent an amount that is not in the text; if an amount is missing, use 1 as a placeholder, set confidence below 0.4 and add a warning telling the user to fill it in.
- date: resolve relative dates ("yesterday", "நேற்று") against TODAY given in the prompt. No future dates unless the user says so.
- GST: if the text mentions GST on an expense/purchase, split tax to the matching Input CGST/SGST/IGST ledgers when they exist (CGST+SGST for intra-state, IGST for inter-state); otherwise add a warning.
- If the text describes a customer sale or supplier purchase of goods, still draft the voucher but warn that Sales/Purchase invoices should be entered from the Invoices section so stock and GST returns stay correct.
- If the text is not a financial transaction, respond with {"error": "<why, in the user's language>"} instead of the voucher object.`;

const ASK_SYSTEM_PROMPT = `You are the financial analyst inside RGS, an Indian double-entry accounting system.
You receive a snapshot of one company's books (all figures already computed, in rupees) and a question from the business owner — in English, Tamil, or a mix.
Answer with a single JSON object, nothing else:

{
  "answer": "<concise answer, 1-5 sentences, in the language the question was asked in>",
  "table": { "title": "<optional>", "columns": ["..."], "rows": [["...", 123.45]] }
}

Rules:
- Use ONLY the figures in the snapshot. Never invent, extrapolate or estimate numbers that are not derivable from it by simple arithmetic (sums, differences, percentages).
- If the snapshot cannot answer the question, say so plainly and name what is missing. Do not guess.
- Include "table" only when the answer naturally lists more than two rows (top customers, monthly trend, overdue bills). Otherwise omit it.
- Format rupee amounts in the Indian style (e.g. ₹1,50,000) inside "answer"; in table rows keep amounts as plain numbers.
- Receivables = what customers owe us; payables = what we owe suppliers. The snapshot already resolves all debit/credit signs — trust its labels and never flip them.
- Be direct and businesslike. No greetings, no disclaimers.`;

const RECO_SYSTEM_PROMPT = `You are the bank-reconciliation assistant inside RGS, an Indian double-entry accounting system.
You get unmatched BANK STATEMENT lines and unmatched BOOK entries for one bank ledger, plus the company's ledger list.
Statement direction: IN = money into the bank, OUT = money out. A statement line can only match a book entry with the SAME direction.
Exact amount+date matches were already taken by a deterministic pass — you handle what it could not.

Answer with a single JSON object, nothing else:
{
  "suggestions": [
    { "statementLineId": "<id from the statement list>",
      "kind": "MATCH",
      "voucherLineId": "<id from the book list>",
      "reason": "<one short sentence: why they correspond>",
      "confidence": <0..1> },
    { "statementLineId": "<id>",
      "kind": "CREATE",
      "counterLedger": "<ledger name, prefer one from LEDGERS>",
      "narration": "<short narration for the new voucher>",
      "reason": "<why this entry is missing from the books>",
      "confidence": <0..1> }
  ]
}

Rules:
- MATCH when description/narration, amount (allow small differences like bank charges) and dates make the pairing likely. Use each statement line and each book entry at most once.
- CREATE when the statement line clearly has no book entry yet: bank charges, interest, customer receipts (counter ledger = the customer's ledger), supplier payments, GST/tax debits.
- Statement descriptions are bank-mangled (NEFT/IMPS/UPI codes, truncated names) — match them to party ledgers by the name fragments.
- Only suggest what you are reasonably sure of; skip lines you cannot explain. An empty suggestions array is a valid answer.
- Never invent ids. statementLineId/voucherLineId must come from the lists.`;

const sanitize = (text: string) => text.replace(/\s+/g, ' ').trim();

const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // ~80s of 16kHz mono WAV

/** Validates spoken input and returns a Gemini audio file part. */
function audioPart(audioBase64: string): { mimeType: string; data: string } {
  const bytes = Buffer.from(audioBase64, 'base64');
  if (bytes.length < 1000) {
    throw new BadRequestException('The recording is too short — try again');
  }
  if (bytes.length > MAX_AUDIO_BYTES) {
    throw new BadRequestException('The recording is too long — keep it under a minute');
  }
  if (bytes.subarray(0, 4).toString() !== 'RIFF') {
    throw new BadRequestException('Audio must be a WAV recording');
  }
  return { mimeType: 'audio/wav', data: audioBase64 };
}

const SPOKEN_NOTE =
  'The user SPOKE this (English, Tamil, or mixed). First understand the speech accurately, then proceed exactly as if it had been typed.';

@Injectable()
export class AiService {
  private readonly logger = new Logger('AiService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly balances: PartyBalanceService,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
  ) {}

  get providerInfo() {
    return { provider: this.provider.name, model: this.provider.model };
  }

  async parseVoucher(
    companyId: string,
    text?: string,
    audioBase64?: string,
  ): Promise<VoucherDraft & { provider: string; model: string }> {
    if (!text && !audioBase64) {
      throw new BadRequestException('Provide the transaction as text or audio');
    }
    const ledgers = await this.prisma.ledger.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true, group: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    const catalogue: LedgerCatalogueEntry[] = ledgers.map((l) => ({
      id: l.id,
      name: l.name,
      groupName: l.group.name,
    }));

    const today = new Date().toISOString().slice(0, 10);
    const prompt = [
      `TODAY: ${today}`,
      `LEDGERS (name — group):`,
      ...catalogue.map((l) => `- ${l.name} — ${l.groupName}`),
      ``,
      audioBase64
        ? `TRANSACTION: in the attached recording. ${SPOKEN_NOTE}`
        : `TRANSACTION: ${sanitize(text ?? '')}`,
    ].join('\n');

    const raw = await this.provider.completeJson({
      system: SYSTEM_PROMPT,
      prompt,
      ...(audioBase64 ? { file: audioPart(audioBase64) } : {}),
    });

    let parsed: unknown;
    try {
      parsed = extractJson(raw);
    } catch {
      this.logger.warn(`Unparseable AI answer: ${raw.slice(0, 300)}`);
      throw new BadRequestException(
        'The AI could not draft a voucher from that text — try rephrasing it',
      );
    }

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'error' in parsed &&
      typeof (parsed as { error: unknown }).error === 'string'
    ) {
      throw new BadRequestException((parsed as { error: string }).error);
    }

    const answer = modelAnswerSchema.safeParse(parsed);
    if (!answer.success) {
      this.logger.warn(
        `AI answer failed schema: ${answer.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')} — raw: ${raw.slice(0, 300)}`,
      );
      throw new BadRequestException(
        'The AI could not draft a voucher from that text — try rephrasing it',
      );
    }
    if (!AI_VOUCHER_TYPES.includes(answer.data.type)) {
      throw new BadRequestException(
        'Only journal, payment, receipt and contra vouchers can be drafted here',
      );
    }

    return {
      ...buildDraft(answer.data, catalogue),
      ...this.providerInfo,
    };
  }

  // -------------------------------------------------------------
  // Report Q&A
  // -------------------------------------------------------------

  /**
   * Outstanding per party, using the SAME strict document-based engine as the
   * rest of the app — each party tracked by its own document type (estimate vs
   * invoice, etc.), never mixed — so AI answers match every other balance view.
   */
  private async partyOutstanding(companyId: string) {
    const [company, parties] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { salesPaymentLink: true, purchasePaymentLink: true },
      }),
      this.prisma.party.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true, type: true, balanceDocType: true },
      }),
    ]);
    const outMap = await this.balances.outstandingByParty(companyId, parties, company);

    const receivables: { party: string; due: number }[] = [];
    const payables: { party: string; due: number }[] = [];
    for (const p of parties) {
      const due = outMap.get(p.id)?.outstanding ?? 0;
      if (due <= 0.005) continue;
      (p.type === PartyType.CUSTOMER ? receivables : payables).push({
        party: p.name,
        due,
      });
    }
    const top = (arr: { party: string; due: number }[]) =>
      arr.sort((a, b) => b.due - a.due).slice(0, 25);

    return { receivables: top(receivables), payables: top(payables) };
  }

  async askReports(companyId: string, question?: string, audioBase64?: string) {
    if (!question && !audioBase64) {
      throw new BadRequestException('Provide the question as text or audio');
    }
    const [company, tb, pl, dashboard, outstanding] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { name: true, gstin: true, fyStartMonth: true },
      }),
      this.reports.trialBalance(companyId),
      this.reports.profitAndLoss(companyId),
      this.reports.dashboard(companyId),
      this.partyOutstanding(companyId),
    ]);

    const snapshot = {
      company: company.name,
      gstin: company.gstin,
      today: new Date().toISOString().slice(0, 10),
      fiscalYearStart: pl.from,
      trialBalanceAsOfToday: tb.rows.map((r) => ({
        ledger: r.ledger,
        group: r.group,
        ...(r.debit ? { debit: r.debit } : { credit: r.credit }),
      })),
      profitAndLossThisFY: {
        income: pl.income,
        expenses: pl.expenses,
        totalIncome: pl.totalIncome,
        totalExpenses: pl.totalExpenses,
        netProfit: pl.netProfit,
      },
      monthlySalesAndPurchases: dashboard.monthly,
      outstandingReceivablesByCustomer: outstanding.receivables,
      outstandingPayablesToSuppliers: outstanding.payables,
      notCovered:
        'per-invoice detail, stock levels, payroll, individual vouchers',
    };

    const raw = await this.provider.completeJson({
      system: ASK_SYSTEM_PROMPT,
      prompt: audioBase64
        ? `SNAPSHOT:\n${JSON.stringify(snapshot)}\n\nQUESTION: in the attached recording. ${SPOKEN_NOTE}`
        : `SNAPSHOT:\n${JSON.stringify(snapshot)}\n\nQUESTION: ${sanitize(question ?? '')}`,
      maxOutputTokens: 8192,
      ...(audioBase64 ? { file: audioPart(audioBase64) } : {}),
    });

    let parsed: unknown;
    try {
      parsed = extractJson(raw);
    } catch {
      this.logger.warn(`Unparseable Q&A answer: ${raw.slice(0, 300)}`);
      throw new BadRequestException(
        'The AI could not answer that — try rephrasing the question',
      );
    }
    const result = reportAnswerSchema.safeParse(parsed);
    if (!result.success) {
      this.logger.warn(
        `Q&A answer failed schema: ${result.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')} — raw: ${raw.slice(0, 300)}`,
      );
      throw new BadRequestException(
        'The AI could not answer that — try rephrasing the question',
      );
    }

    return {
      question: question ? sanitize(question) : '🎤',
      ...normalizeTable(result.data),
      asOf: snapshot.today,
      ...this.providerInfo,
    };
  }

  // -------------------------------------------------------------
  // Bill OCR → purchase draft
  // -------------------------------------------------------------

  async parseBill(companyId: string, fileName: string, contentBase64: string) {
    const mimeType = detectMime(contentBase64, fileName);
    if (!mimeType) {
      throw new BadRequestException(
        'Upload the bill as a JPEG, PNG, WebP or PDF',
      );
    }
    // Gemini's inline limit is ~20MB of request — keep a safe margin.
    if (Buffer.from(contentBase64, 'base64').length > 10 * 1024 * 1024) {
      throw new BadRequestException('The file is larger than 10 MB');
    }

    const [vendors, items] = await Promise.all([
      this.prisma.party.findMany({
        where: { companyId, type: 'VENDOR', isActive: true },
        select: { id: true, name: true, gstin: true },
      }),
      this.prisma.item.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true },
      }),
    ]);

    const system = `You read Indian supplier bills / tax invoices (image or PDF) for RGS, an accounting system.
Extract the bill EXACTLY as printed and answer with a single JSON object, nothing else:
{
  "vendor": { "name": "<the SELLER on the bill, never the buyer>", "gstin": "<seller GSTIN if printed>" },
  "billNo": "<invoice/bill number>",
  "date": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD",
  "lines": [{ "description": "...", "hsnCode": "...", "quantity": <n>, "unit": "...", "rate": <per-unit price BEFORE tax>, "gstRate": <percent>, "amount": <line amount> }],
  "totals": { "subtotal": <n>, "cgst": <n>, "sgst": <n>, "igst": <n>, "total": <grand total> },
  "confidence": <0..1>,
  "warnings": ["<anything unreadable, ambiguous or suspicious>"]
}
Rules:
- Read numbers exactly; never invent values that are not printed. Omit fields you cannot read and mention them in warnings.
- Dates on Indian bills are usually DD/MM/YYYY or DD-MM-YYYY — convert to YYYY-MM-DD.
- rate must be the pre-tax unit price; if only the line amount is printed, rate = amount / quantity.
- gstRate per line: if the bill shows CGST+SGST, gstRate is their SUM (e.g. 2.5%+2.5% → 5).
- If the document is not a bill/invoice, respond {"error": "<why>"}.`;

    const raw = await this.provider.completeJson({
      system,
      prompt: 'Extract this bill.',
      file: { mimeType, data: contentBase64 },
      maxOutputTokens: 8192,
    });

    let parsed: unknown;
    try {
      parsed = extractJson(raw);
    } catch {
      this.logger.warn(`Unparseable bill answer: ${raw.slice(0, 300)}`);
      throw new BadRequestException(
        'Could not read that file as a bill — try a clearer photo or the PDF',
      );
    }
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'error' in parsed &&
      typeof (parsed as { error: unknown }).error === 'string'
    ) {
      throw new BadRequestException((parsed as { error: string }).error);
    }
    const answer = billAnswerSchema.safeParse(parsed);
    if (!answer.success) {
      this.logger.warn(
        `Bill answer failed schema: ${answer.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')} — raw: ${raw.slice(0, 300)}`,
      );
      throw new BadRequestException(
        'Could not read that file as a bill — try a clearer photo or the PDF',
      );
    }

    return {
      ...buildBillDraft(answer.data, vendors, items),
      ...this.providerInfo,
    };
  }

  // -------------------------------------------------------------
  // Import column mapping
  // -------------------------------------------------------------

  /**
   * Maps arbitrary spreadsheet headers onto our import fields. Returns
   * {entity?, mapping: {field: columnIndex}} — callers treat any failure as
   * "no AI mapping" and fall back to manual mapping, so this never throws
   * for model issues, only returns null.
   */
  async mapImportColumns(
    headers: string[],
    sampleRows: string[][],
    fieldsByEntity: Record<string, string[]>,
    entity?: string,
  ): Promise<{ entity: string; mapping: Record<string, number> } | null> {
    const system = `You map spreadsheet columns from someone's old accounting software onto import fields of RGS, an Indian accounting system.
Answer with a single JSON object, nothing else:
{ "entity": "${Object.keys(fieldsByEntity).join('" | "')}", "mapping": { "<fieldName>": <zero-based column index> } }

Rules:
- ${entity ? `The data is for entity ${entity} — map onto its fields only.` : 'First decide which entity the table holds (ledger/account list vs customers/vendors vs stock items), then map.'}
- Map ONLY fields you can identify from the headers or sample values. Omit unknown fields entirely — never guess an index.
- Headers may be in English, Tamil, Hindi or abbreviations (e.g. "Party Name", "GSTIN/UIN", "Op. Bal.", "Bal Dr/Cr", "HSN/SAC", "Qty", "Rate").
- A combined "Dr/Cr" or "Debit/Credit" column maps to openingType; an amount column to openingBalance.`;

    const prompt = [
      `FIELDS BY ENTITY: ${JSON.stringify(fieldsByEntity)}`,
      `HEADERS (index: name): ${JSON.stringify(headers.map((h, i) => `${i}: ${h}`))}`,
      `SAMPLE ROWS:`,
      JSON.stringify(sampleRows.slice(0, 8)),
    ].join('\n');

    try {
      const raw = await this.provider.completeJson({ system, prompt });
      const parsed = extractJson(raw) as {
        entity?: string;
        mapping?: Record<string, unknown>;
      };
      const chosen =
        entity ??
        (typeof parsed.entity === 'string' &&
        fieldsByEntity[parsed.entity.toUpperCase()]
          ? parsed.entity.toUpperCase()
          : null);
      if (!chosen || typeof parsed.mapping !== 'object' || !parsed.mapping) {
        return null;
      }
      const fields = new Set(fieldsByEntity[chosen]);
      const mapping: Record<string, number> = {};
      for (const [field, idx] of Object.entries(parsed.mapping)) {
        if (
          fields.has(field) &&
          typeof idx === 'number' &&
          Number.isInteger(idx) &&
          idx >= 0 &&
          idx < headers.length
        ) {
          mapping[field] = idx;
        }
      }
      return Object.keys(mapping).length > 0 ? { entity: chosen, mapping } : null;
    } catch (error) {
      this.logger.warn(`Import column mapping unavailable: ${String(error)}`);
      return null;
    }
  }

  // -------------------------------------------------------------
  // Bank reconciliation suggestions
  // -------------------------------------------------------------

  async suggestReconciliation(companyId: string, ledgerId: string) {
    const ledger = await this.prisma.ledger.findFirst({
      where: { id: ledgerId, companyId, isActive: true },
      select: { id: true, name: true },
    });
    if (!ledger) throw new NotFoundException('Bank ledger not found');

    const [statementRaw, bookRaw, ledgers] = await Promise.all([
      this.prisma.bankStatementLine.findMany({
        where: { companyId, ledgerId, matchedVoucherLineId: null },
        orderBy: { date: 'desc' },
        take: 40,
      }),
      this.prisma.voucherLine.findMany({
        where: {
          ledgerId,
          bankMatch: null,
          voucher: { status: VoucherStatus.ACTIVE },
        },
        include: {
          voucher: {
            select: {
              type: true,
              voucherNo: true,
              fiscalYear: true,
              date: true,
              narration: true,
            },
          },
        },
        orderBy: { voucher: { date: 'desc' } },
        take: 80,
      }),
      this.prisma.ledger.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true, group: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
    ]);

    const statementLines: StatementLineLite[] = statementRaw.map((l) => ({
      id: l.id,
      date: l.date.toISOString().slice(0, 10),
      description: l.description,
      amount: Number(l.amount),
      type: l.type,
    }));
    const bookLines: BookLineLite[] = bookRaw.map((l) => ({
      voucherLineId: l.id,
      date: l.voucher.date.toISOString().slice(0, 10),
      voucherNo: displayVoucherNo(
        l.voucher.type,
        l.voucher.fiscalYear,
        l.voucher.voucherNo,
      ),
      narration: l.voucher.narration,
      type: l.type,
      amount: Number(l.amount),
    }));
    const catalogue = ledgers.map((l) => ({
      id: l.id,
      name: l.name,
      groupName: l.group.name,
    }));

    if (statementLines.length === 0) {
      return { suggestions: [], ...this.providerInfo };
    }

    const direction = (type: EntryType) =>
      type === EntryType.DEBIT ? 'IN' : 'OUT';
    const prompt = [
      `BANK LEDGER: ${ledger.name}`,
      `TODAY: ${new Date().toISOString().slice(0, 10)}`,
      `UNMATCHED STATEMENT LINES:`,
      JSON.stringify(
        statementLines.map((l) => ({
          id: l.id,
          date: l.date,
          description: l.description,
          amount: l.amount,
          direction: direction(l.type),
        })),
      ),
      `UNMATCHED BOOK ENTRIES:`,
      JSON.stringify(
        bookLines.map((l) => ({
          id: l.voucherLineId,
          date: l.date,
          voucherNo: l.voucherNo,
          narration: l.narration,
          amount: l.amount,
          direction: direction(l.type),
        })),
      ),
      `LEDGERS (name — group):`,
      ...catalogue.map((l) => `- ${l.name} — ${l.groupName}`),
    ].join('\n');

    const raw = await this.provider.completeJson({
      system: RECO_SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: 8192,
    });

    let parsed: unknown;
    try {
      parsed = extractJson(raw);
    } catch {
      this.logger.warn(`Unparseable reco answer: ${raw.slice(0, 300)}`);
      throw new BadRequestException(
        'The AI could not analyse these statement lines — try again',
      );
    }
    const answer = recoAnswerSchema.safeParse(parsed);
    if (!answer.success) {
      this.logger.warn(
        `Reco answer failed schema: ${answer.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')} — raw: ${raw.slice(0, 300)}`,
      );
      throw new BadRequestException(
        'The AI could not analyse these statement lines — try again',
      );
    }

    const suggestions = validateSuggestions(
      answer.data,
      statementLines,
      bookLines,
      catalogue,
      ledgerId,
    );
    return { suggestions, ...this.providerInfo };
  }
}
