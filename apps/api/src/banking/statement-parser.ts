import { BadRequestException } from '@nestjs/common';

/**
 * Bank statement CSV parser. Banks export wildly different layouts; this
 * auto-detects the common Indian formats:
 *   - separate Debit / Credit (or Withdrawal / Deposit) columns
 *   - single Amount column with sign, or with a Dr/Cr type column
 * Dates: dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, dd MMM yyyy.
 */

export interface ParsedStatementRow {
  /** ISO date (yyyy-mm-dd) */
  date: string;
  description: string;
  amount: number;
  /** Money INTO the bank account = IN, money out = OUT. */
  direction: 'IN' | 'OUT';
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function parseDate(raw: string): string | null {
  const s = raw.trim().replace(/^["']|["']$/g, '');
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s);
  if (m) return iso(+m[3], +m[2], +m[1]); // Indian banks: dd/mm/yyyy
  m = /^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -](\d{2,4})/.exec(s);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    if (!month) return null;
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return iso(year, month, +m[1]);
  }
  return null;
}

function iso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[₹,"\s]/g, '').replace(/^\((.+)\)$/, '-$1');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function detectDelimiter(headerLine: string): string {
  const candidates = [',', ';', '\t', '|'];
  return candidates.reduce((best, d) =>
    headerLine.split(d).length > headerLine.split(best).length ? d : best,
  );
}

/** Splits a CSV line respecting double quotes. */
function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

const findCol = (headers: string[], names: string[]): number =>
  headers.findIndex((h) => names.some((n) => h.includes(n)));

export function parseStatementCsv(csv: string): ParsedStatementRow[] {
  const lines = csv
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new BadRequestException('The file has no data rows');
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitLine(lines[0], delimiter).map((h) => h.toLowerCase());

  const dateCol = findCol(headers, ['date']);
  const descCol = findCol(headers, ['desc', 'narration', 'particular', 'remark', 'detail']);
  const debitCol = findCol(headers, ['debit', 'withdraw', 'dr amount', 'dr.']);
  const creditCol = findCol(headers, ['credit', 'deposit', 'cr amount', 'cr.']);
  const amountCol = findCol(headers, ['amount']);
  const typeCol = findCol(headers, ['type', 'dr/cr', 'cr/dr']);

  if (dateCol === -1) {
    throw new BadRequestException(
      'Could not find a Date column. Expected headers like: Date, Narration, Debit, Credit',
    );
  }
  if (debitCol === -1 && creditCol === -1 && amountCol === -1) {
    throw new BadRequestException(
      'Could not find Debit/Credit or Amount columns in the file header',
    );
  }

  const rows: ParsedStatementRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitLine(line, delimiter);
    const date = parseDate(cells[dateCol] ?? '');
    if (!date) continue; // skip non-transaction rows (footers, balances)

    const description =
      (descCol !== -1 ? cells[descCol] : '')?.trim() || 'Bank transaction';

    let amount: number | null = null;
    let direction: 'IN' | 'OUT' | null = null;

    if (debitCol !== -1 || creditCol !== -1) {
      const debit = debitCol !== -1 ? parseAmount(cells[debitCol] ?? '') : null;
      const credit = creditCol !== -1 ? parseAmount(cells[creditCol] ?? '') : null;
      if (debit && debit !== 0) {
        amount = Math.abs(debit);
        direction = 'OUT'; // bank debit = money leaving the account
      } else if (credit && credit !== 0) {
        amount = Math.abs(credit);
        direction = 'IN';
      }
    } else if (amountCol !== -1) {
      const value = parseAmount(cells[amountCol] ?? '');
      if (value !== null && value !== 0) {
        amount = Math.abs(value);
        if (typeCol !== -1) {
          const t = (cells[typeCol] ?? '').toLowerCase();
          direction = t.includes('cr') || t.includes('dep') ? 'IN' : 'OUT';
        } else {
          direction = value > 0 ? 'IN' : 'OUT';
        }
      }
    }

    if (amount !== null && direction !== null) {
      rows.push({ date, description, amount: Math.round(amount * 100) / 100, direction });
    }
  }

  if (rows.length === 0) {
    throw new BadRequestException('No transaction rows could be parsed from the file');
  }
  return rows;
}
