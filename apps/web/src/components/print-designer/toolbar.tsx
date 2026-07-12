'use client';

import { paperDimsMm } from '@bookly/shared';
import { useDesigner } from './context';

function Btn({ onClick, disabled, title, children }: { onClick?: () => void; disabled?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm text-slate-300 transition-colors hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-1 h-5 w-px bg-white/10" />;

export function Toolbar({
  name,
  onRename,
  onSave,
  onPreview,
  onBack,
  onTemplates,
  saving,
}: {
  name: string;
  onRename: (v: string) => void;
  onSave: () => void;
  onPreview: () => void;
  onBack: () => void;
  onTemplates: () => void;
  saving: boolean;
}) {
  const d = useDesigner();
  const dims = paperDimsMm(d.design.paper);
  const sel = d.selected;
  const m = d.design.margins;

  function alignX(kind: 'left' | 'center' | 'right') {
    if (!sel) return;
    const x = kind === 'left' ? m.left : kind === 'right' ? dims.w - m.right - sel.w : (dims.w - sel.w) / 2;
    d.patchElement(sel.id, { x });
  }
  function alignY(kind: 'top' | 'middle' | 'bottom') {
    if (!sel) return;
    const y = kind === 'top' ? d.design.bands.headerHeight : kind === 'bottom' ? dims.h - d.design.bands.footerHeight - sel.h : (dims.h - sel.h) / 2;
    d.patchElement(sel.id, { y });
  }

  return (
    <div className="flex items-center gap-1 border-b border-white/10 bg-[#16181d] px-3 py-2">
      <button onClick={onBack} className="mr-1 flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-400 hover:bg-white/10 hover:text-white" title="Back to print settings">
        ← Back
      </button>
      <input
        value={name}
        onChange={(e) => onRename(e.target.value)}
        className="w-44 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm font-medium text-white focus:border-indigo-500 focus:outline-none"
        placeholder="Template name"
      />
      <Sep />

      <Btn onClick={d.undo} disabled={!d.canUndo} title="Undo (Ctrl+Z)">↶</Btn>
      <Btn onClick={d.redo} disabled={!d.canRedo} title="Redo (Ctrl+Y)">↷</Btn>
      <Sep />

      <Btn onClick={() => d.setZoom(Math.max(0.25, Math.round((d.zoom - 0.1) * 100) / 100))} title="Zoom out">−</Btn>
      <span className="w-12 text-center text-xs text-slate-400">{Math.round(d.zoom * 100)}%</span>
      <Btn onClick={() => d.setZoom(Math.min(3, Math.round((d.zoom + 0.1) * 100) / 100))} title="Zoom in">+</Btn>
      <Btn onClick={() => d.setZoom(1)} title="Reset zoom">⤢</Btn>
      <Sep />

      <Btn onClick={() => d.setShowGrid(!d.showGrid)} title="Toggle grid"><span className={d.showGrid ? 'text-indigo-400' : ''}>▦</span></Btn>
      <Btn onClick={() => d.patchDesign({ snap: !d.design.snap })} title="Toggle snap to grid"><span className={d.design.snap ? 'text-indigo-400' : ''}>⌖</span></Btn>
      <Sep />

      <Btn onClick={() => alignX('left')} disabled={!sel} title="Align left">⇤</Btn>
      <Btn onClick={() => alignX('center')} disabled={!sel} title="Center horizontally">⇔</Btn>
      <Btn onClick={() => alignX('right')} disabled={!sel} title="Align right">⇥</Btn>
      <Btn onClick={() => alignY('top')} disabled={!sel} title="Align top">⤒</Btn>
      <Btn onClick={() => alignY('middle')} disabled={!sel} title="Center vertically">⇕</Btn>
      <Btn onClick={() => alignY('bottom')} disabled={!sel} title="Align bottom">⤓</Btn>
      <Sep />

      <Btn onClick={() => d.duplicateSelected()} disabled={!d.selectedIds.length} title="Duplicate (Ctrl+D)">⧉</Btn>
      <Btn onClick={() => d.removeSelected()} disabled={!d.selectedIds.length} title="Delete (Del)">🗑</Btn>

      <div className="ml-auto flex items-center gap-2">
        <button onClick={onTemplates} className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10">Templates</button>
        <button onClick={onPreview} className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10">Preview PDF</button>
        <button onClick={onSave} disabled={saving} className="rounded-md bg-indigo-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-60">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
