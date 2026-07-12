import { join } from 'path';
import type PDFDocument from 'pdfkit';

/**
 * Locale support for generated PDFs. Tamil uses Hind Madurai (OFL) and Hindi
 * uses Lohit Devanagari (OFL) — each covers its script AND Latin in one face,
 * because pdfkit cannot fall back across fonts, so a single dual-script font
 * is the only safe option. English keeps the built-in Helvetica family (no
 * embedding cost).
 */

export type PdfLang = 'en' | 'ta' | 'hi';

export const pdfLang = (value?: string): PdfLang =>
  value === 'ta' ? 'ta' : value === 'hi' ? 'hi' : 'en';

export interface PdfFonts {
  regular: string;
  bold: string;
  oblique: string;
}

export function registerPdfFonts(
  doc: typeof PDFDocument.prototype,
  lang: PdfLang,
): PdfFonts {
  // cwd is apps/api in dev and /app/apps/api in the Docker image.
  const dir = join(process.cwd(), 'assets', 'fonts');
  if (lang === 'ta') {
    doc.registerFont('body', join(dir, 'HindMadurai-Regular.ttf'));
    doc.registerFont('body-bold', join(dir, 'HindMadurai-Bold.ttf'));
    // Hind Madurai has no oblique cut — regular reads fine for footnotes.
    return { regular: 'body', bold: 'body-bold', oblique: 'body' };
  }
  if (lang === 'hi') {
    // Lohit Devanagari ships a single Regular cut (no bold/oblique), so all
    // three aliases map to it — emphasis is conveyed by size/colour instead.
    doc.registerFont('body', join(dir, 'LohitDevanagari-Regular.ttf'));
    return { regular: 'body', bold: 'body', oblique: 'body' };
  }
  return {
    regular: 'Helvetica',
    bold: 'Helvetica-Bold',
    oblique: 'Helvetica-Oblique',
  };
}
