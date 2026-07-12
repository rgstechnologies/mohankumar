/**
 * Format-agnostic tabular document. Every report/register is converted to
 * this shape once, then rendered to CSV, XLSX or PDF by ExporterService.
 */

export interface ExportColumn {
  header: string;
  key: string;
  /** Relative width weight (PDF/XLSX). Default 1. */
  width?: number;
  align?: 'left' | 'right';
  format?: 'text' | 'currency' | 'number' | 'date';
}

export interface ExportSheet {
  name: string;
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
  /** Optional bold totals row keyed like the columns. */
  totalsRow?: Record<string, unknown>;
}

export interface TableDoc {
  title: string;
  subtitle?: string;
  /** Used in the Content-Disposition filename (no extension). */
  fileName: string;
  sheets: ExportSheet[];
}
