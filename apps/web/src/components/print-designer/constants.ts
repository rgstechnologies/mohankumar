import type { DesignElement, ElementType, Zone } from '@bookly/shared';

/** Screen pixels per millimetre at 96dpi — keeps canvas == paper at 100%. */
export const PX_PER_MM = 96 / 25.4;

export interface PaletteItem {
  type: ElementType;
  label: string;
  icon: string; // single SVG path
  /** For images/qr — a preset src/field. */
  preset?: Partial<DesignElement>;
}

export interface PaletteGroup {
  group: string;
  items: PaletteItem[];
}

/** The left-sidebar component library. */
export const PALETTE: PaletteGroup[] = [
  {
    group: 'Basic',
    items: [
      { type: 'text', label: 'Text', icon: 'M4 7V5h16v2M9 5v14M15 5v14' },
      { type: 'heading', label: 'Heading', icon: 'M6 4v16M18 4v16M6 12h12' },
      { type: 'line', label: 'Line', icon: 'M4 12h16' },
      { type: 'rect', label: 'Rectangle', icon: 'M4 5h16v14H4z' },
      { type: 'ellipse', label: 'Ellipse', icon: 'M12 5c4.4 0 8 3.1 8 7s-3.6 7-8 7-8-3.1-8-7 3.6-7 8-7z' },
    ],
  },
  {
    group: 'Tables',
    items: [
      { type: 'itemTable', label: 'Item Table', icon: 'M4 5h16v14H4zM4 9h16M4 13h16M9 5v14M14 5v14' },
    ],
  },
  {
    group: 'Images & Codes',
    items: [
      { type: 'image', label: 'Logo', icon: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4', preset: { src: 'logo' } },
      { type: 'image', label: 'Image', icon: 'M4 5h16v14H4zM8 11a1.5 1.5 0 100-3 1.5 1.5 0 000 3M4 16l5-5 4 4 3-3 4 4' },
      { type: 'qr', label: 'QR Code', icon: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z', preset: { qr: { kind: 'qr', value: '' } } },
    ],
  },
];

let seq = 0;
function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  seq += 1;
  return `el-${Date.now()}-${seq}`;
}

/** A new element of the given type, positioned at (x,y) mm. */
export function makeElement(
  type: ElementType,
  x: number,
  y: number,
  zone: Zone,
  z: number,
  preset?: Partial<DesignElement>,
): DesignElement {
  const base: DesignElement = {
    id: uid(),
    type,
    x,
    y,
    w: 50,
    h: 10,
    zone,
    z,
    style: {},
  };
  switch (type) {
    case 'heading':
      return { ...base, w: 90, h: 12, text: 'Heading', style: { fontSize: 18, bold: true, color: '#0f172a' }, ...preset };
    case 'text':
      return { ...base, w: 60, h: 7, text: 'Text', style: { fontSize: 9, color: '#111111' }, ...preset };
    case 'line':
      return { ...base, w: 80, h: 0.4, style: { borderColor: '#94a3b8', borderWidth: 0.4 }, ...preset };
    case 'rect':
      return { ...base, w: 60, h: 30, style: { borderColor: '#cbd5e1', borderWidth: 0.3, bg: '#ffffff', borderRadius: 1 }, ...preset };
    case 'ellipse':
      return { ...base, w: 30, h: 30, style: { borderColor: '#cbd5e1', borderWidth: 0.3 }, ...preset };
    case 'image':
      return { ...base, w: 35, h: 20, style: {}, ...preset };
    case 'qr':
      return { ...base, w: 24, h: 24, style: {}, qr: { kind: 'qr', value: '' }, ...preset };
    case 'itemTable':
      return {
        ...base,
        w: 190,
        h: 50,
        style: {},
        table: {
          columns: [
            { key: 'srNo', label: '#', width: 1, align: 'center' },
            { key: 'itemName', label: 'Item', width: 6, align: 'left' },
            { key: 'hsn', label: 'HSN', width: 2, align: 'center' },
            { key: 'qty', label: 'Qty', width: 2, align: 'right' },
            { key: 'rate', label: 'Rate', width: 3, align: 'right' },
            { key: 'gstRate', label: 'GST%', width: 2, align: 'right' },
            { key: 'amount', label: 'Amount', width: 3, align: 'right' },
          ],
          zebra: true,
          headerBg: '#f1f5f9',
          headerColor: '#0f172a',
          zebraColor: '#f8fafc',
          borderColor: '#cbd5e1',
          rowHeight: 7,
          fontSize: 8,
        },
        ...preset,
      };
    default:
      return { ...base, ...preset };
  }
}
