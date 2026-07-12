'use client';

import { useRef } from 'react';
import { paperDimsMm, type DesignElement } from '@bookly/shared';
import { useDesigner } from './context';
import { PX_PER_MM } from './constants';

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type Handle = (typeof HANDLES)[number];

export function Canvas() {
  const d = useDesigner();
  const scale = PX_PER_MM * d.zoom;
  const dims = paperDimsMm(d.design.paper);
  const pageW = dims.w * scale;
  const pageH = dims.h * scale;
  const grid = d.design.grid;
  const snap = (v: number) => (d.design.snap ? Math.round(v / grid) * grid : v);

  const elements = [...d.design.elements].sort((a, b) => a.z - b.z);

  return (
    <div className="flex-1 overflow-auto bg-[#0f1115] p-10" onPointerDown={(e) => { if (e.target === e.currentTarget) d.select(null); }}>
      <div className="mx-auto" style={{ width: pageW }} onPointerDown={(e) => { if (e.target === e.currentTarget) d.select(null); }}>
        <div
          className="relative shadow-2xl"
          style={{
            width: pageW,
            height: pageH,
            background: d.design.background ?? '#ffffff',
            backgroundImage: d.showGrid
              ? `linear-gradient(to right, rgba(99,102,241,.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(99,102,241,.12) 1px, transparent 1px)`
              : undefined,
            backgroundSize: d.showGrid ? `${grid * scale}px ${grid * scale}px` : undefined,
          }}
          onPointerDown={(e) => { if (e.target === e.currentTarget) d.select(null); }}
        >
          {/* header / footer band guides */}
          <Band y={d.design.bands.headerHeight * scale} label="Header" />
          <Band y={pageH - d.design.bands.footerHeight * scale} label="Footer" top />

          {elements.map((el) => (
            <ElementBox key={el.id} el={el} scale={scale} snap={snap} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Band({ y, label, top }: { y: number; label: string; top?: boolean }) {
  return (
    <div className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-indigo-300/40" style={{ top: y }}>
      <span className={`absolute left-1 text-[9px] font-semibold uppercase tracking-wide text-indigo-400/70 ${top ? '-top-3' : 'top-0.5'}`}>{label}</span>
    </div>
  );
}

function ElementBox({
  el,
  scale,
  snap,
}: {
  el: DesignElement;
  scale: number;
  snap: (v: number) => number;
}) {
  const d = useDesigner();
  const selected = d.selectedIds.includes(el.id);
  const drag = useRef<{ sx: number; sy: number; ex: number; ey: number } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    if (el.locked) { d.select(el.id, e.shiftKey); return; }
    e.stopPropagation();
    d.select(el.id, e.shiftKey);
    d.beginChange();
    drag.current = { sx: e.clientX, sy: e.clientY, ex: el.x, ey: el.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const dx = (e.clientX - drag.current.sx) / scale;
    const dy = (e.clientY - drag.current.sy) / scale;
    d.patchElement(el.id, { x: snap(drag.current.ex + dx), y: snap(drag.current.ey + dy) }, false);
  }
  function onPointerUp(e: React.PointerEvent) {
    drag.current = null;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* */ }
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={`absolute ${el.locked ? 'cursor-not-allowed' : 'cursor-move'} ${selected ? 'outline outline-2 outline-indigo-500' : 'hover:outline hover:outline-1 hover:outline-indigo-300/60'}`}
      style={{
        left: el.x * scale,
        top: el.y * scale,
        width: Math.max(el.w * scale, 2),
        height: Math.max(el.h * scale, 2),
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        opacity: el.style.opacity ?? 1,
        zIndex: el.z,
      }}
    >
      <ElementContent el={el} scale={scale} />
      {selected && !el.locked && HANDLES.map((h) => <ResizeHandle key={h} h={h} el={el} scale={scale} snap={snap} />)}
    </div>
  );
}

function ResizeHandle({
  h,
  el,
  scale,
  snap,
}: {
  h: Handle;
  el: DesignElement;
  scale: number;
  snap: (v: number) => number;
}) {
  const d = useDesigner();
  const start = useRef<{ mx: number; my: number; x: number; y: number; w: number; hh: number } | null>(null);

  const pos: Record<Handle, string> = {
    nw: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
    n: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize',
    ne: 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
    e: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
    se: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
    s: 'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize',
    sw: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
    w: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
  };

  function down(e: React.PointerEvent) {
    e.stopPropagation();
    d.beginChange();
    start.current = { mx: e.clientX, my: e.clientY, x: el.x, y: el.y, w: el.w, hh: el.h };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (!start.current) return;
    const s = start.current;
    const dx = (e.clientX - s.mx) / scale;
    const dy = (e.clientY - s.my) / scale;
    let { x, y, w, hh } = s;
    if (h.includes('e')) w = Math.max(2, s.w + dx);
    if (h.includes('s')) hh = Math.max(1, s.hh + dy);
    if (h.includes('w')) { w = Math.max(2, s.w - dx); x = s.x + dx; }
    if (h.includes('n')) { hh = Math.max(1, s.hh - dy); y = s.y + dy; }
    d.patchElement(el.id, { x: snap(x), y: snap(y), w: snap(w), h: snap(hh) }, false);
  }
  function up(e: React.PointerEvent) {
    start.current = null;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* */ }
  }

  return (
    <div
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      className={`absolute h-2.5 w-2.5 rounded-sm border border-indigo-500 bg-white ${pos[h]}`}
    />
  );
}

function ElementContent({ el, scale }: { el: DesignElement; scale: number }) {
  const s = el.style;
  const common: React.CSSProperties = {
    width: '100%',
    height: '100%',
    color: s.color,
    fontSize: (s.fontSize ?? 9) * scale * 0.353, // pt → px at this scale (1pt≈0.353mm)
    fontWeight: s.bold ? 700 : 400,
    fontStyle: s.italic ? 'italic' : undefined,
    textAlign: s.align,
    lineHeight: s.lineHeight ?? 1.2,
    letterSpacing: s.letterSpacing ? `${s.letterSpacing}px` : undefined,
  };

  switch (el.type) {
    case 'text':
    case 'heading':
      return (
        <div style={{ ...common, overflow: 'hidden', padding: (s.padding ?? 0.5) * scale }}>
          {el.field ? `{${el.field}}` : el.text}
        </div>
      );
    case 'line':
      return (
        <div style={{ width: '100%', height: '100%', background: s.borderColor ?? s.color ?? '#000', minHeight: 1, minWidth: 1 }} />
      );
    case 'rect':
      return (
        <div style={{ width: '100%', height: '100%', background: s.bg, border: s.borderColor ? `${(s.borderWidth ?? 0.3) * scale}px solid ${s.borderColor}` : undefined, borderRadius: (s.borderRadius ?? 0) * scale }} />
      );
    case 'ellipse':
      return (
        <div style={{ width: '100%', height: '100%', background: s.bg, border: s.borderColor ? `${(s.borderWidth ?? 0.3) * scale}px solid ${s.borderColor}` : undefined, borderRadius: '50%' }} />
      );
    case 'image':
      return el.src && el.src !== 'logo' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={el.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-slate-100 text-[10px] font-semibold text-slate-400">
          {el.src === 'logo' ? 'COMPANY LOGO' : 'IMAGE'}
        </div>
      );
    case 'qr':
      return (
        <div className="flex h-full w-full items-center justify-center bg-slate-900 text-white">
          <svg width="60%" height="60%" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" /></svg>
        </div>
      );
    case 'itemTable':
      return <TablePreview el={el} scale={scale} />;
    default:
      return null;
  }
}

function TablePreview({ el, scale }: { el: DesignElement; scale: number }) {
  const t = el.table!;
  const fs = (t.fontSize ?? 8) * scale * 0.353;
  const sample = [
    { srNo: '1', itemName: 'Cotton Fabric 40s', hsn: '5208', qty: '50', rate: '120.00', gstRate: '5%', amount: '6,300.00', description: 'Cotton Fabric 40s', unit: 'PCS', taxable: '6,000.00', tax: '300.00', discount: '0' },
    { srNo: '2', itemName: 'Stitching charges', hsn: '9988', qty: '1', rate: '2,000.00', gstRate: '12%', amount: '2,240.00', description: 'Stitching charges', unit: 'JOB', taxable: '2,000.00', tax: '240.00', discount: '0' },
  ];
  return (
    <table className="h-full w-full border-collapse" style={{ fontSize: fs }}>
      <thead>
        <tr style={{ background: t.headerBg ?? '#f1f5f9', color: t.headerColor ?? '#0f172a' }}>
          {t.columns.map((c) => (
            <th key={c.key} style={{ textAlign: c.align ?? 'left', padding: '2px 4px', border: `1px solid ${t.borderColor ?? '#cbd5e1'}`, fontWeight: 700 }}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sample.map((row, i) => (
          <tr key={i} style={{ background: t.zebra && i % 2 === 1 ? t.zebraColor ?? '#f8fafc' : undefined }}>
            {t.columns.map((c) => (
              <td key={c.key} style={{ textAlign: c.align ?? 'left', padding: '2px 4px', border: `1px solid ${t.borderColor ?? '#cbd5e1'}`, color: '#334155' }}>
                {(row as Record<string, string>)[c.key] ?? ''}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
