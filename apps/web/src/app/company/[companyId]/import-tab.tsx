'use client';

/**
 * Onboarding data-import wizard — Tally XML exports and CSV/XLSX spreadsheets.
 * Upload → inspect → (Tally: per-entity commit | Table: map columns → validate → commit).
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFeedback } from '@/components/feedback';
import { Badge, Button, Card, ErrorText, HelpTip, Select } from '@/components/ui';
import {
  commitImport,
  inspectImport,
  previewImport,
  type ImportEntity,
  type ImportInspectResult,
  type ImportRow,
  type ImportValidated,
} from '@/lib/accounting';
import { ApiError } from '@/lib/api';
import { AiSparkle, IconDoc } from '@/components/icons';

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

const TALLY_ORDER: ImportEntity[] = ['PARTIES', 'LEDGERS', 'ITEMS', 'OPEN_INVOICES', 'OPEN_BILLS'];
const ENTITIES: ImportEntity[] = ['LEDGERS', 'PARTIES', 'ITEMS', 'OPEN_INVOICES', 'OPEN_BILLS'];

interface CommitResult {
  created: number;
  skipped: number;
  failed: { name: string; message: string }[];
}

/** Chunk-safe base64 — String.fromCharCode blows the arg limit on MB files. */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 0x8000) {
    chunks.push(String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000))));
  }
  return btoa(chunks.join(''));
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function isImportEntity(value: string): value is ImportEntity {
  return (ENTITIES as string[]).includes(value);
}

const TH_CLASS =
  'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-faint';
const TD_CLASS = 'px-3 py-2 align-top';

// ----------------------------------------------------------------
// Shared fragments
// ----------------------------------------------------------------

function CountBadges({ data }: { data: ImportValidated }) {
  const t = useTranslations('importData');
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone="good">{t('counts.valid', { count: data.valid.length })}</Badge>
      <Badge tone="neutral">
        {t('counts.duplicates', { count: data.duplicates.length })}
      </Badge>
      <Badge tone="warn">{t('counts.errors', { count: data.errors.length })}</Badge>
    </div>
  );
}

function ValidationDetails({ data }: { data: ImportValidated }) {
  const t = useTranslations('importData');
  return (
    <div className="space-y-3">
      {data.unknownGroups && data.unknownGroups.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-600">
          {t('unknownGroups', { names: data.unknownGroups.join(', ') })}
        </div>
      )}
      {data.errors.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-line">
          <div className="max-h-56 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-subtle">
                  <th className={TH_CLASS}>{t('colRow')}</th>
                  <th className={TH_CLASS}>{t('colName')}</th>
                  <th className={TH_CLASS}>{t('colProblem')}</th>
                </tr>
              </thead>
              <tbody>
                {data.errors.map((e, i) => (
                  <tr key={i} className="border-b border-line last:border-0 hover:bg-subtle">
                    <td className={`${TD_CLASS} tabular-nums text-muted`}>{e.row}</td>
                    <td className={`${TD_CLASS} text-ink`}>{e.name}</td>
                    <td className={`${TD_CLASS} text-amber-600`}>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CommitResultView({ result }: { result: CommitResult }) {
  const t = useTranslations('importData');
  return (
    <div className="space-y-2 rounded-lg border border-line bg-subtle px-3 py-2">
      <p className="text-sm font-medium text-emerald-600">
        {t('resultLine', { created: result.created, skipped: result.skipped })}
      </p>
      {result.failed.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-red-500">
            {t('failedTitle', { count: result.failed.length })}
          </p>
          <ul className="mt-1 space-y-0.5 text-sm text-red-500">
            {result.failed.map((f, i) => (
              <li key={i}>
                {f.name} · {f.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------
// Tally section (one per entity, commits independently)
// ----------------------------------------------------------------

function TallySection({
  companyId,
  entity,
  data,
  onChanged,
}: {
  companyId: string;
  entity: ImportEntity;
  data: ImportValidated;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('importData');
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState('');

  async function onImport() {
    setBusy(true);
    setError('');
    try {
      const res = await commitImport(companyId, entity, data.valid);
      setResult(res);
      await onChanged();
      toast(t('toastImported'));
    } catch (err) {
      setError(errorMessage(err, t('toastFailed')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 border-b border-line pb-5 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h4 className="text-sm font-semibold text-ink">
            {t(`entities.${entity}`)}
          </h4>
          <CountBadges data={data} />
        </div>
        <Button
          onClick={onImport}
          disabled={busy || result !== null || data.valid.length === 0}
        >
          {busy ? t('importing') : t('importBtn', { count: data.valid.length })}
        </Button>
      </div>
      <ValidationDetails data={data} />
      {result && <CommitResultView result={result} />}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

// ----------------------------------------------------------------
// Table (spreadsheet) flow
// ----------------------------------------------------------------

function TableFlow({
  companyId,
  fileName,
  contentBase64,
  result,
  onChanged,
}: {
  companyId: string;
  fileName: string;
  contentBase64: string;
  result: Extract<ImportInspectResult, { format: 'TABLE' }>;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('importData');
  const { toast } = useFeedback();

  const aiEntity =
    result.aiMapping && isImportEntity(result.aiMapping.entity)
      ? result.aiMapping.entity
      : null;

  const buildMapping = (entity: ImportEntity): Record<string, string> => {
    const next: Record<string, string> = {};
    for (const field of result.fields[entity]) {
      const aiCol =
        aiEntity === entity ? result.aiMapping?.mapping[field] : undefined;
      next[field] = aiCol !== undefined ? String(aiCol) : '';
    }
    return next;
  };

  const [entity, setEntity] = useState<ImportEntity>(aiEntity ?? 'LEDGERS');
  const [mapping, setMapping] = useState<Record<string, string>>(() =>
    buildMapping(aiEntity ?? 'LEDGERS'),
  );
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState<ImportValidated | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState('');

  function clearValidation() {
    setValidated(null);
    setCommitResult(null);
    setError('');
  }

  function onEntityChange(value: string) {
    if (!isImportEntity(value)) return;
    setEntity(value);
    setMapping(buildMapping(value));
    clearValidation();
  }

  function onMapField(field: string, value: string) {
    setMapping((prev) => ({ ...prev, [field]: value }));
    clearValidation();
  }

  const mappedFields = result.fields[entity].filter((f) => mapping[f] !== '');

  async function onValidate() {
    setValidating(true);
    setError('');
    setValidated(null);
    setCommitResult(null);
    try {
      const numeric: Record<string, number> = {};
      for (const field of mappedFields) numeric[field] = Number(mapping[field]);
      setValidated(
        await previewImport(companyId, fileName, contentBase64, entity, numeric),
      );
    } catch (err) {
      setError(errorMessage(err, t('toastFailed')));
    } finally {
      setValidating(false);
    }
  }

  async function onCommit() {
    if (!validated) return;
    setCommitting(true);
    setError('');
    try {
      const res = await commitImport(companyId, entity, validated.valid);
      setCommitResult(res);
      await onChanged();
      toast(t('toastImported'));
    } catch (err) {
      setError(errorMessage(err, t('toastFailed')));
    } finally {
      setCommitting(false);
    }
  }

  return (
    <Card>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="neutral">{t('tableDetected', { rows: result.totalRows })}</Badge>
          {result.aiMapping ? (
            <Badge tone="good"><AiSparkle className="h-3.5 w-3.5" /> {t('aiMapped')}</Badge>
          ) : (
            <span className="text-sm text-muted">{t('manualMapHint')}</span>
          )}
        </div>

        {/* Entity picker */}
        <div className="max-w-xs">
          <label className="mb-1 block text-sm font-medium text-ink">
            {t('entityLabel')}
          </label>
          <Select value={entity} onChange={(e) => onEntityChange(e.target.value)}>
            {ENTITIES.map((en) => (
              <option key={en} value={en}>
                {t(`entities.${en}`)}
              </option>
            ))}
          </Select>
        </div>

        {/* Mapping grid */}
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-subtle">
                <th className={`${TH_CLASS} w-1/3`}>{t('fieldCol')}</th>
                <th className={TH_CLASS}>{t('columnCol')}</th>
              </tr>
            </thead>
            <tbody>
              {result.fields[entity].map((field) => (
                <tr key={field} className="border-b border-line last:border-0 hover:bg-subtle">
                  <td className={`${TD_CLASS} font-medium text-ink`}>
                    {t(`fields.${field}`)}
                  </td>
                  <td className={TD_CLASS}>
                    <Select
                      className="max-w-sm"
                      value={mapping[field] ?? ''}
                      onChange={(e) => onMapField(field, e.target.value)}
                    >
                      <option value="">{t('notMapped')}</option>
                      {result.headers.map((h, i) => (
                        <option key={i} value={String(i)}>
                          {h}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Sample rows */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
            {t('previewTitle')}
          </p>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line bg-subtle">
                  {result.headers.map((h, i) => (
                    <th
                      key={i}
                      className="max-w-[12rem] truncate px-3 py-2 text-left font-semibold uppercase tracking-wide text-faint"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono">
                {result.sampleRows.slice(0, 5).map((row, ri) => (
                  <tr key={ri} className="border-b border-line last:border-0 hover:bg-subtle">
                    {result.headers.map((_, ci) => (
                      <td
                        key={ci}
                        className="max-w-[12rem] truncate px-3 py-1.5 tabular-nums text-muted"
                      >
                        {row[ci] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={onValidate}
            disabled={validating || mappedFields.length === 0}
          >
            {validating ? t('validating') : t('validate')}
          </Button>
        </div>

        {/* Validation result */}
        {validated && (
          <div className="space-y-3 border-t border-line pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CountBadges data={validated} />
              <Button
                onClick={onCommit}
                disabled={
                  committing || commitResult !== null || validated.valid.length === 0
                }
              >
                {committing
                  ? t('importing')
                  : t('importBtn', { count: validated.valid.length })}
              </Button>
            </div>
            <ValidationDetails data={validated} />
            {validated.valid.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
                  {t('validTitle')}
                </p>
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line bg-subtle">
                        {mappedFields.map((f) => (
                          <th key={f} className={TH_CLASS}>
                            {t(`fields.${f}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {validated.valid.slice(0, 10).map((row, ri) => (
                        <tr key={ri} className="border-b border-line last:border-0 hover:bg-subtle">
                          {mappedFields.map((f) => (
                            <td
                              key={f}
                              className={`${TD_CLASS} max-w-[14rem] truncate tabular-nums text-muted`}
                            >
                              {row[f] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {commitResult && <CommitResultView result={commitResult} />}
          </div>
        )}
        <ErrorText>{error}</ErrorText>
      </div>
    </Card>
  );
}

// ----------------------------------------------------------------
// Main wizard
// ----------------------------------------------------------------

export function ImportTab({
  companyId,
  onChanged,
}: {
  companyId: string;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('importData');
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState('');
  const [result, setResult] = useState<ImportInspectResult | null>(null);
  // Bumping this key remounts the result subtree so all nested state resets.
  const [sessionKey, setSessionKey] = useState(0);

  function reset() {
    setFile(null);
    setResult(null);
    setInspectError('');
    setSessionKey((k) => k + 1);
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    e.target.value = '';
    if (!selected) return;
    setInspecting(true);
    setInspectError('');
    setResult(null);
    try {
      const base64 = toBase64(await selected.arrayBuffer());
      setFile({ name: selected.name, base64 });
      setResult(await inspectImport(companyId, selected.name, base64));
      setSessionKey((k) => k + 1);
    } catch (err) {
      setInspectError(errorMessage(err, t('toastFailed')));
    } finally {
      setInspecting(false);
    }
  }

  return (
    <div className="w-full space-y-6">
      <Card title={t('uploadTitle')}>
        <div className="space-y-4">
          <label
            className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
              inspecting
                ? 'cursor-wait border-line bg-subtle'
                : 'cursor-pointer border-line-strong bg-subtle hover:border-brand-400 hover:bg-brand-50'
            }`}
          >
            <input
              type="file"
              accept=".xml,.csv,.xlsx"
              className="hidden"
              disabled={inspecting}
              onChange={onFileSelected}
            />
            <span className="text-2xl" aria-hidden>
              <IconDoc className="h-7 w-7 text-brand-600" />
            </span>
            <span className="text-sm font-semibold text-brand-600">
              {inspecting ? t('inspecting') : t('chooseFile')}
            </span>
            <span className="text-sm text-muted">{t('uploadHint')}</span>
          </label>
          <p className="flex items-center text-xs text-faint">
            {t('supported')}
            <HelpTip text={t('uploadHint')} />
            {file && !inspecting && (
              <span className="ml-2 text-muted">· {file.name}</span>
            )}
          </p>
          <ErrorText>{inspectError}</ErrorText>
        </div>
      </Card>

      {result && file && (
        <div key={sessionKey} className="space-y-6">
          {result.format === 'TALLY_XML' ? (
            <Card>
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone="good">{t('tallyDetected')}</Badge>
                  <span className="text-sm text-muted">{t('orderTip')}</span>
                </div>
                {TALLY_ORDER.map((entity) => (
                  <TallySection
                    key={entity}
                    companyId={companyId}
                    entity={entity}
                    data={result.entities[entity]}
                    onChanged={onChanged}
                  />
                ))}
              </div>
            </Card>
          ) : (
            <TableFlow
              companyId={companyId}
              fileName={file.name}
              contentBase64={file.base64}
              result={result}
              onChanged={onChanged}
            />
          )}
          <div>
            <Button variant="secondary" onClick={reset}>
              {t('startOver')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
