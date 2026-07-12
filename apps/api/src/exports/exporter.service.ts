import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { ExportColumn, ExportSheet, TableDoc } from './table-doc';

const inr = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function cellText(value: unknown, column: ExportColumn): string {
  if (value === null || value === undefined || value === '') return '';
  if (column.format === 'currency') return inr(Number(value));
  if (column.format === 'date') {
    return new Date(value as string).toLocaleDateString('en-IN');
  }
  return String(value);
}

@Injectable()
export class ExporterService {
  // -------------------------------------------------------------
  // CSV
  // -------------------------------------------------------------

  toCsv(doc: TableDoc): Buffer {
    const escape = (s: string) =>
      /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;

    const lines: string[] = [];
    for (const sheet of doc.sheets) {
      if (doc.sheets.length > 1) lines.push(escape(`# ${sheet.name}`));
      lines.push(sheet.columns.map((c) => escape(c.header)).join(','));
      for (const row of sheet.rows) {
        lines.push(
          sheet.columns
            .map((c) => {
              const v = row[c.key];
              // Keep raw numbers machine-readable in CSV (no thousand separators)
              if (c.format === 'currency' || c.format === 'number') {
                return v === null || v === undefined || v === '' ? '' : String(v);
              }
              return escape(cellText(v, c));
            })
            .join(','),
        );
      }
      if (sheet.totalsRow) {
        lines.push(
          sheet.columns
            .map((c) => {
              const v = sheet.totalsRow![c.key];
              if (v === null || v === undefined) return '';
              return c.format === 'currency' || c.format === 'number'
                ? String(v)
                : escape(String(v));
            })
            .join(','),
        );
      }
      lines.push('');
    }
    // BOM so Excel opens UTF-8 (₹, Tamil etc.) correctly
    return Buffer.from('﻿' + lines.join('\r\n'), 'utf8');
  }

  // -------------------------------------------------------------
  // XLSX
  // -------------------------------------------------------------

  async toXlsx(doc: TableDoc): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'RGS';

    for (const sheet of doc.sheets) {
      const ws = workbook.addWorksheet(sheet.name.slice(0, 31));

      ws.columns = sheet.columns.map((c) => ({
        header: c.header,
        key: c.key,
        width: Math.max(12, (c.width ?? 1) * 16),
        style:
          c.format === 'currency'
            ? { numFmt: '#,##0.00' }
            : c.format === 'date'
              ? { numFmt: 'dd/mm/yyyy' }
              : undefined,
      }));

      const headerRow = ws.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' },
      };
      headerRow.alignment = { vertical: 'middle' };
      headerRow.height = 20;

      for (const row of sheet.rows) {
        const values: Record<string, unknown> = {};
        for (const c of sheet.columns) {
          const v = row[c.key];
          values[c.key] =
            c.format === 'date' && v ? new Date(v as string) : (v ?? '');
        }
        ws.addRow(values);
      }

      if (sheet.totalsRow) {
        const totals = ws.addRow(
          Object.fromEntries(
            sheet.columns.map((c) => [c.key, sheet.totalsRow![c.key] ?? '']),
          ),
        );
        totals.font = { bold: true };
        totals.border = { top: { style: 'thin' } };
      }

      // Right-align numeric columns
      sheet.columns.forEach((c, i) => {
        if (c.align === 'right' || c.format === 'currency' || c.format === 'number') {
          ws.getColumn(i + 1).alignment = { horizontal: 'right' };
        }
      });
      ws.getRow(1).alignment = { horizontal: 'left' };
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  // -------------------------------------------------------------
  // PDF
  // -------------------------------------------------------------

  async toPdf(doc: TableDoc): Promise<Buffer> {
    const pdf = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve) =>
      pdf.on('end', () => resolve(Buffer.concat(chunks))),
    );

    const M = 36;
    const W = pdf.page.width - M * 2;
    const bottomLimit = pdf.page.height - 50;

    pdf.fontSize(15).font('Helvetica-Bold').text(doc.title, M, M);
    if (doc.subtitle) {
      pdf.fontSize(9).font('Helvetica').fillColor('#64748b').text(doc.subtitle);
    }
    pdf.fillColor('#000');
    let y = pdf.y + 10;

    for (const sheet of doc.sheets) {
      const totalWeight = sheet.columns.reduce((s, c) => s + (c.width ?? 1), 0);
      const colX: number[] = [];
      const colW: number[] = [];
      let x = M;
      for (const c of sheet.columns) {
        colX.push(x);
        const w = (W * (c.width ?? 1)) / totalWeight;
        colW.push(w - 6);
        x += w;
      }

      const drawHeader = () => {
        pdf.rect(M, y - 3, W, 16).fill('#f1f5f9');
        pdf.fillColor('#334155').fontSize(7.5).font('Helvetica-Bold');
        sheet.columns.forEach((c, i) =>
          pdf.text(c.header.toUpperCase(), colX[i], y, {
            width: colW[i],
            align: c.align ?? (c.format === 'currency' || c.format === 'number' ? 'right' : 'left'),
          }),
        );
        pdf.fillColor('#000').font('Helvetica');
        y += 17;
      };

      if (doc.sheets.length > 1) {
        if (y > bottomLimit - 60) {
          pdf.addPage();
          y = M;
        }
        pdf.fontSize(11).font('Helvetica-Bold').text(sheet.name, M, y);
        y = pdf.y + 6;
        pdf.font('Helvetica');
      }
      drawHeader();

      const renderRow = (row: Record<string, unknown>, bold = false) => {
        if (y > bottomLimit) {
          pdf.addPage();
          y = M;
          drawHeader();
        }
        pdf.fontSize(8).font(bold ? 'Helvetica-Bold' : 'Helvetica');
        let rowHeight = 12;
        sheet.columns.forEach((c, i) => {
          const text = cellText(row[c.key], c);
          rowHeight = Math.max(rowHeight, pdf.heightOfString(text, { width: colW[i] }) + 4);
        });
        sheet.columns.forEach((c, i) =>
          pdf.text(cellText(row[c.key], c), colX[i], y, {
            width: colW[i],
            align: c.align ?? (c.format === 'currency' || c.format === 'number' ? 'right' : 'left'),
          }),
        );
        y += rowHeight;
        pdf
          .moveTo(M, y - 2)
          .lineTo(M + W, y - 2)
          .strokeColor('#e2e8f0')
          .lineWidth(0.5)
          .stroke();
      };

      for (const row of sheet.rows) renderRow(row);
      if (sheet.totalsRow) renderRow(sheet.totalsRow, true);
      y += 14;
    }

    pdf
      .fontSize(7)
      .fillColor('#94a3b8')
      .text(
        `Generated by RGS on ${new Date().toLocaleString('en-IN')}`,
        M,
        pdf.page.height - 40,
        { width: W, align: 'center' },
      );

    pdf.end();
    return finished;
  }
}
