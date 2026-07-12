'use client';

import { useDesigner } from './context';

const TYPE_LABEL: Record<string, string> = {
  text: 'Text',
  heading: 'Heading',
  line: 'Line',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  image: 'Image',
  qr: 'QR Code',
  itemTable: 'Item Table',
};

export function LayersPanel() {
  const d = useDesigner();
  // top of the list = front-most (highest z)
  const ordered = [...d.design.elements].sort((a, b) => b.z - a.z);

  return (
    <div className="space-y-1">
      {!ordered.length && <p className="text-sm text-slate-500">No layers yet — add elements from the Elements tab.</p>}
      {ordered.map((el) => {
        const selected = d.selectedIds.includes(el.id);
        return (
          <div
            key={el.id}
            onClick={(e) => d.select(el.id, e.shiftKey)}
            className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${
              selected ? 'border-indigo-500 bg-indigo-500/15 text-white' : 'border-transparent text-slate-300 hover:bg-white/5'
            }`}
          >
            <span className="truncate flex-1">{el.name || TYPE_LABEL[el.type] || el.type}</span>
            <button
              onClick={(e) => { e.stopPropagation(); d.patchElement(el.id, { hidden: !el.hidden }); }}
              className={`text-xs ${el.hidden ? 'text-slate-600' : 'text-slate-400 hover:text-white'}`}
              title={el.hidden ? 'Show' : 'Hide'}
            >
              {el.hidden ? '🙈' : '👁'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); d.patchElement(el.id, { locked: !el.locked }); }}
              className={`text-xs ${el.locked ? 'text-amber-400' : 'text-slate-400 hover:text-white'}`}
              title={el.locked ? 'Unlock' : 'Lock'}
            >
              {el.locked ? '🔒' : '🔓'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
