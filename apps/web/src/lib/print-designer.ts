'use client';

import type { PrintDesign } from '@bookly/shared';
import { api, ApiError } from './api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const BASE = `${API_URL}/api/v1`;

export interface PrintTemplateSummary {
  id: string;
  name: string;
  docKind: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PrintTemplateFull extends PrintTemplateSummary {
  design: PrintDesign;
}

export const listPrintTemplates = (companyId: string, docKind = 'invoice') =>
  api.get<PrintTemplateSummary[]>(
    `/companies/${companyId}/print-templates?docKind=${docKind}`,
  );

export const getPrintTemplate = (companyId: string, id: string) =>
  api.get<PrintTemplateFull>(`/companies/${companyId}/print-templates/${id}`);

export const createPrintTemplate = (
  companyId: string,
  body: { name: string; docKind?: string; design: PrintDesign },
) =>
  api.post<PrintTemplateFull>(`/companies/${companyId}/print-templates`, body);

export const updatePrintTemplate = (
  companyId: string,
  id: string,
  body: { name?: string; design?: PrintDesign; isDefault?: boolean },
) =>
  api.patch<PrintTemplateFull>(
    `/companies/${companyId}/print-templates/${id}`,
    body,
  );

export const deletePrintTemplate = (companyId: string, id: string) =>
  api.delete<{ deleted: boolean }>(
    `/companies/${companyId}/print-templates/${id}`,
  );

export const duplicatePrintTemplate = (companyId: string, id: string) =>
  api.post<PrintTemplateFull>(
    `/companies/${companyId}/print-templates/${id}/duplicate`,
  );

export const setDefaultPrintTemplate = (companyId: string, id: string) =>
  api.post<PrintTemplateFull>(
    `/companies/${companyId}/print-templates/${id}/default`,
  );

/** Render a design with sample data and return a blob URL for an <iframe>. */
export async function previewDesign(
  companyId: string,
  design: PrintDesign,
  docKind = 'invoice',
): Promise<string> {
  const res = await fetch(`${BASE}/companies/${companyId}/print-templates/preview`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ design, docKind }),
  });
  if (!res.ok) throw new ApiError(res.status, `Preview failed (${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
