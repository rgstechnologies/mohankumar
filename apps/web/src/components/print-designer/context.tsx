'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type { DesignElement, PrintDesign } from '@bookly/shared';

type Mutator = (d: PrintDesign) => PrintDesign;

export interface DesignerApi {
  design: PrintDesign;
  selectedIds: string[];
  selected: DesignElement | null;
  zoom: number;
  showGrid: boolean;
  setZoom: (z: number) => void;
  setShowGrid: (v: boolean) => void;

  select: (id: string | null, additive?: boolean) => void;
  apply: (m: Mutator, record?: boolean) => void;
  beginChange: () => void;
  patchDesign: (p: Partial<PrintDesign>, record?: boolean) => void;
  patchElement: (id: string, p: Partial<DesignElement>, record?: boolean) => void;
  addElement: (e: DesignElement) => void;
  removeSelected: () => void;
  duplicateSelected: () => void;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;

  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const Ctx = createContext<DesignerApi | null>(null);

export function useDesigner(): DesignerApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDesigner must be used inside DesignerProvider');
  return v;
}

export function DesignerProvider({
  initial,
  children,
}: {
  initial: PrintDesign;
  children: React.ReactNode;
}) {
  const [design, setDesign] = useState<PrintDesign>(initial);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const past = useRef<PrintDesign[]>([]);
  const future = useRef<PrintDesign[]>([]);
  const [, force] = useReducer((x) => x + 1, 0);

  const apply = useCallback((m: Mutator, record = true) => {
    setDesign((prev) => {
      if (record) {
        past.current.push(prev);
        if (past.current.length > 60) past.current.shift();
        future.current = [];
      }
      return m(prev);
    });
    if (record) force();
  }, []);

  // Snapshot current state without changing it (called at the start of a drag).
  const beginChange = useCallback(() => {
    setDesign((prev) => {
      past.current.push(prev);
      if (past.current.length > 60) past.current.shift();
      future.current = [];
      return prev;
    });
    force();
  }, []);

  const patchDesign = useCallback(
    (p: Partial<PrintDesign>, record = true) => apply((d) => ({ ...d, ...p }), record),
    [apply],
  );

  const patchElement = useCallback(
    (id: string, p: Partial<DesignElement>, record = true) =>
      apply(
        (d) => ({
          ...d,
          elements: d.elements.map((e) =>
            e.id === id
              ? { ...e, ...p, style: p.style ? { ...e.style, ...p.style } : e.style }
              : e,
          ),
        }),
        record,
      ),
    [apply],
  );

  const addElement = useCallback(
    (e: DesignElement) => {
      apply((d) => ({ ...d, elements: [...d.elements, e] }));
      setSelectedIds([e.id]);
    },
    [apply],
  );

  const removeSelected = useCallback(() => {
    setSelectedIds((ids) => {
      if (ids.length) apply((d) => ({ ...d, elements: d.elements.filter((e) => !ids.includes(e.id)) }));
      return [];
    });
  }, [apply]);

  const duplicateSelected = useCallback(() => {
    setSelectedIds((ids) => {
      if (!ids.length) return ids;
      const copies: string[] = [];
      apply((d) => {
        const maxZ = d.elements.reduce((m, e) => Math.max(m, e.z), 0);
        const dupes = d.elements
          .filter((e) => ids.includes(e.id))
          .map((e, i) => {
            const nid =
              typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : `el-${Date.now()}-${i}`;
            copies.push(nid);
            return { ...e, id: nid, x: e.x + 5, y: e.y + 5, z: maxZ + 1 + i };
          });
        return { ...d, elements: [...d.elements, ...dupes] };
      });
      return copies;
    });
  }, [apply]);

  const bringForward = useCallback(
    (id: string) =>
      apply((d) => {
        const maxZ = d.elements.reduce((m, e) => Math.max(m, e.z), 0);
        return { ...d, elements: d.elements.map((e) => (e.id === id ? { ...e, z: maxZ + 1 } : e)) };
      }),
    [apply],
  );

  const sendBackward = useCallback(
    (id: string) =>
      apply((d) => {
        const minZ = d.elements.reduce((m, e) => Math.min(m, e.z), 0);
        return { ...d, elements: d.elements.map((e) => (e.id === id ? { ...e, z: minZ - 1 } : e)) };
      }),
    [apply],
  );

  const select = useCallback((id: string | null, additive = false) => {
    setSelectedIds((prev) => {
      if (id === null) return [];
      if (additive) return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      return [id];
    });
  }, []);

  const undo = useCallback(() => {
    setDesign((prev) => {
      const p = past.current.pop();
      if (!p) return prev;
      future.current.push(prev);
      return p;
    });
    force();
  }, []);

  const redo = useCallback(() => {
    setDesign((prev) => {
      const f = future.current.pop();
      if (!f) return prev;
      past.current.push(prev);
      return f;
    });
    force();
  }, []);

  const selected = useMemo(
    () => (selectedIds.length === 1 ? design.elements.find((e) => e.id === selectedIds[0]) ?? null : null),
    [selectedIds, design.elements],
  );

  const value = useMemo<DesignerApi>(
    () => ({
      design,
      selectedIds,
      selected,
      zoom,
      showGrid,
      setZoom,
      setShowGrid,
      select,
      apply,
      beginChange,
      patchDesign,
      patchElement,
      addElement,
      removeSelected,
      duplicateSelected,
      bringForward,
      sendBackward,
      undo,
      redo,
      canUndo: past.current.length > 0,
      canRedo: future.current.length > 0,
    }),
    [
      design, selectedIds, selected, zoom, showGrid, select, apply, beginChange,
      patchDesign, patchElement, addElement, removeSelected, duplicateSelected,
      bringForward, sendBackward, undo, redo,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
