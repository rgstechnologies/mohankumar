import { z } from 'zod';

/**
 * Shape the model must return for report Q&A. The numbers it cites come from
 * precomputed report data we feed it — the model never does the accounting,
 * it only selects and presents.
 */

const cellSchema = z.union([z.string().max(200), z.number().finite()]);

export const reportAnswerSchema = z.object({
  answer: z.string().min(1).max(4000),
  table: z
    .object({
      title: z.string().max(120).optional(),
      columns: z.array(z.string().min(1).max(60)).min(1).max(8),
      rows: z.array(z.array(cellSchema).min(1).max(8)).min(1).max(50),
    })
    .optional(),
});

export type ReportAnswer = z.infer<typeof reportAnswerSchema>;

/** Drop ragged rows — a model occasionally emits a short/long row. */
export function normalizeTable(answer: ReportAnswer): ReportAnswer {
  if (!answer.table) return answer;
  const width = answer.table.columns.length;
  const rows = answer.table.rows.filter((r) => r.length === width);
  if (rows.length === 0) return { answer: answer.answer };
  return { ...answer, table: { ...answer.table, rows } };
}
