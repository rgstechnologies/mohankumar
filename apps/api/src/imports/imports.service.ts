import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { EntryType, PartyType } from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { AiService } from '../ai/ai.service';
import { LicensingService } from '../licensing/licensing.service';
import { PartiesService } from '../parties/parties.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  classifyTallyMasters,
  ENTITY_FIELDS,
  mapTableRows,
  validateItemRows,
  validateLedgerRows,
  validateOpenDocRows,
  validatePartyRows,
  type ColumnMapping,
  type ImportEntity,
  type ItemImportRow,
  type KnownParty,
  type LedgerImportRow,
  type PartyImportRow,
} from './import-rows';
import { looksLikeTallyXml, parseTallyMasters } from './tally-parser';
import { parseCsvTable, parseXlsxTable, type ParsedTable } from './table-parser';

const MAX_ROWS = 2000;
const XLSX_MAGIC = 'UEsDB'; // base64 of "PK\x03\x04"

/** Typed import rows → the loose record shape the validators take. */
const asRaw = (rows: object[]) =>
  rows as Record<string, string | number | undefined>[];

@Injectable()
export class ImportsService {
  private readonly logger = new Logger('Imports');

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly parties: PartiesService,
    private readonly ai: AiService,
    private readonly licensing: LicensingService,
  ) {}

  private async existingSets(companyId: string) {
    const [ledgers, items, groups, parties, openDocs] = await Promise.all([
      this.prisma.ledger.findMany({
        where: { companyId },
        select: { name: true },
      }),
      this.prisma.item.findMany({
        where: { companyId },
        select: { name: true },
      }),
      this.prisma.accountGroup.findMany({
        where: { companyId },
        select: { name: true },
      }),
      this.prisma.party.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true, type: true },
      }),
      this.prisma.openingDocument.findMany({
        where: { companyId },
        select: { kind: true, refNo: true, party: { select: { name: true } } },
      }),
    ]);
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const refKey = (party: string, refNo: string) => `${norm(party)}|${norm(refNo)}`;
    return {
      ledgerNames: new Set(ledgers.map((l) => norm(l.name))),
      itemNames: new Set(items.map((i) => norm(i.name))),
      groupNames: new Set(groups.map((g) => g.name)),
      partiesByName: new Map<string, KnownParty>(
        parties.map((p) => [norm(p.name), { id: p.id, type: p.type }]),
      ),
      openRefs: {
        RECEIVABLE: new Set(
          openDocs
            .filter((d) => d.kind === 'RECEIVABLE')
            .map((d) => refKey(d.party.name, d.refNo)),
        ),
        PAYABLE: new Set(
          openDocs
            .filter((d) => d.kind === 'PAYABLE')
            .map((d) => refKey(d.party.name, d.refNo)),
        ),
      },
    };
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Step 1: detect the file format and return everything the wizard needs.
   * Tally XML → fully classified + validated preview for all three entities.
   * CSV/XLSX → headers + sample + (when the plan allows AI) a column mapping.
   */
  async inspect(
    companyId: string,
    fileName: string,
    contentBase64: string,
    entity?: ImportEntity,
  ) {
    const buffer = Buffer.from(contentBase64, 'base64');
    if (buffer.length === 0) throw new BadRequestException('Empty file');
    if (buffer.length > 25 * 1024 * 1024) {
      throw new BadRequestException('File is larger than 25 MB');
    }

    const isXlsx =
      contentBase64.startsWith(XLSX_MAGIC) ||
      fileName.toLowerCase().endsWith('.xlsx');
    if (!isXlsx) {
      const text = buffer.toString('utf8');
      if (looksLikeTallyXml(text)) {
        return this.inspectTally(companyId, text);
      }
      return this.inspectTable(companyId, parseCsvTable(text), entity);
    }
    return this.inspectTable(companyId, await parseXlsxTable(buffer), entity);
  }

  private async inspectTally(companyId: string, xml: string) {
    const masters = parseTallyMasters(xml);
    if (masters.ledgers.length === 0 && masters.items.length === 0) {
      throw new BadRequestException(
        'No ledgers or stock items found — export Masters from Tally (Gateway → Display → List of Accounts → Export) and upload that file',
      );
    }
    const { ledgerNames, itemNames, groupNames, partiesByName, openRefs } =
      await this.existingSets(companyId);
    const classified = classifyTallyMasters(masters, groupNames);

    const partyValidation = validatePartyRows(
      asRaw(classified.parties),
      ledgerNames,
      'CUSTOMER',
    );
    // Parties in this same file count as resolvable for the bill rows.
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const pendingParties = new Set(
      classified.parties.map((p) => norm(p.name)),
    );

    return {
      format: 'TALLY_XML' as const,
      entities: {
        LEDGERS: {
          ...validateLedgerRows(
            asRaw(classified.ledgers.rows),
            ledgerNames,
            groupNames,
          ),
          unknownGroups: classified.ledgers.unknownGroups,
        },
        PARTIES: partyValidation,
        ITEMS: validateItemRows(asRaw(classified.items), itemNames),
        OPEN_INVOICES: validateOpenDocRows(
          asRaw(classified.openInvoices),
          'RECEIVABLE',
          partiesByName,
          pendingParties,
          openRefs.RECEIVABLE,
          this.today(),
        ),
        OPEN_BILLS: validateOpenDocRows(
          asRaw(classified.openBills),
          'PAYABLE',
          partiesByName,
          pendingParties,
          openRefs.PAYABLE,
          this.today(),
        ),
      },
      groups: [...groupNames],
    };
  }

  private async inspectTable(
    companyId: string,
    table: ParsedTable,
    entity?: ImportEntity,
  ) {
    if (table.rows.length > MAX_ROWS) {
      throw new BadRequestException(
        `The file has ${table.rows.length} rows — import at most ${MAX_ROWS} at a time`,
      );
    }
    const { groupNames } = await this.existingSets(companyId);
    // AI mapping is plan-gated like every AI feature; without it the wizard
    // simply starts with an empty (manual) mapping.
    let ai: Awaited<ReturnType<AiService['mapImportColumns']>> = null;
    try {
      await this.licensing.assertCompanyFeature(companyId, 'ai');
      ai = await this.ai.mapImportColumns(
        table.headers,
        table.rows.slice(0, 8),
        ENTITY_FIELDS,
        entity,
      );
    } catch {
      ai = null;
    }
    return {
      format: 'TABLE' as const,
      headers: table.headers,
      sampleRows: table.rows.slice(0, 8),
      totalRows: table.rows.length,
      fields: ENTITY_FIELDS,
      aiMapping: ai, // null → the UI falls back to manual mapping
      groups: [...groupNames],
    };
  }

  /**
   * Step 2 for tables: apply a (possibly user-corrected) mapping and validate.
   * Shares the exact validation that commit() will re-run.
   */
  async previewTable(
    companyId: string,
    fileName: string,
    contentBase64: string,
    entity: ImportEntity,
    mapping: ColumnMapping,
    defaultPartyType: PartyType = PartyType.CUSTOMER,
  ) {
    const buffer = Buffer.from(contentBase64, 'base64');
    const isXlsx =
      contentBase64.startsWith(XLSX_MAGIC) ||
      fileName.toLowerCase().endsWith('.xlsx');
    const table = isXlsx
      ? await parseXlsxTable(buffer)
      : parseCsvTable(buffer.toString('utf8'));
    if (table.rows.length > MAX_ROWS) {
      throw new BadRequestException(
        `The file has ${table.rows.length} rows — import at most ${MAX_ROWS} at a time`,
      );
    }

    const raw = mapTableRows(entity, table.headers.length, table.rows, mapping);
    const { ledgerNames, itemNames, groupNames, partiesByName, openRefs } =
      await this.existingSets(companyId);
    if (entity === 'LEDGERS') {
      return validateLedgerRows(raw, ledgerNames, groupNames);
    }
    if (entity === 'PARTIES') {
      return validatePartyRows(raw, ledgerNames, defaultPartyType);
    }
    if (entity === 'OPEN_INVOICES' || entity === 'OPEN_BILLS') {
      const kind = entity === 'OPEN_INVOICES' ? 'RECEIVABLE' : 'PAYABLE';
      // Spreadsheets are imported standalone — no pending same-file parties.
      return validateOpenDocRows(
        raw,
        kind,
        partiesByName,
        new Set(),
        openRefs[kind],
        this.today(),
      );
    }
    return validateItemRows(raw, itemNames);
  }

  /**
   * Step 3: create the rows. Rows are exactly what preview returned (the
   * client echoes them back), and everything is re-validated server-side —
   * the client cannot smuggle in rows the preview never approved.
   */
  async commit(
    companyId: string,
    entity: ImportEntity,
    rows: Record<string, string | number | undefined>[],
  ) {
    if (rows.length === 0) throw new BadRequestException('Nothing to import');
    if (rows.length > MAX_ROWS) {
      throw new BadRequestException(`Import at most ${MAX_ROWS} rows at a time`);
    }
    const { ledgerNames, itemNames, groupNames, partiesByName, openRefs } =
      await this.existingSets(companyId);

    const report = { created: 0, skipped: 0, failed: [] as { name: string; message: string }[] };

    if (entity === 'LEDGERS') {
      const { valid, duplicates, errors } = validateLedgerRows(
        rows,
        ledgerNames,
        groupNames,
      );
      this.rejectIfInvalid(errors);
      report.skipped = duplicates.length;
      const groups = await this.prisma.accountGroup.findMany({
        where: { companyId },
        select: { id: true, name: true },
      });
      const groupId = new Map(groups.map((g) => [g.name, g.id]));
      for (const row of valid) {
        await this.createSafely(report, row.name, () =>
          this.accounting.createLedger(companyId, {
            name: row.name,
            groupId: groupId.get(row.group) as string,
            openingBalance: row.openingBalance,
            openingType: row.openingType as EntryType,
            description: row.description,
          }),
        );
      }
      return report;
    }

    if (entity === 'PARTIES') {
      const { valid, duplicates, errors } = validatePartyRows(
        rows,
        ledgerNames,
        PartyType.CUSTOMER,
      );
      this.rejectIfInvalid(errors);
      report.skipped = duplicates.length;
      for (const row of valid) {
        await this.createSafely(report, row.name, () =>
          this.parties.createParty(companyId, {
            type: row.type as PartyType,
            name: row.name,
            gstin: row.gstin,
            email: row.email,
            phone: row.phone,
            addressLine1: row.addressLine1,
            addressLine2: row.addressLine2,
            city: row.city,
            pincode: row.pincode,
            openingBalance: row.openingBalance,
            openingType: row.openingType as EntryType,
          }),
        );
      }
      return report;
    }

    if (entity === 'OPEN_INVOICES' || entity === 'OPEN_BILLS') {
      const kind = entity === 'OPEN_INVOICES' ? 'RECEIVABLE' : 'PAYABLE';
      // No pending set here: by commit time the parties must really exist.
      const { valid, duplicates, errors } = validateOpenDocRows(
        rows,
        kind,
        partiesByName,
        new Set(),
        openRefs[kind],
        this.today(),
      );
      this.rejectIfInvalid(errors);
      report.skipped = duplicates.length;
      for (const row of valid) {
        await this.createSafely(report, `${row.party} / ${row.refNo}`, () =>
          this.prisma.openingDocument.create({
            data: {
              companyId,
              partyId: row.partyId,
              kind,
              refNo: row.refNo,
              date: new Date(row.date),
              dueDate: row.dueDate ? new Date(row.dueDate) : null,
              amount: row.amount,
              notes: row.notes,
            },
          }),
        );
      }
      return report;
    }

    const { valid, duplicates, errors } = validateItemRows(rows, itemNames);
    this.rejectIfInvalid(errors);
    report.skipped = duplicates.length;
    for (const row of valid) {
      await this.createSafely(report, row.name, () =>
        this.parties.createItem(companyId, {
          name: row.name,
          sku: row.sku,
          hsnCode: row.hsnCode,
          unit: row.unit,
          gstRate: row.gstRate,
          salePrice: row.salePrice,
          purchasePrice: row.purchasePrice,
          openingStock: row.openingStock,
          barcode: row.barcode,
          description: row.description,
        }),
      );
    }
    return report;
  }

  private rejectIfInvalid(errors: { row: number; message: string }[]): void {
    if (errors.length > 0) {
      throw new BadRequestException(
        `Fix ${errors.length} invalid row(s) before importing — row ${errors[0].row}: ${errors[0].message}`,
      );
    }
  }

  /** One bad row must not abort the rest — record and continue. */
  private async createSafely(
    report: { created: number; failed: { name: string; message: string }[] },
    name: string,
    create: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await create();
      report.created += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not create';
      this.logger.warn(`Import row "${name}" failed: ${message}`);
      report.failed.push({ name, message });
    }
  }
}

/** Type re-exports for the controller. */
export type {
  ImportEntity,
  LedgerImportRow,
  PartyImportRow,
  ItemImportRow,
};
