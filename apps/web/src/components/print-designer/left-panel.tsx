'use client';

import { useMemo, useState } from 'react';
import {
  printFieldGroups,
  paperDimsMm,
  type ElementType,
  type Zone,
} from '@bookly/shared';
import { useDesigner } from './context';
import { PALETTE, makeElement } from './constants';
import { LayersPanel } from './layers-panel';

export function LeftPanel({ docKind = 'invoice' }: { docKind?: string }) {
  const d = useDesigner();
  const [tab, setTab] = useState<'elements' | 'fields' | 'layers'>('elements');
  const [q, setQ] = useState('');
  const fieldGroups = useMemo(() => printFieldGroups(docKind), [docKind]);

  function zoneFor(yMm: number): Zone {
    if (yMm < d.design.bands.headerHeight) return 'header';
    const dims = paperDimsMm(d.design.paper);
    if (yMm > dims.h - d.design.bands.footerHeight) return 'footer';
    return 'body';
  }

  function addAt(type: ElementType, preset?: Record<string, unknown>) {
    // drop near top-left of the body so it's immediately visible
    const x = 12;
    const y = d.design.bands.headerHeight + 8;
    const maxZ = d.design.elements.reduce((m, e) => Math.max(m, e.z), 0);
    d.addElement(makeElement(type, x, y, zoneFor(y), maxZ + 1, preset));
  }

  function addField(key: string, label: string) {
    const y = d.design.bands.headerHeight + 8;
    const maxZ = d.design.elements.reduce((m, e) => Math.max(m, e.z), 0);
    const el = makeElement('text', 12, y, zoneFor(y), maxZ + 1, {
      field: key,
      w: 60,
      h: 7,
      name: label,
      style: { fontSize: 9, color: '#111111' },
    });
    d.addElement(el);
  }

  const filteredGroups = useMemo(() => {
    if (!q.trim()) return fieldGroups;
    const needle = q.toLowerCase();
    return fieldGroups.map((g) => ({
      ...g,
      fields: g.fields.filter(
        (f) => f.label.toLowerCase().includes(needle) || f.key.toLowerCase().includes(needle),
      ),
    })).filter((g) => g.fields.length);
  }, [q, fieldGroups]);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-white/10 bg-[#16181d] text-slate-200">
      <div className="flex border-b border-white/10 text-sm">
        {(['elements', 'fields', 'layers'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 font-medium capitalize transition-colors ${
              tab === t ? 'border-b-2 border-indigo-500 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-3">
        {tab === 'layers' ? (
          <LayersPanel />
        ) : tab === 'elements' ? (
          <div className="space-y-5">
            {PALETTE.map((group) => (
              <div key={group.group}>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">{group.group}</p>
                <div className="grid grid-cols-2 gap-2">
                  {group.items.map((item) => (
                    <button
                      key={item.label}
                      onClick={() => addAt(item.type, item.preset as Record<string, unknown>)}
                      className="group flex flex-col items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 p-3 text-center transition-all hover:border-indigo-500/60 hover:bg-indigo-500/10"
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-slate-300 group-hover:text-indigo-300">
                        <path d={item.icon} />
                      </svg>
                      <span className="text-[11px] font-medium text-slate-300">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search fields…"
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
            />
            {filteredGroups.map((group) => (
              <div key={group.group}>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{group.group}</p>
                <div className="space-y-1">
                  {group.fields.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => addField(f.key, f.label)}
                      className="flex w-full items-center justify-between rounded-md border border-transparent px-2.5 py-1.5 text-left text-sm text-slate-300 transition-colors hover:border-indigo-500/40 hover:bg-indigo-500/10"
                    >
                      <span>{f.label}</span>
                      <span className="text-slate-500">+</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!filteredGroups.length && <p className="text-sm text-slate-500">No fields match.</p>}
          </div>
        )}
      </div>
    </aside>
  );
}
