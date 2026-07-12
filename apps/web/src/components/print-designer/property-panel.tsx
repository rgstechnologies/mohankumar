'use client';

import type {
  DesignElement,
  ElementStyle,
  PaperSize,
  PrintDesign,
} from '@bookly/shared';
import { useDesigner } from './context';

const PAPERS: PaperSize[] = ['A4', 'A5', 'Letter', 'Legal', 'Thermal58', 'Thermal80', 'Custom'];

export function PropertyPanel() {
  const d = useDesigner();
  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-auto border-l border-white/10 bg-[#16181d] text-slate-200">
      {d.selected ? <ElementProps el={d.selected} /> : <PageProps />}
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-white/10 p-3.5">
      <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{title}</p>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Num({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-slate-400">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-20 rounded border border-white/10 bg-white/5 px-2 py-1 text-right text-white focus:border-indigo-500 focus:outline-none"
      />
    </label>
  );
}

function Color({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-slate-400">
      <span>{label}</span>
      <span className="flex items-center gap-1.5">
        <input type="color" value={value ?? '#000000'} onChange={(e) => onChange(e.target.value)} className="h-6 w-8 cursor-pointer rounded border border-white/10 bg-transparent" />
        <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="w-16 rounded border border-white/10 bg-white/5 px-1.5 py-1 text-white focus:border-indigo-500 focus:outline-none" />
      </span>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 text-xs text-slate-400">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-indigo-500' : 'bg-white/15'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </label>
  );
}

function ElementProps({ el }: { el: DesignElement }) {
  const d = useDesigner();
  const set = (p: Partial<DesignElement>) => d.patchElement(el.id, p);
  const setStyle = (p: Partial<ElementStyle>) => d.patchElement(el.id, { style: p });
  const isText = el.type === 'text' || el.type === 'heading';

  return (
    <>
      <Section title="Content">
        {isText && (
          <>
            <textarea
              value={el.field ? '' : el.text ?? ''}
              placeholder={el.field ? `Bound to {${el.field}}` : 'Enter text…'}
              disabled={!!el.field}
              onChange={(e) => set({ text: e.target.value })}
              rows={2}
              className="w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none disabled:opacity-60"
            />
            {el.field ? (
              <button onClick={() => set({ field: undefined, text: el.name ?? 'Text' })} className="text-xs text-indigo-400 hover:underline">
                Unbind field ({el.field})
              </button>
            ) : (
              <p className="text-[11px] text-slate-500">Tip: insert dynamic data with {'{{field.key}}'} tokens, or add a field from the left panel.</p>
            )}
          </>
        )}
        {el.type === 'image' && (
          <label className="flex flex-col gap-1.5 text-xs text-slate-400">
            <span>Image source</span>
            <select value={el.src === 'logo' ? 'logo' : 'upload'} onChange={(e) => set({ src: e.target.value === 'logo' ? 'logo' : undefined })} className="rounded border border-white/10 bg-white/5 px-2 py-1 text-white focus:border-indigo-500 focus:outline-none">
              <option value="logo">Company logo</option>
              <option value="upload">Uploaded image</option>
            </select>
            {el.src !== 'logo' && (
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const r = new FileReader();
                  r.onload = () => set({ src: String(r.result) });
                  r.readAsDataURL(f);
                }}
                className="text-[11px] text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-indigo-500 file:px-2 file:py-1 file:text-white"
              />
            )}
          </label>
        )}
        {el.type === 'itemTable' && <TableColumnsEditor el={el} />}
        {!isText && el.type !== 'image' && el.type !== 'itemTable' && (
          <p className="text-[11px] text-slate-500">Shape — style it below.</p>
        )}
      </Section>

      <Section title="Position & Size">
        <div className="grid grid-cols-2 gap-2">
          <Num label="X" value={el.x} onChange={(v) => set({ x: v })} />
          <Num label="Y" value={el.y} onChange={(v) => set({ y: v })} />
          <Num label="W" value={el.w} onChange={(v) => set({ w: v })} />
          <Num label="H" value={el.h} onChange={(v) => set({ h: v })} />
        </div>
        <Num label="Rotation°" value={el.rotation ?? 0} onChange={(v) => set({ rotation: v })} />
      </Section>

      {isText && (
        <Section title="Typography">
          <Num label="Font size" value={el.style.fontSize ?? 9} onChange={(v) => setStyle({ fontSize: v })} />
          <Color label="Color" value={el.style.color} onChange={(v) => setStyle({ color: v })} />
          <div className="flex gap-1.5">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} onClick={() => setStyle({ align: a })} className={`flex-1 rounded border py-1 text-xs capitalize ${el.style.align === a ? 'border-indigo-500 bg-indigo-500/20 text-white' : 'border-white/10 text-slate-400'}`}>{a}</button>
            ))}
          </div>
          <Toggle label="Bold" checked={!!el.style.bold} onChange={(v) => setStyle({ bold: v })} />
          <Toggle label="Italic" checked={!!el.style.italic} onChange={(v) => setStyle({ italic: v })} />
          <Num label="Line height" value={el.style.lineHeight ?? 1.2} onChange={(v) => setStyle({ lineHeight: v })} step={0.1} />
        </Section>
      )}

      <Section title="Appearance">
        <Color label="Background" value={el.style.bg} onChange={(v) => setStyle({ bg: v })} />
        <Color label="Border" value={el.style.borderColor} onChange={(v) => setStyle({ borderColor: v })} />
        <Num label="Border width" value={el.style.borderWidth ?? 0} onChange={(v) => setStyle({ borderWidth: v })} step={0.1} />
        <Num label="Radius" value={el.style.borderRadius ?? 0} onChange={(v) => setStyle({ borderRadius: v })} step={0.5} />
        <Num label="Opacity" value={el.style.opacity ?? 1} onChange={(v) => setStyle({ opacity: Math.min(1, Math.max(0, v)) })} step={0.05} />
      </Section>

      <Section title="Arrange">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => d.bringForward(el.id)} className="rounded border border-white/10 py-1.5 text-xs text-slate-300 hover:bg-white/5">Bring front</button>
          <button onClick={() => d.sendBackward(el.id)} className="rounded border border-white/10 py-1.5 text-xs text-slate-300 hover:bg-white/5">Send back</button>
        </div>
        <Toggle label="Lock" checked={!!el.locked} onChange={(v) => set({ locked: v })} />
        <Toggle label="Hidden" checked={!!el.hidden} onChange={(v) => set({ hidden: v })} />
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          <span>Band</span>
          <select value={el.zone} onChange={(e) => set({ zone: e.target.value as DesignElement['zone'] })} className="rounded border border-white/10 bg-white/5 px-2 py-1 text-white focus:border-indigo-500 focus:outline-none">
            <option value="header">Header (repeats)</option>
            <option value="body">Body</option>
            <option value="footer">Footer (repeats)</option>
          </select>
        </label>
        <button onClick={() => d.removeSelected()} className="w-full rounded border border-red-500/30 bg-red-500/10 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20">Delete element</button>
      </Section>
    </>
  );
}

function TableColumnsEditor({ el }: { el: DesignElement }) {
  const d = useDesigner();
  const t = el.table!;
  const update = (cols: typeof t.columns) => d.patchElement(el.id, { table: { ...t, columns: cols } });
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-slate-500">Columns</p>
      {t.columns.map((c, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            value={c.label}
            onChange={(e) => update(t.columns.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
            className="min-w-0 flex-1 rounded border border-white/10 bg-white/5 px-1.5 py-1 text-xs text-white focus:border-indigo-500 focus:outline-none"
          />
          <input
            type="number"
            value={c.width}
            onChange={(e) => update(t.columns.map((x, j) => (j === i ? { ...x, width: parseFloat(e.target.value) || 1 } : x)))}
            className="w-12 rounded border border-white/10 bg-white/5 px-1 py-1 text-right text-xs text-white focus:border-indigo-500 focus:outline-none"
            title="Width weight"
          />
          <button onClick={() => update(t.columns.filter((_, j) => j !== i))} className="px-1 text-slate-500 hover:text-red-400" title="Remove column">×</button>
        </div>
      ))}
      <button onClick={() => update([...t.columns, { key: 'amount', label: 'Amount', width: 2, align: 'right' }])} className="text-xs text-indigo-400 hover:underline">+ Add column</button>
      <Toggle label="Zebra rows" checked={!!t.zebra} onChange={(v) => d.patchElement(el.id, { table: { ...t, zebra: v } })} />
    </div>
  );
}

function PageProps() {
  const d = useDesigner();
  const set = (p: Partial<PrintDesign>) => d.patchDesign(p);
  const wm = d.design.watermark!;
  return (
    <>
      <Section title="Paper">
        <label className="flex items-center justify-between gap-2 text-xs text-slate-400">
          <span>Size</span>
          <select value={d.design.paper.size} onChange={(e) => set({ paper: { ...d.design.paper, size: e.target.value as PaperSize } })} className="w-32 rounded border border-white/10 bg-white/5 px-2 py-1 text-white focus:border-indigo-500 focus:outline-none">
            {PAPERS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <div className="flex gap-1.5">
          {(['portrait', 'landscape'] as const).map((o) => (
            <button key={o} onClick={() => set({ paper: { ...d.design.paper, orientation: o } })} className={`flex-1 rounded border py-1 text-xs capitalize ${d.design.paper.orientation === o ? 'border-indigo-500 bg-indigo-500/20 text-white' : 'border-white/10 text-slate-400'}`}>{o}</button>
          ))}
        </div>
        {d.design.paper.size === 'Custom' && (
          <div className="grid grid-cols-2 gap-2">
            <Num label="W mm" value={d.design.paper.width ?? 210} onChange={(v) => set({ paper: { ...d.design.paper, width: v } })} />
            <Num label="H mm" value={d.design.paper.height ?? 297} onChange={(v) => set({ paper: { ...d.design.paper, height: v } })} />
          </div>
        )}
      </Section>

      <Section title="Bands (mm)">
        <Num label="Header height" value={d.design.bands.headerHeight} onChange={(v) => set({ bands: { ...d.design.bands, headerHeight: v } })} />
        <Num label="Footer height" value={d.design.bands.footerHeight} onChange={(v) => set({ bands: { ...d.design.bands, footerHeight: v } })} />
      </Section>

      <Section title="Grid">
        <Num label="Grid size mm" value={d.design.grid} onChange={(v) => set({ grid: Math.max(1, v) })} />
        <Toggle label="Snap to grid" checked={d.design.snap} onChange={(v) => set({ snap: v })} />
        <Toggle label="Show grid" checked={d.showGrid} onChange={d.setShowGrid} />
      </Section>

      <Section title="Watermark">
        <Toggle label="Enabled" checked={wm.enabled} onChange={(v) => set({ watermark: { ...wm, enabled: v } })} />
        <input value={wm.text} onChange={(e) => set({ watermark: { ...wm, text: e.target.value } })} className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white focus:border-indigo-500 focus:outline-none" />
        <Color label="Color" value={wm.color} onChange={(v) => set({ watermark: { ...wm, color: v } })} />
        <Num label="Opacity" value={wm.opacity} onChange={(v) => set({ watermark: { ...wm, opacity: v } })} step={0.05} />
        <Num label="Rotation°" value={wm.rotation} onChange={(v) => set({ watermark: { ...wm, rotation: v } })} />
        <label className="flex items-center justify-between gap-2 text-xs text-slate-400">
          <span>Show when</span>
          <select
            value={wm.condition ? `${wm.condition.field}:${wm.condition.value ?? ''}` : ''}
            onChange={(e) => {
              const val = e.target.value;
              if (!val) return set({ watermark: { ...wm, condition: undefined } });
              const [field, value] = val.split(':');
              set({ watermark: { ...wm, condition: { field, op: 'eq', value } } });
            }}
            className="w-36 rounded border border-white/10 bg-white/5 px-1.5 py-1 text-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Always</option>
            <option value="status:PAID">Status = Paid</option>
            <option value="status:ISSUED">Status = Unpaid</option>
            <option value="status:CANCELLED">Status = Cancelled</option>
          </select>
        </label>
      </Section>

      <Section title="Page numbers">
        <Toggle label="Show page numbers" checked={!!d.design.pageNumbers?.enabled} onChange={(v) => set({ pageNumbers: { enabled: v, format: d.design.pageNumbers?.format ?? 'Page {n} of {total}' } })} />
      </Section>
    </>
  );
}
