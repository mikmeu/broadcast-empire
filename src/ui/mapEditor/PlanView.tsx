// The plan of the map editor (0.21.0, #284): the map as an SVG on whole tiles, north up, in the file's own coordinates.
// Draw with a tool by dragging (boxes, streets) or clicking (points); with Select, click to pick a thing, drag it to move it,
// drag a handle to change it, drag the background to move the plan. A change is made when the pointer is let go.

import { memo, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { SHAPE, addStreet, boundsOf, boxOf, itemsOf, move, put, resize, shownDirection, streetOf, stretchStreet, strokeOf, type Item, type Kind, type Ref } from '../../mods/mapDraft';
import type { Direction, MapFile, PlacedModel, TileBox, TileLane, TilePoint } from '../../mods/mapFile';
import { modelName, isStreet, type ToolId } from './tools';

/** What the plan is drawn with: the colours of the red, grey and green shapes of the old drawings, so a town is known at a glance. */
const FILL: Record<Exclude<Kind, 'lane'>, string> = {
  building: '#d9a066',
  alley: '#8f8f8f',
  mountains: '#a39a90',
  green: '#8fcf7a',
  concrete: '#cfcfcf',
  beach: '#ecdca6',
  water: '#6fb6e8',
  parking: '#7f8fb8',
  wing: '#e0605a',
  courtyardParking: '#7f8fb8',
  courtyardGreen: '#6fbf62',
  reception: '#b83a32',
  railway: '#5a4a3c',
  busStop: '#ffd23f',
  fountain: '#3b8fd9',
  tree: '#2f7d32',
  lamp: '#ffe066',
  model: '#c27d3a',
};

/** The order things are painted in, the ground first. */
const BOX_ORDER: Exclude<Kind, 'lane' | 'busStop' | 'fountain' | 'tree' | 'lamp' | 'model'>[] = ['water', 'beach', 'green', 'concrete', 'mountains', 'alley', 'building', 'parking', 'courtyardGreen', 'courtyardParking', 'wing', 'reception', 'railway'];
const POINT_ORDER: Extract<Kind, 'busStop' | 'fountain' | 'tree' | 'lamp' | 'model'>[] = ['busStop', 'fountain', 'tree', 'lamp', 'model'];

export interface PlanProps {
  file: MapFile;
  tool: ToolId;
  /** The model and the turn the "One house or building" tool puts down. */
  model: { file: string; turn: number };
  selected: Ref | null;
  onSelect: (ref: Ref | null) => void;
  onChange: (next: MapFile) => void;
}

type Drag =
  | { mode: 'draw'; from: TilePoint; to: TilePoint }
  | { mode: 'move'; ref: Ref; from: TilePoint; to: TilePoint }
  | { mode: 'resize'; ref: Ref; corner: 'nw' | 'ne' | 'sw' | 'se'; box: TileBox; to: TilePoint }
  | { mode: 'stretch'; ref: Ref; end: 'start' | 'end'; to: TilePoint }
  | { mode: 'pan'; at: { x: number; y: number }; view: View };

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Room round the map when the plan is fitted to it, in tiles. */
const MARGIN = 12;

const fitTo = (b: TileBox): View => ({ x: b.x - MARGIN, y: b.y - MARGIN, w: b.w + 2 * MARGIN, h: b.h + 2 * MARGIN });

/** The box a drag from one tile to another covers, both tiles included. */
const boxBetween = (a: TilePoint, b: TilePoint): TileBox => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x) + 1, h: Math.abs(b.y - a.y) + 1 });

/** A small arrow along a lane, pointing the way traffic goes. */
function Arrow({ lane, dir }: { lane: TileLane; dir: Direction }) {
  const vertical = lane.h > lane.w;
  const cx = lane.x + lane.w / 2;
  const cy = lane.y + lane.h / 2;
  const length = vertical ? lane.h : lane.w;
  const width = Math.min(lane.w, lane.h);
  if (dir === 'both') {
    return <line x1={vertical ? cx : lane.x} y1={vertical ? lane.y : cy} x2={vertical ? cx : lane.x + lane.w} y2={vertical ? lane.y + lane.h : cy} stroke="#f4f4f4" strokeWidth={0.18} strokeDasharray="1.2 1.2" vectorEffect="non-scaling-stroke" />;
  }
  const sign = dir === 'east' || dir === 'south' ? 1 : -1;
  const size = Math.min(width * 0.45, 1);
  const count = Math.max(1, Math.floor(length / 14));
  return (
    <g fill="#f4f4f4" stroke="none">
      {Array.from({ length: count }, (_, n) => {
        const along = (-length / 2 + ((n + 0.5) * length) / count) * 1;
        const x = vertical ? cx : cx + along;
        const y = vertical ? cy + along : cy;
        const tip = sign * size;
        const points = vertical ? `${x},${y + tip} ${x - size * 0.8},${y - tip * 0.6} ${x + size * 0.8},${y - tip * 0.6}` : `${x + tip},${y} ${x - tip * 0.6},${y - size * 0.8} ${x - tip * 0.6},${y + size * 0.8}`;
        return <polygon key={n} points={points} />;
      })}
    </g>
  );
}

/** Everything on the map, painted. It does not change while a drag is in progress, so it is not drawn again then. */
const Shapes = memo(function Shapes({ file, selected, interactive, onPick }: { file: MapFile; selected: Ref | null; interactive: boolean; onPick: (ref: Ref, e: ReactPointerEvent) => void }) {
  const { map, settings } = file;
  const street = selected?.kind === 'lane' ? new Set(streetOf(map, selected.index)) : null;
  const pointer = interactive ? undefined : ('none' as const);
  const pick = (kind: Kind, index: number) => ({ onPointerDown: (e: ReactPointerEvent) => onPick({ kind, index }, e), style: { pointerEvents: pointer, cursor: interactive ? 'pointer' : undefined } });
  const isSelected = (kind: Kind, index: number) => selected !== null && selected.kind === kind && selected.index === index;
  return (
    <g>
      {BOX_ORDER.map((kind) =>
        itemsOf(map, kind).map((item, index) => {
          const b = boxOf(item)!;
          const ground = kind === 'railway' && settings.railway === 'ground';
          return (
            <rect key={`${kind}${index}`} x={b.x} y={b.y} width={b.w} height={b.h} fill={FILL[kind]} fillOpacity={kind === 'railway' ? 0.85 : 0.9} stroke={isSelected(kind, index) ? '#000' : '#00000055'} strokeWidth={isSelected(kind, index) ? 2 : 1} strokeDasharray={kind === 'railway' && !ground ? '3 1.5' : kind === 'alley' ? '2 1' : undefined} vectorEffect="non-scaling-stroke" {...pick(kind, index)}>
              <title>{`${kind} ${b.w} × ${b.h}`}</title>
            </rect>
          );
        }),
      )}
      {map.lanes.map((lane, index) => (
        <g key={`l${index}`} {...pick('lane', index)}>
          <rect x={lane.x} y={lane.y} width={lane.w} height={lane.h} fill="#454545" stroke={street?.has(index) ? '#ffd23f' : '#222'} strokeWidth={street?.has(index) ? 2.5 : 1} vectorEffect="non-scaling-stroke">
            <title>{`lane ${lane.w} × ${lane.h}, ${shownDirection(map, index)}`}</title>
          </rect>
          <Arrow lane={lane} dir={shownDirection(map, index)} />
        </g>
      ))}
      {POINT_ORDER.map((kind) =>
        itemsOf(map, kind).map((item, index) => {
          const p = item as TilePoint;
          const chosen = isSelected(kind, index);
          return (
            <g key={`${kind}${index}`} {...pick(kind, index)}>
              {kind === 'model' ? (
                <>
                  <rect x={p.x} y={p.y} width={3} height={3} fill={FILL.model} stroke={chosen ? '#000' : '#fff'} strokeWidth={chosen ? 2 : 1} vectorEffect="non-scaling-stroke" />
                  <text x={p.x + 1.5} y={p.y + 1.9} fontSize={1} textAnchor="middle" fill="#fff" pointerEvents="none">{modelName((item as PlacedModel).model).split(' ').pop()}</text>
                </>
              ) : (
                <circle cx={p.x + 0.5} cy={p.y + 0.5} r={kind === 'tree' ? 1.3 : 1} fill={FILL[kind]} stroke={chosen ? '#000' : '#fff'} strokeWidth={chosen ? 2 : 1} vectorEffect="non-scaling-stroke" />
              )}
              <title>{kind}</title>
            </g>
          );
        }),
      )}
    </g>
  );
});

export function PlanView({ file, tool, model, selected, onSelect, onChange }: PlanProps) {
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>(() => fitTo(boundsOf(file.map)));
  const [drag, setDrag] = useState<Drag | null>(null);
  // The plan is fitted to a map when it is opened, not on every change.
  useEffect(() => setView(fitTo(boundsOf(file.map))), [file.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const tileAt = (e: { clientX: number; clientY: number }): TilePoint => {
    const element = svg.current!;
    const m = element.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: Math.floor(p.x), y: Math.floor(p.y) };
  };

  const drawing = tool !== 'select';
  const handle = Math.max(0.9, view.w / 90);

  const onPick = (ref: Ref, e: ReactPointerEvent) => {
    if (drawing) return;
    e.stopPropagation();
    svg.current?.setPointerCapture(e.pointerId);
    onSelect(ref);
    const at = tileAt(e);
    setDrag({ mode: 'move', ref, from: at, to: at });
  };

  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    svg.current?.setPointerCapture(e.pointerId);
    if (drawing) {
      const at = tileAt(e);
      setDrag({ mode: 'draw', from: at, to: at });
    } else {
      onSelect(null);
      setDrag({ mode: 'pan', at: { x: e.clientX, y: e.clientY }, view });
    }
  };

  const moved = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    if (drag.mode === 'pan') {
      const rect = svg.current!.getBoundingClientRect();
      const scale = Math.max(drag.view.w / rect.width, drag.view.h / rect.height);
      setView({ ...drag.view, x: drag.view.x - (e.clientX - drag.at.x) * scale, y: drag.view.y - (e.clientY - drag.at.y) * scale });
      return;
    }
    const to = tileAt(e);
    if (to.x !== drag.to.x || to.y !== drag.to.y) setDrag({ ...drag, to });
  };

  const up = () => {
    const done = drag;
    setDrag(null);
    if (!done || done.mode === 'pan') return;
    if (done.mode === 'draw') {
      if (isStreet(tool)) return onChange(addStreet(file, done.from, done.to, tool));
      const kind = tool as Exclude<Kind, 'lane'>;
      if (SHAPE[kind].shape === 'point') {
        const at = done.to;
        return onChange(put(file, kind, kind === 'model' ? { x: at.x, y: at.y, model: model.file, turn: model.turn } : at));
      }
      return onChange(put(file, kind, boxBetween(done.from, done.to)));
    }
    if (done.mode === 'move') {
      const dx = done.to.x - done.from.x;
      const dy = done.to.y - done.from.y;
      if (dx !== 0 || dy !== 0) onChange(move(file, done.ref, dx, dy));
      return;
    }
    if (done.mode === 'resize') return onChange(resize(file, done.ref, resizedBox(done)));
    const lane = file.map.lanes[done.ref.index]!;
    const vertical = lane.h > lane.w;
    const [start, end] = spanOf(file, done.ref.index);
    const at = vertical ? done.to.y : done.to.x;
    if (done.end === 'start') onChange(stretchStreet(file, done.ref.index, Math.min(at, end - 1), end));
    else onChange(stretchStreet(file, done.ref.index, start, Math.max(at + 1, start + 1)));
  };

  const zoom = (factor: number, around?: { x: number; y: number }) => {
    const cx = around?.x ?? view.x + view.w / 2;
    const cy = around?.y ?? view.y + view.h / 2;
    const w = Math.min(2000, Math.max(12, view.w * factor));
    const h = (view.h / view.w) * w;
    setView({ x: cx - ((cx - view.x) / view.w) * w, y: cy - ((cy - view.y) / view.h) * h, w, h });
  };

  // Only the box being worked on is drawn on top of the plan, so the plan itself is not drawn again at every step of a drag.
  const ghost = useMemo(() => {
    if (!drag || drag.mode === 'pan') return null;
    if (drag.mode === 'draw') {
      if (isStreet(tool)) return { kind: 'street' as const, ...strokeOf(drag.from, drag.to) };
      if (SHAPE[tool as Kind].shape === 'point') return { kind: 'point' as const, at: drag.to };
      return { kind: 'box' as const, box: boxBetween(drag.from, drag.to) };
    }
    return null;
  }, [drag, tool]);

  const chosen = selected ? itemsOf(file.map, selected.kind)[selected.index] : undefined;
  const moving = drag?.mode === 'move' ? { dx: drag.to.x - drag.from.x, dy: drag.to.y - drag.from.y } : { dx: 0, dy: 0 };
  const resizing = drag?.mode === 'resize' ? resizedBox(drag) : null;

  return (
    <div className="me-plan-wrap">
      <svg
        ref={svg}
        className={drawing ? 'me-plan drawing' : 'me-plan'}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        role="img"
        aria-label="Plan of the map, north up, one square a tile"
        onPointerDown={down}
        onPointerMove={moved}
        onPointerUp={up}
        onPointerCancel={() => setDrag(null)}
        onWheel={(e) => {
          const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse());
          zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, p);
        }}
      >
        <Grid view={view} />
        <Shapes file={file} selected={selected} interactive={!drawing} onPick={onPick} />
        {chosen && selected && !drawing && (
          <Selection file={file} selected={selected} item={chosen} handle={handle} moving={moving} resizing={resizing} onHandle={(next, e) => { e.stopPropagation(); svg.current?.setPointerCapture(e.pointerId); setDrag(next); }} />
        )}
        {ghost?.kind === 'box' && <rect x={ghost.box.x} y={ghost.box.y} width={ghost.box.w} height={ghost.box.h} fill="#ffffff55" stroke="#000" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
        {ghost?.kind === 'point' && <circle cx={ghost.at.x + 0.5} cy={ghost.at.y + 0.5} r={1.2} fill="#ffffff88" stroke="#000" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
        {ghost?.kind === 'street' && <StreetGhost stroke={ghost} />}
        {drag?.mode === 'draw' && <text x={Math.min(drag.from.x, drag.to.x)} y={Math.min(drag.from.y, drag.to.y) - 0.6} fontSize={Math.max(1.2, view.w / 70)} fill="#000" pointerEvents="none">{ghostLabel(drag, tool)}</text>}
      </svg>
      <div className="me-zoom" role="group" aria-label="Zoom the plan">
        <button type="button" onClick={() => zoom(1 / 1.3)} aria-label="Zoom in" title="Zoom in">+</button>
        <button type="button" onClick={() => zoom(1.3)} aria-label="Zoom out" title="Zoom out">−</button>
        <button type="button" onClick={() => setView(fitTo(boundsOf(file.map)))} title="Fit the whole map in the plan">Fit</button>
      </div>
    </div>
  );
}

const ghostLabel = (drag: Extract<Drag, { mode: 'draw' }>, tool: ToolId): string => {
  if (isStreet(tool)) {
    const s = strokeOf(drag.from, drag.to);
    return `${s.length} tiles ${s.vertical ? (s.forward ? 'south' : 'north') : s.forward ? 'east' : 'west'}`;
  }
  const b = boxBetween(drag.from, drag.to);
  return SHAPE[tool as Kind]?.shape === 'point' ? `${drag.to.x}, ${drag.to.y}` : `${b.w} × ${b.h}`;
};

/** The street being dragged, as the lane tool will put it down (one box over its stroke). */
function StreetGhost({ stroke }: { stroke: ReturnType<typeof strokeOf> }) {
  const box = stroke.vertical ? { x: stroke.at, y: stroke.start, w: 2, h: stroke.length } : { x: stroke.start, y: stroke.at, w: stroke.length, h: 2 };
  return <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="#ffffff55" stroke="#000" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" pointerEvents="none" />;
}

/** The faint lines every ten tiles, and a stronger one through the origin. */
function Grid({ view }: { view: View }) {
  const lines: ReactElement[] = [];
  const step = view.w > 400 ? 50 : 10;
  for (let x = Math.ceil(view.x / step) * step; x < view.x + view.w; x += step) lines.push(<line key={`x${x}`} x1={x} y1={view.y} x2={x} y2={view.y + view.h} stroke={x === 0 ? '#00000066' : '#00000020'} vectorEffect="non-scaling-stroke" />);
  for (let y = Math.ceil(view.y / step) * step; y < view.y + view.h; y += step) lines.push(<line key={`y${y}`} x1={view.x} y1={y} x2={view.x + view.w} y2={y} stroke={y === 0 ? '#00000066' : '#00000020'} vectorEffect="non-scaling-stroke" />);
  return (
    <g pointerEvents="none">
      <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="#f3efe6" />
      {lines}
    </g>
  );
}

/** The street's span along its own axis: the start and end tile of its lanes together. */
function spanOf(file: MapFile, index: number): [number, number] {
  const lanes = streetOf(file.map, index).map((n) => file.map.lanes[n]!);
  const vertical = file.map.lanes[index]!.h > file.map.lanes[index]!.w;
  return vertical ? [Math.min(...lanes.map((l) => l.y)), Math.max(...lanes.map((l) => l.y + l.h))] : [Math.min(...lanes.map((l) => l.x)), Math.max(...lanes.map((l) => l.x + l.w))];
}

/** The box a corner drag leaves: the opposite corner stays, the dragged one goes to the tile under the pointer. */
function resizedBox(drag: Extract<Drag, { mode: 'resize' }>): TileBox {
  const { box, corner, to } = drag;
  const west = corner === 'nw' || corner === 'sw';
  const north = corner === 'nw' || corner === 'ne';
  const x0 = west ? Math.min(to.x, box.x + box.w - 1) : box.x;
  const x1 = west ? box.x + box.w : Math.max(to.x + 1, box.x + 1);
  const y0 = north ? Math.min(to.y, box.y + box.h - 1) : box.y;
  const y1 = north ? box.y + box.h : Math.max(to.y + 1, box.y + 1);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The outline round the selected thing, as it will be when let go, and the handles to change it with. */
function Selection({ file, selected, item, handle, moving, resizing, onHandle }: { file: MapFile; selected: Ref; item: Item; handle: number; moving: { dx: number; dy: number }; resizing: TileBox | null; onHandle: (drag: Drag, e: ReactPointerEvent) => void }) {
  const { kind, index } = selected;
  if (kind === 'lane') {
    const lanes = streetOf(file.map, index).map((n) => file.map.lanes[n]!);
    const lane = file.map.lanes[index]!;
    const vertical = lane.h > lane.w;
    const x0 = Math.min(...lanes.map((l) => l.x));
    const y0 = Math.min(...lanes.map((l) => l.y));
    const box = { x: x0 + moving.dx, y: y0 + moving.dy, w: Math.max(...lanes.map((l) => l.x + l.w)) - x0, h: Math.max(...lanes.map((l) => l.y + l.h)) - y0 };
    const [start, end] = spanOf(file, index);
    // (Each handle knows the tile it stands for: the street's first tile, or its last.)
    const ends = vertical
      ? [{ end: 'start' as const, x: box.x + box.w / 2, y: start + moving.dy, tile: { x: x0, y: start } }, { end: 'end' as const, x: box.x + box.w / 2, y: end + moving.dy, tile: { x: x0, y: end - 1 } }]
      : [{ end: 'start' as const, x: start + moving.dx, y: box.y + box.h / 2, tile: { x: start, y: y0 } }, { end: 'end' as const, x: end + moving.dx, y: box.y + box.h / 2, tile: { x: end - 1, y: y0 } }];
    return (
      <g>
        <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="none" stroke="#000" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        {ends.map((h) => (
          <rect key={h.end} x={h.x - handle / 2} y={h.y - handle / 2} width={handle} height={handle} fill="#fff" stroke="#000" vectorEffect="non-scaling-stroke" style={{ cursor: 'grab' }} onPointerDown={(e) => onHandle({ mode: 'stretch', ref: selected, end: h.end, to: h.tile }, e)}>
            <title>{h.end === 'start' ? 'Drag to change where the street begins' : 'Drag to change where the street ends'}</title>
          </rect>
        ))}
      </g>
    );
  }
  const b = boxOf(item);
  if (!b) {
    const p = item as TilePoint;
    return <circle cx={p.x + 0.5 + moving.dx} cy={p.y + 0.5 + moving.dy} r={1.8} fill="none" stroke="#000" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" pointerEvents="none" />;
  }
  const shown = resizing ?? { x: b.x + moving.dx, y: b.y + moving.dy, w: b.w, h: b.h };
  const corners = [
    { corner: 'nw' as const, x: shown.x, y: shown.y },
    { corner: 'ne' as const, x: shown.x + shown.w, y: shown.y },
    { corner: 'sw' as const, x: shown.x, y: shown.y + shown.h },
    { corner: 'se' as const, x: shown.x + shown.w, y: shown.y + shown.h },
  ];
  return (
    <g>
      <rect x={shown.x} y={shown.y} width={shown.w} height={shown.h} fill="none" stroke="#000" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" pointerEvents="none" />
      {'model' in item ? null : corners.map((c) => (
        <rect key={c.corner} x={c.x - handle / 2} y={c.y - handle / 2} width={handle} height={handle} fill="#fff" stroke="#000" vectorEffect="non-scaling-stroke" style={{ cursor: 'nwse-resize' }} onPointerDown={(e) => onHandle({ mode: 'resize', ref: selected, corner: c.corner, box: b, to: { x: c.corner.endsWith('e') ? c.x - 1 : c.x, y: c.corner.startsWith('s') ? c.y - 1 : c.y } }, e)}>
          <title>Drag to change the size</title>
        </rect>
      ))}
    </g>
  );
}
