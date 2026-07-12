'use client';

import { useCallback, useEffect, useState } from 'react';
import { blankDesign, STARTER_DESIGNS, type PrintDesign } from '@bookly/shared';
import {
  createPrintTemplate,
  deletePrintTemplate,
  duplicatePrintTemplate,
  getPrintTemplate,
  listPrintTemplates,
  previewDesign,
  setDefaultPrintTemplate,
  updatePrintTemplate,
  type PrintTemplateSummary,
} from '@/lib/print-designer';
import { DesignerProvider, useDesigner } from './context';
import { Canvas } from './canvas';
import { LeftPanel } from './left-panel';
import { PropertyPanel } from './property-panel';
import { Toolbar } from './toolbar';

const DOC_TITLE: Record<string, string> = {
  invoice: 'invoice', estimate: 'estimate', proformaInvoice: 'proforma invoice',
  salesOrder: 'sales order', deliveryChallan: 'delivery challan',
  purchaseBill: 'purchase bill', purchaseEstimate: 'purchase estimate',
  purchaseOrder: 'purchase order',
};

export function PrintDesigner({
  companyId,
  docKind = 'invoice',
  onBack,
}: {
  companyId: string;
  docKind?: string;
  onBack: () => void;
}) {
  const defaultName = `Untitled ${DOC_TITLE[docKind] ?? 'document'}`;
  const [tplId, setTplId] = useState<string | null>(null);
  const [name, setName] = useState(defaultName);
  const [initialDesign, setInitialDesign] = useState<PrintDesign>(() => blankDesign());
  const [bootKey, setBootKey] = useState(0);

  const loadTemplate = useCallback(async (id: string) => {
    const t = await getPrintTemplate(companyId, id);
    setTplId(t.id);
    setName(t.name);
    setInitialDesign(t.design);
    setBootKey((k) => k + 1);
  }, [companyId]);

  const newTemplate = useCallback((design?: PrintDesign, nm = defaultName) => {
    setTplId(null);
    setName(nm);
    setInitialDesign(design ?? blankDesign());
    setBootKey((k) => k + 1);
  }, [defaultName]);

  return (
    <DesignerProvider key={bootKey} initial={initialDesign}>
      <DesignerInner
        companyId={companyId}
        docKind={docKind}
        name={name}
        setName={setName}
        tplId={tplId}
        setTplId={setTplId}
        onBack={onBack}
        onLoadTemplate={loadTemplate}
        onNewTemplate={newTemplate}
      />
    </DesignerProvider>
  );
}

function DesignerInner({
  companyId,
  docKind,
  name,
  setName,
  tplId,
  setTplId,
  onBack,
  onLoadTemplate,
  onNewTemplate,
}: {
  companyId: string;
  docKind: string;
  name: string;
  setName: (v: string) => void;
  tplId: string | null;
  setTplId: (v: string | null) => void;
  onBack: () => void;
  onLoadTemplate: (id: string) => void;
  onNewTemplate: (design?: PrintDesign, name?: string) => void;
}) {
  const d = useDesigner();
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2200); };

  const save = useCallback(async () => {
    setSaving(true);
    try {
      if (tplId) {
        await updatePrintTemplate(companyId, tplId, { name, design: d.design });
      } else {
        const created = await createPrintTemplate(companyId, { name, docKind, design: d.design });
        setTplId(created.id);
      }
      flash('Saved');
    } catch {
      flash('Save failed');
    } finally {
      setSaving(false);
    }
  }, [companyId, docKind, tplId, name, d.design, setTplId]);

  const preview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewUrl(null);
    try {
      const url = await previewDesign(companyId, d.design, docKind);
      setPreviewUrl(url);
    } catch {
      flash('Preview failed');
    } finally {
      setPreviewLoading(false);
    }
  }, [companyId, docKind, d.design]);

  // keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? d.redo() : d.undo(); }
      else if (meta && e.key.toLowerCase() === 'y') { e.preventDefault(); d.redo(); }
      else if (meta && e.key.toLowerCase() === 'd') { e.preventDefault(); d.duplicateSelected(); }
      else if (meta && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { if (d.selectedIds.length) { e.preventDefault(); d.removeSelected(); } }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [d, save]);

  return (
    <div className="flex h-[calc(100vh-2px)] flex-col bg-[#0f1115]">
      <Toolbar
        name={name}
        onRename={setName}
        onSave={save}
        onPreview={preview}
        onBack={onBack}
        onTemplates={() => setShowTemplates(true)}
        saving={saving}
      />
      <div className="flex min-h-0 flex-1">
        <LeftPanel docKind={docKind} />
        <Canvas />
        <PropertyPanel />
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-xl ring-1 ring-white/10">
          {toast}
        </div>
      )}

      {(previewLoading || previewUrl) && (
        <Modal onClose={() => { if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }} title="PDF preview (sample data)">
          {previewLoading ? (
            <div className="flex h-[70vh] items-center justify-center text-slate-400">Rendering…</div>
          ) : (
            <iframe src={previewUrl!} className="h-[70vh] w-full rounded-md bg-white" title="preview" />
          )}
        </Modal>
      )}

      {showTemplates && (
        <TemplatesModal
          companyId={companyId}
          docKind={docKind}
          currentId={tplId}
          design={d.design}
          onClose={() => setShowTemplates(false)}
          onLoad={(id) => { onLoadTemplate(id); setShowTemplates(false); }}
          onNew={() => { onNewTemplate(); setShowTemplates(false); }}
          onImport={(des, nm) => { onNewTemplate(des, nm); setShowTemplates(false); }}
        />
      )}
    </div>
  );
}

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className={`w-full ${wide ? 'max-w-5xl' : 'max-w-3xl'} rounded-xl border border-white/10 bg-[#16181d] p-4 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TemplatesModal({
  companyId,
  docKind,
  currentId,
  design,
  onClose,
  onLoad,
  onNew,
  onImport,
}: {
  companyId: string;
  docKind: string;
  currentId: string | null;
  design: PrintDesign;
  onClose: () => void;
  onLoad: (id: string) => void;
  onNew: () => void;
  onImport: (design: PrintDesign, name: string) => void;
}) {
  const [items, setItems] = useState<PrintTemplateSummary[] | null>(null);

  const reload = useCallback(() => {
    listPrintTemplates(companyId, docKind).then(setItems).catch(() => setItems([]));
  }, [companyId, docKind]);
  useEffect(() => { reload(); }, [reload]);

  function exportJson() {
    const blob = new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'print-design.json';
    a.click();
    URL.revokeObjectURL(url);
  }
  function importJson(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(String(r.result)) as PrintDesign;
        onImport(parsed, f.name.replace(/\.json$/, ''));
      } catch {
        alert('Invalid design file');
      }
    };
    r.readAsText(f);
  }

  return (
    <Modal title="Template management" onClose={onClose} wide>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={onNew} className="rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-600">+ New blank</button>
        <button onClick={exportJson} className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10">Export current</button>
        <label className="cursor-pointer rounded-md border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10">
          Import JSON
          <input type="file" accept="application/json" onChange={importJson} className="hidden" />
        </label>
      </div>

      {/* Ready-made starters so the canvas never opens blank. */}
      <div className="mb-3">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Start from a template</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {STARTER_DESIGNS.map((s) => (
            <button
              key={s.key}
              onClick={() => onImport(structuredClone(s.design), s.name)}
              className="rounded-lg border border-white/10 bg-white/5 p-3 text-left transition-colors hover:border-indigo-500/60 hover:bg-indigo-500/10"
            >
              <span className="block text-sm font-medium text-white">{s.name}</span>
              <span className="mt-0.5 block text-[11px] text-slate-400">{s.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[55vh] space-y-1.5 overflow-auto">
        {items === null && <p className="text-sm text-slate-500">Loading…</p>}
        {items?.length === 0 && <p className="text-sm text-slate-500">No saved templates yet.</p>}
        {items?.map((t) => (
          <div key={t.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${t.id === currentId ? 'border-indigo-500/60 bg-indigo-500/10' : 'border-white/10'}`}>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">
                {t.name}
                {t.isDefault && <span className="ml-2 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">DEFAULT</span>}
              </p>
              <p className="text-[11px] text-slate-500">Updated {new Date(t.updatedAt).toLocaleString()}</p>
            </div>
            <button onClick={() => onLoad(t.id)} className="rounded border border-white/10 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10">Open</button>
            <button onClick={() => duplicatePrintTemplate(companyId, t.id).then(reload)} className="rounded border border-white/10 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10">Duplicate</button>
            <button onClick={() => setDefaultPrintTemplate(companyId, t.id).then(reload)} className="rounded border border-white/10 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10" disabled={t.isDefault}>Set default</button>
            <button onClick={() => { if (confirm(`Delete "${t.name}"?`)) deletePrintTemplate(companyId, t.id).then(reload); }} className="rounded border border-red-500/30 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/10">Delete</button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
