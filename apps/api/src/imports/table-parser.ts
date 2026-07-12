import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

/** A parsed spreadsheet/CSV: one header row + string cells. */
export interface ParsedTable {
  headers: string[];
  rows: string[][];
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

export function parseCsvTable(content: string): ParsedTable {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');
  if (lines.length < 2) {
    throw new BadRequestException(
      'The file needs a header row and at least one data row',
    );
  }
  const delimiter = detectDelimiter(lines[0]);
  const headers = splitLine(lines[0], delimiter);
  const rows = lines.slice(1).map((l) => splitLine(l, delimiter));
  return { headers, rows };
}

export async function parseXlsxTable(buffer: Buffer): Promise<ParsedTable> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new BadRequestException('The workbook has no sheets');

  const text = (cell: ExcelJS.Cell): string => {
    const v = cell.value;
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') {
      if ('richText' in v) return v.richText.map((r) => r.text).join('');
      if ('text' in v) return String(v.text);
      if ('result' in v) return String(v.result ?? '');
      if (v instanceof Date) return v.toISOString().slice(0, 10);
    }
    return String(v);
  };

  const all: string[][] = [];
  sheet.eachRow((row) => {
    const cells: string[] = [];
    for (let c = 1; c <= sheet.columnCount; c++) {
      cells.push(text(row.getCell(c)).trim());
    }
    all.push(cells);
  });
  const nonEmpty = all.filter((r) => r.some((c) => c !== ''));
  if (nonEmpty.length < 2) {
    throw new BadRequestException(
      'The sheet needs a header row and at least one data row',
    );
  }
  return { headers: nonEmpty[0], rows: nonEmpty.slice(1) };
}
