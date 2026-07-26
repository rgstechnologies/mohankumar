import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EntryType,
  InvoiceStatus,
  NoteType,
  Prisma,
  VoucherStatus,
  VoucherType,
} from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import type { VoucherLineDto } from '../accounting/dto/accounting.dto';
import { fiscalYearOf } from '../accounting/fiscal-year.util';
import { calculateInvoice, type CalcLineInput } from '../invoices/gst-calculator';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateNoteDto } from './dto/note.dto';

const PREFIX: Record<NoteType, string> = {
  CREDIT_NOTE: 'CRN',
  DEBIT_NOTE: 'DBN',
};

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  /**
   * CREDIT_NOTE (sales return): Dr Sales + Dr GST Payable / Cr customer.
   * DEBIT_NOTE (purchase return): Dr vendor / Cr Purchases + Cr GST Input.
   * Always issued against a source document; total capped at what the
   * source still carries after earlier notes.
   */
  async create(companyId: string, userId: string, dto: CreateNoteDto) {
    if (!dto.invoiceId) {
      throw new BadRequestException('A note needs the source invoiceId');
    }

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { fyStartMonth: true },
    });

    // Load the source document (also gives us party + inter-state flag).
    const source = await this.prisma.invoice.findFirst({
      where: { id: dto.invoiceId, companyId, status: InvoiceStatus.ISSUED },
      include: { party: true, creditNotes: { where: { status: InvoiceStatus.ISSUED } } },
    });
    if (!source) {
      throw new NotFoundException('Source document not found or cancelled');
    }

    // Resolve note lines (items autofill like invoices).
    const itemIds = dto.lines
      .map((l) => l.itemId)
      .filter((id): id is string => Boolean(id));
    const items = await this.prisma.item.findMany({
      where: { id: { in: itemIds }, companyId },
    });
    const itemById = new Map(items.map((i) => [i.id, i]));

    const resolved = dto.lines.map((line, index) => {
      const item = line.itemId ? itemById.get(line.itemId) : undefined;
      if (line.itemId && !item) {
        throw new BadRequestException(`Line ${index + 1}: unknown item`);
      }
      const description = line.description?.trim() || item?.name;
      if (!description) {
        throw new BadRequestException(`Line ${index + 1}: description is required`);
      }
      const rate = line.rate;
      if (rate === undefined) {
        throw new BadRequestException(`Line ${index + 1}: rate is required`);
      }
      return {
        itemId: item?.id ?? null,
        description,
        hsnCode: item?.hsnCode ?? null,
        unit: item?.unit ?? 'PCS',
        calc: {
          quantity: line.quantity,
          rate,
          discountPct: 0,
          gstRate: line.gstRate ?? (item ? Number(item.gstRate) : 0),
        } satisfies CalcLineInput,
      };
    });

    const calc = calculateInvoice(
      resolved.map((r) => r.calc),
      source.isInterState,
    );

    // Cap: existing notes + this note must not exceed the source value.
    const priorNotes = source.creditNotes;
    const alreadyNoted = priorNotes.reduce((s, n) => s + Number(n.total), 0);
    const remaining =
      Math.round((Number(source.total) - alreadyNoted) * 100) / 100;
    if (calc.total > remaining) {
      throw new BadRequestException(
        `Note total ₹${calc.total} exceeds the remaining value of the source document (₹${remaining})`,
      );
    }

    const ledgers = await this.systemLedgers(companyId, dto.type);
    const voucherLines: VoucherLineDto[] = [];

    if (dto.type === NoteType.CREDIT_NOTE) {
      // Reverse a sale
      voucherLines.push({
        ledgerId: ledgers['Sales'],
        type: EntryType.DEBIT,
        amount: calc.taxableAmount,
      });
      if (calc.cgstAmount > 0) {
        voucherLines.push({ ledgerId: ledgers['CGST Payable'], type: EntryType.DEBIT, amount: calc.cgstAmount });
        voucherLines.push({ ledgerId: ledgers['SGST Payable'], type: EntryType.DEBIT, amount: calc.sgstAmount });
      }
      if (calc.igstAmount > 0) {
        voucherLines.push({ ledgerId: ledgers['IGST Payable'], type: EntryType.DEBIT, amount: calc.igstAmount });
      }
      if (calc.roundOff > 0) {
        voucherLines.push({ ledgerId: ledgers['Rounding Off'], type: EntryType.DEBIT, amount: calc.roundOff });
      } else if (calc.roundOff < 0) {
        voucherLines.push({ ledgerId: ledgers['Rounding Off'], type: EntryType.CREDIT, amount: Math.abs(calc.roundOff) });
      }
      voucherLines.push({
        ledgerId: source.party.ledgerId,
        type: EntryType.CREDIT,
        amount: calc.total,
      });
    } else {
      // Reverse a purchase
      voucherLines.push({
        ledgerId: source.party.ledgerId,
        type: EntryType.DEBIT,
        amount: calc.total,
      });
      voucherLines.push({
        ledgerId: ledgers['Purchases'],
        type: EntryType.CREDIT,
        amount: calc.taxableAmount,
      });
      if (calc.cgstAmount > 0) {
        voucherLines.push({ ledgerId: ledgers['CGST Input'], type: EntryType.CREDIT, amount: calc.cgstAmount });
        voucherLines.push({ ledgerId: ledgers['SGST Input'], type: EntryType.CREDIT, amount: calc.sgstAmount });
      }
      if (calc.igstAmount > 0) {
        voucherLines.push({ ledgerId: ledgers['IGST Input'], type: EntryType.CREDIT, amount: calc.igstAmount });
      }
      if (calc.roundOff > 0) {
        voucherLines.push({ ledgerId: ledgers['Rounding Off'], type: EntryType.CREDIT, amount: calc.roundOff });
      } else if (calc.roundOff < 0) {
        voucherLines.push({ ledgerId: ledgers['Rounding Off'], type: EntryType.DEBIT, amount: Math.abs(calc.roundOff) });
      }
    }

    const voucherDto = {
      type:
        dto.type === NoteType.CREDIT_NOTE
          ? VoucherType.CREDIT_NOTE
          : VoucherType.DEBIT_NOTE,
      date: dto.date,
      narration:
        dto.reason ??
        `${dto.type === NoteType.CREDIT_NOTE ? 'Credit' : 'Debit'} note for ${source.party.name}`,
      lines: voucherLines,
    };
    await this.accounting.validateVoucherInput(companyId, voucherDto);

    const fiscalYear = fiscalYearOf(new Date(dto.date), company.fyStartMonth);

    const note = await this.prisma.$transaction(async (tx) => {
      const voucher = await this.accounting.postVoucherTx(
        tx,
        companyId,
        userId,
        voucherDto,
      );
      const counter = await tx.noteCounter.upsert({
        where: {
          companyId_type_fiscalYear: { companyId, type: dto.type, fiscalYear },
        },
        create: { companyId, type: dto.type, fiscalYear, nextNo: 2 },
        update: { nextNo: { increment: 1 } },
      });
      return tx.note.create({
        data: {
          companyId,
          type: dto.type,
          noteNo: counter.nextNo - 1,
          fiscalYear,
          partyId: source.party.id,
          invoiceId: dto.type === NoteType.CREDIT_NOTE ? dto.invoiceId : null,
          purchaseBillId:
            dto.type === NoteType.DEBIT_NOTE ? dto.purchaseBillId : null,
          voucherId: voucher.id,
          date: new Date(dto.date),
          reason: dto.reason,
          isInterState: source.isInterState,
          taxableAmount: calc.taxableAmount,
          cgstAmount: calc.cgstAmount,
          sgstAmount: calc.sgstAmount,
          igstAmount: calc.igstAmount,
          roundOff: calc.roundOff,
          total: calc.total,
          createdById: userId,
          lines: {
            create: resolved.map((r, index) => ({
              itemId: r.itemId,
              lineNo: index + 1,
              description: r.description,
              hsnCode: r.hsnCode,
              unit: r.unit,
              quantity: calc.lines[index].quantity,
              rate: calc.lines[index].rate,
              taxableValue: calc.lines[index].taxableValue,
              gstRate: calc.lines[index].gstRate,
              cgst: calc.lines[index].cgst,
              sgst: calc.lines[index].sgst,
              igst: calc.lines[index].igst,
              total: calc.lines[index].total,
            })),
          },
        },
        include: this.fullInclude,
      });
    });

    return this.serialize(note);
  }

  async list(companyId: string) {
    const notes = await this.prisma.note.findMany({
      where: { companyId },
      include: this.fullInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return notes.map((n) => this.serialize(n));
  }

  async cancel(companyId: string, noteId: string) {
    const note = await this.prisma.note.findFirst({
      where: { id: noteId, companyId },
    });
    if (!note) throw new NotFoundException('Note not found');
    if (note.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Note is already cancelled');
    }
    await this.prisma.$transaction([
      this.prisma.voucher.update({
        where: { id: note.voucherId },
        data: { status: VoucherStatus.CANCELLED },
      }),
      this.prisma.note.update({
        where: { id: note.id },
        data: { status: InvoiceStatus.CANCELLED },
      }),
    ]);
    const updated = await this.prisma.note.findUniqueOrThrow({
      where: { id: noteId },
      include: this.fullInclude,
    });
    return this.serialize(updated);
  }

  // -------------------------------------------------------------

  private readonly fullInclude = {
    party: { select: { id: true, name: true, gstin: true } },
    invoice: { select: { invoiceNo: true, fiscalYear: true } },
    lines: { orderBy: { lineNo: 'asc' as const } },
  };

  private async systemLedgers(
    companyId: string,
    type: NoteType,
  ): Promise<Record<string, string>> {
    const names =
      type === NoteType.CREDIT_NOTE
        ? ['Sales', 'CGST Payable', 'SGST Payable', 'IGST Payable', 'Rounding Off']
        : ['Sales', 'CGST Payable', 'SGST Payable', 'IGST Payable', 'Rounding Off'];
    const ledgers = await this.prisma.ledger.findMany({
      where: { companyId, name: { in: names } },
      select: { id: true, name: true },
    });
    const map = Object.fromEntries(ledgers.map((l) => [l.name, l.id]));
    for (const name of names) {
      if (!map[name]) {
        throw new BadRequestException(`Missing system ledger "${name}"`);
      }
    }
    return map;
  }

  private serialize(note: {
    id: string;
    type: NoteType;
    noteNo: number;
    fiscalYear: string;
    date: Date;
    reason: string | null;
    status: string;
    isInterState: boolean;
    taxableAmount: Prisma.Decimal;
    cgstAmount: Prisma.Decimal;
    sgstAmount: Prisma.Decimal;
    igstAmount: Prisma.Decimal;
    roundOff: Prisma.Decimal;
    total: Prisma.Decimal;
    party: { id: string; name: string; gstin: string | null };
    invoice: { invoiceNo: number; fiscalYear: string } | null;
    lines: {
      lineNo: number;
      description: string;
      quantity: Prisma.Decimal;
      rate: Prisma.Decimal;
      gstRate: Prisma.Decimal;
      total: Prisma.Decimal;
    }[];
  }) {
    return {
      id: note.id,
      type: note.type,
      noteNo: `${PREFIX[note.type]}/${note.fiscalYear}/${String(note.noteNo).padStart(4, '0')}`,
      date: note.date,
      reason: note.reason,
      status: note.status,
      isInterState: note.isInterState,
      party: note.party,
      against: note.invoice
        ? `INV/${note.invoice.fiscalYear}/${String(note.invoice.invoiceNo).padStart(4, '0')}`
        : null,
      taxableAmount: Number(note.taxableAmount),
      cgstAmount: Number(note.cgstAmount),
      sgstAmount: Number(note.sgstAmount),
      igstAmount: Number(note.igstAmount),
      roundOff: Number(note.roundOff),
      total: Number(note.total),
      lines: note.lines.map((line) => ({
        lineNo: line.lineNo,
        description: line.description,
        quantity: Number(line.quantity),
        rate: Number(line.rate),
        gstRate: Number(line.gstRate),
        total: Number(line.total),
      })),
    };
  }
}
