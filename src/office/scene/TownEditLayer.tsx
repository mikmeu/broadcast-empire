// The 3D map editor's layer over the town (0.21.0, #328): a pointer sheet at street level, a see-through model that snaps to a tile and turns, the
// outline of the tile under the pointer, boxes that catch a click on a house, tree, lamp, hill or peak, a box dragged for ground or a fill, and the
// camera's wheel zoom and drag. It follows the drawing of rooms in Floor.tsx (`DrawingLayer`, `ghostMaterials`). The hover lives in here, so the town
// itself (which is memoised) is not drawn again when the pointer moves.

import { useThree, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { NATURE } from '../assets';
import { PAVEMENT } from '../clearance';
import { modelOf, placedAt, streetLevel } from '../city';
import { Shape, ViewTurn, usePointerCursor, useRedraw } from './frame';
import { KitModel, NatureModel } from './Town';
import { RouteOverlayView, WAY_COLOUR, ribbonsOf } from './RouteOverlay';
import { nodesOf, type LayerId, type RouteOverlay, type WayLine } from '../routeOverlay';
import { StreetLamp } from './StreetLamp';
import type { Materials } from './materials';
import type { Building } from '../../config/office';
import { MAP_GRID, WAY_KINDS, type MapBox, type MapFile, type MapSpot } from '../../mods/mapFile';
import { bodyOf, fillPlan, footprintOf, hiddenThings, paintProblem, placeProblem, thingAt, type Brush, type Kind, type PaintKind, type Ref } from '../../mods/townDraft';
import { STRUCTURE_TOOLS, addWalk, applyTool, countDecor, dragHandle, handlesOf, movePart, partBox, partsOf, walkStretchProblem, wayHandles, cornersOfWay, type Handle, type PartKind, type PartRef, type StructureTool, type ToolOptions } from '../../mods/townStructure';

/** What the editor's tools do on the town: the decor (#328) and the structure (#329). */
export type EditTool = 'select' | 'house' | 'prop' | 'boat' | 'tree' | 'lamp' | 'hill' | 'fill' | 'ground' | 'walk' | StructureTool;

/** The tools that are a box (or a road) dragged, and those that are a click. */
const DRAGGED: readonly EditTool[] = ['road', 'block', 'edge', 'rail', 'wing', 'reception', 'lot', 'strip', 'green'];
const CLICKED: readonly EditTool[] = ['bus', 'taxi', 'fountain', 'via'];

/** How a part of the structure is drawn on the street, and how high its box stands: what lies above is picked first. */
const PART_LOOK: Record<PartKind, { colour: string; level: number }> = {
  edge: { colour: '#9aa0a6', level: 0.19 },
  block: { colour: '#7fb069', level: 0.2 },
  road: { colour: '#e2c044', level: 0.24 },
  rail: { colour: '#b07fd6', level: 0.26 },
  wing: { colour: '#4a90d9', level: 0.28 },
  reception: { colour: '#2fbfbf', level: 0.3 },
  lot: { colour: '#e8833a', level: 0.32 },
  strip: { colour: '#d9a441', level: 0.34 },
  green: { colour: '#5fbf5f', level: 0.34 },
  bus: { colour: '#ff5a5f', level: 0.4 },
  taxi: { colour: '#ffd23f', level: 0.4 },
  fountain: { colour: '#6ec6ff', level: 0.4 },
  via: { colour: '#ff9aa0', level: 0.41 },
  walk: { colour: '#f72585', level: 0.38 },
  way: { colour: WAY_COLOUR, level: 0.39 },
};

/** The model that is on the pointer for each tool that puts one down, and how it is turned and scaled. */
export interface EditModel {
  house: string;
  prop: string;
  boat: string;
  tree: string;
  hill: string;
  turn: number;
  hillScale: number;
}

export interface TownEditProps {
  file: MapFile;
  tool: EditTool;
  model: EditModel;
  paint: PaintKind;
  brush: Brush;
  selected: Ref | null;
  /** The view of the picture (see `MapView` in previews.tsx), which the wheel and the drag change. */
  view: { turn: number; zoom: number; x: number; y: number };
  onView: (view: { turn: number; zoom: number; x: number; y: number }) => void;
  onSelect: (ref: Ref | null) => void;
  /** A click with a model on the pointer: where to put it (the middle of the tile, or free with Shift). */
  onPlace: (kind: Kind, at: { x: number; z: number }) => void;
  /** A thing dragged to a new place. */
  onMove: (ref: Ref, to: { x: number; z: number }) => void;
  onPaint: (box: MapBox) => void;
  /** A box dragged for the fill brush, with the seed this stroke picks from. */
  onFill: (box: MapBox, seed: number) => void;
  /** What the pointer is over: why the model cannot stand there, or how many a fill would put down. Said when it changes. */
  onNote: (note: string | null) => void;
  /** Whether the town is also drawn with what the game leaves out from this side (marked with an amber ring). */
  showHidden: boolean;
  materials: Materials;
  /** What the tools of the structure draw with: the road options and the kind of a block. */
  options: ToolOptions;
  selectedPart: PartRef | null;
  onSelectPart: (ref: PartRef | null) => void;
  /** A tool of the structure, a part moved or a grip dragged, finished: the new file. */
  onEdit: (next: MapFile) => void;
  /** A tool of the structure that refuses what was dragged, with the reason. */
  onRefuse: (reason: string) => void;
  /** Why the map would not pass the check if this were so (null if it would), run each time a candidate reaches a new tile. */
  candidateProblem: (next: MapFile) => string | null;
  /** What the game generates from the roads (#330), which layers of it are shown, and the spot the map check marks (null if it marks none). */
  overlay: RouteOverlay | null;
  layers: Readonly<Record<LayerId, boolean>>;
  marker: MapSpot | null;
}

const GROUND_COLOURS: Record<PaintKind, string> = { grass: '#5f9e4a', field: '#c9b458', water: '#4a8fc2', sand: '#e4cf94', concrete: '#a8a8a8', asphalt: '#3a3a3a', base: '#5f9e4a' };
const STEP = 1;
const tileOf = (n: number) => Math.floor(n) + 0.5;

/** The point on the street, from where the pointer is: the middle of the tile, or free to 2 decimals with Shift. */
const spotAt = (p: { x: number; z: number }, free: boolean) => (free ? { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 } : { x: tileOf(p.x), z: tileOf(p.z) });
const clampTile = (n: number) => Math.max(-MAP_GRID, Math.min(MAP_GRID - STEP, Math.floor(n)));
const between = (a: [number, number], b: [number, number]): MapBox => ({ x: Math.min(a[0], b[0]), z: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]) + 1, d: Math.abs(a[1] - b[1]) + 1 });

export function TownEditLayer(props: TownEditProps) {
  const { file, tool, model, paint, brush, selected, view, onView, onSelect, onPlace, onMove, onPaint, onFill, onNote, showHidden, materials } = props;
  const { options, selectedPart, onSelectPart, onEdit, onRefuse, candidateProblem, overlay, layers, marker } = props;
  const building = useContext(Shape);
  const viewTurn = useContext(ViewTurn);
  const depth = streetLevel(building.floors + 1);
  const canvas = useThree((s) => s.gl.domElement);
  const [hover, setHover] = useState<{ x: number; z: number; free: boolean } | null>(null);
  const [box, setBox] = useState<{ from: [number, number]; to: [number, number]; seed: number } | null>(null);
  const [moving, setMoving] = useState<{ ref: Ref; grab: { x: number; z: number } | null; by: { x: number; z: number } } | null>(null);
  // A part of the structure being moved (its body dragged) or gripped (a corner or an end dragged).
  const [movingPart, setMovingPart] = useState<{ ref: PartRef; grab: { x: number; z: number } | null; by: { x: number; z: number } } | null>(null);
  const [grip, setGrip] = useState<{ ref: PartRef; handle: Handle; at: { x: number; z: number } } | null>(null);
  // A walking path being drawn: its points so far.
  const [walk, setWalk] = useState<MapSpot[]>([]);
  const pan = usePan(view, onView, depth);
  useZoom(view, onView, depth);
  useRedraw([file, tool, model, paint, brush, selected, hover, box, moving, movingPart, grip, selectedPart, options, showHidden, view.turn, walk, overlay, layers, marker]);
  const structure = (STRUCTURE_TOOLS as readonly EditTool[]).includes(tool);

  // The ghosts are one see-through material each: green where the model fits, red where it does not.
  const ghosts = useMemo(() => {
    const all = (source: THREE.MeshLambertMaterial) => {
      const one = new THREE.MeshLambertMaterial({ color: source.color, transparent: true, opacity: 0.62, depthWrite: false, flatShading: true });
      return { one, all: Object.fromEntries(Object.keys(materials).map((key) => [key, one])) as Materials };
    };
    return { fits: all(materials.good), blocked: all(materials.bad) };
  }, [materials]);
  useEffect(() => () => [ghosts.fits.one, ghosts.blocked.one].forEach((m) => m.dispose()), [ghosts]);

  // The cursor over the canvas: a hand to pick with, the placing cursor with a model on it, the building one while a box is dragged.
  useEffect(() => {
    canvas.style.cursor = tool === 'select' ? 'var(--cursor-grab)' : tool === 'fill' || tool === 'ground' || DRAGGED.includes(tool) ? 'var(--cursor-building)' : 'var(--cursor-placing)';
    return () => void (canvas.style.cursor = '');
  }, [canvas, tool]);
  // (The right button pans, so its menu stays shut.)
  useEffect(() => {
    const shut = (e: Event) => e.preventDefault();
    canvas.addEventListener('contextmenu', shut);
    return () => canvas.removeEventListener('contextmenu', shut);
  }, [canvas]);

  // What would be put down at the pointer, and whether it fits.
  const thing = useMemo(() => {
    if (!hover || (tool !== 'house' && tool !== 'prop' && tool !== 'boat' && tool !== 'tree' && tool !== 'lamp' && tool !== 'hill')) return null;
    const at = { x: hover.x, z: hover.z };
    // (Props and boats are things of the same list as houses, with a model of their own kit.)
    if (tool === 'house' || tool === 'prop' || tool === 'boat') return { kind: 'house' as const, item: { ...at, model: model[tool], turn: model.turn } };
    if (tool === 'tree') return { kind: 'tree' as const, item: { ...at, model: model.tree } };
    if (tool === 'lamp') return { kind: 'lamp' as const, item: at };
    return { kind: 'hill' as const, item: { ...at, model: model.hill, turn: model.turn, scale: model.hillScale } };
  }, [hover, tool, model]);
  const problem = thing ? placeProblem(file, thing.kind, thing.item) : null;

  // A thing being dragged: where it would land, by whole tiles (keeping its decimals), or freely with Shift.
  const dragged = moving ? thingAt(file, moving.ref) : undefined;
  const landing = moving && dragged ? { ...dragged, x: Math.round((dragged.x + moving.by.x) * 100) / 100, z: Math.round((dragged.z + moving.by.z) * 100) / 100 } : null;
  const landProblem = moving && landing ? placeProblem(file, moving.ref.kind, landing) : null;

  const fillOf = useMemo(() => (tool === 'fill' && box ? fillPlan(file, between(box.from, box.to), brush, box.seed) : null), [tool, box, file, brush]);
  const paintNote = tool === 'ground' && box ? paintProblem(file, paint, between(box.from, box.to)) : null;

  // What a tool of the structure would do with the drag (or the click) it has now, and whether the map would still pass. The check runs when the
  // candidate reaches a new tile, not on every move of the pointer.
  const gesture = useMemo(() => {
    if (!structure || !hover) return null;
    const point = { x: hover.x, z: hover.z };
    if (DRAGGED.includes(tool)) return box ? { from: box.from, to: box.to, point } : null;
    return CLICKED.includes(tool) ? { from: [Math.floor(point.x), Math.floor(point.z)] as [number, number], to: [Math.floor(point.x), Math.floor(point.z)] as [number, number], point } : null;
  }, [structure, tool, hover, box]);
  const gestureKey = gesture ? JSON.stringify([tool, gesture.from, gesture.to, CLICKED.includes(tool) ? gesture.point : 0, options]) : '';
  const applied = useMemo(() => (gesture ? applyTool(file, tool as StructureTool, gesture, options) : null), [file, gestureKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const appliedReason = useMemo(() => (applied && !applied.problem ? candidateProblem(applied.file) : null), [applied, candidateProblem]);
  const taken = applied && !applied.problem ? countDecor(file) - countDecor(applied.file) : 0;

  // A part being moved or gripped: where it would land, and whether the map would pass.
  const partTo = useMemo(() => {
    if (movingPart) return movePart(file, movingPart.ref, movingPart.by);
    if (grip && hover) return dragHandle(file, grip.ref, grip.handle, { x: hover.x, z: hover.z });
    return null;
  }, [file, movingPart, grip, hover && Math.round(hover.x), hover && Math.round(hover.z)]); // eslint-disable-line react-hooks/exhaustive-deps
  const partReason = useMemo(() => (partTo && partTo !== file ? candidateProblem(partTo) : null), [partTo, file, candidateProblem]);
  const partRef = movingPart?.ref ?? grip?.ref ?? null;
  // A way of the entrance that is selected (#339): its nodes, and while it is dragged, where they would be.
  const wayLine = selectedPart?.part === 'way' ? overlay?.people.ways.find((w) => w.kind === WAY_KINDS[selectedPart.index]) : undefined;
  const wayNodes = wayLine ? nodesOf(wayLine) : null;
  const liveWay = wayNodes && wayLine ? (partTo && partRef?.part === 'way' && partTo !== file ? [wayNodes[0]!, ...cornersOfWay(partTo, wayLine.kind), wayNodes[wayNodes.length - 1]!] : (grip || movingPart ? wayNodes : wayLine.line)) : null;
  const partTaken = partTo ? countDecor(file) - countDecor(partTo) : 0;

  // The walking path: the stretch from its last point to the pointer, and why it is refused. It is finished by a double-click or Enter, dropped with another tool.
  const stretch = tool === 'walk' && hover && walk.length > 0 ? walkStretchProblem(file, walk[walk.length - 1]!, { x: hover.x, z: hover.z }) : null;
  const finishWalk = () => {
    if (walk.length >= 2) onEdit(addWalk(file, walk));
    setWalk([]);
  };
  useEffect(() => {
    if (tool !== 'walk') return setWalk((w) => (w.length > 0 ? [] : w));
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter') finishWalk();
      else if (e.key === 'Escape') setWalk([]);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // Say what the pointer is over, when that changes.
  const said = useRef<string | null>(null);
  const structureNote = applied
    ? (applied.problem ?? (appliedReason ? `The map would not pass: ${appliedReason}` : taken > 0 ? `Takes away ${taken} house${taken === 1 ? '' : 's'}, trees, lamps or hills under it.` : null))
    : partTo && partTo !== file
      ? (partReason ? `The map would not pass: ${partReason}` : partTaken > 0 ? `Takes away ${partTaken} house${partTaken === 1 ? '' : 's'}, trees, lamps or hills under it.` : null)
      : null;
  const note = stretch ? stretch.reason : fillOf ? `${fillOf.houses.length + fillOf.trees.length} would be put down${fillOf.skipped > 0 ? `, ${fillOf.skipped} skipped` : ''}.` : structureNote ?? paintNote ?? landProblem ?? problem;
  useEffect(() => {
    if (said.current === note) return;
    said.current = note;
    onNote(note);
  }, [note, onNote]);

  // A drag that ends anywhere (also off the canvas) is finished here.
  useEffect(() => {
    if (!box && !moving && !movingPart && !grip) return;
    const up = () => {
      if (box) {
        const area = between(box.from, box.to);
        const single = box.from[0] === box.to[0] && box.from[1] === box.to[1];
        if (tool === 'ground') onPaint(area);
        else if (tool === 'fill') onFill(area, box.seed);
        else if ((tool === 'block' || tool === 'edge') && single) {
          // (A click with the block tool picks the block under it, or the edge; a drag draws one.)
          const ref = (partsOf(file, true).filter((p) => p.part === tool).reverse().find((p) => {
            const b = partBox(file, p);
            return b && box.from[0] + 0.5 >= b.x && box.from[0] + 0.5 <= b.x + b.w && box.from[1] + 0.5 >= b.z && box.from[1] + 0.5 <= b.z + b.d;
          })) ?? null;
          onSelectPart(ref);
        } else if (applied) {
          if (applied.problem) onRefuse(applied.problem);
          else onEdit(applied.file);
        }
        setBox(null);
      } else if (moving) {
        if (landing && !landProblem && (moving.by.x !== 0 || moving.by.z !== 0)) onMove(moving.ref, landing);
        setMoving(null);
      } else if (movingPart || grip) {
        if (partTo && partTo !== file) onEdit(partTo);
        setMovingPart(null);
        setGrip(null);
      }
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [box, moving, movingPart, grip, partTo, applied, file, tool, landing, landProblem, onPaint, onFill, onMove, onEdit, onRefuse, onSelectPart]);

  const onSheetMove = (e: ThreeEvent<PointerEvent>) => {
    const free = e.nativeEvent.shiftKey;
    setHover({ ...spotAt(e.point, free), free });
    if (box) setBox({ ...box, to: [clampTile(e.point.x), clampTile(e.point.z)] });
    if (moving) {
      const grab = moving.grab ?? { x: e.point.x, z: e.point.z };
      const d = { x: e.point.x - grab.x, z: e.point.z - grab.z };
      setMoving({ ...moving, grab, by: free ? { x: Math.round(d.x * 100) / 100, z: Math.round(d.z * 100) / 100 } : { x: Math.round(d.x), z: Math.round(d.z) } });
    }
    if (movingPart) {
      const grab = movingPart.grab ?? { x: e.point.x, z: e.point.z };
      setMovingPart({ ...movingPart, grab, by: { x: Math.round(e.point.x - grab.x), z: Math.round(e.point.z - grab.z) } });
    }
  };

  const onSheetDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button !== 0) return;
    if (tool === 'select') {
      onSelect(null);
      onSelectPart(null);
      pan.start(e.nativeEvent);
    } else if (tool === 'ground' || tool === 'fill' || DRAGGED.includes(tool)) {
      const at: [number, number] = [clampTile(e.point.x), clampTile(e.point.z)];
      setBox({ from: at, to: at, seed: Math.floor(Math.random() * 2 ** 31) });
    }
  };

  const onSheetClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.nativeEvent.button !== 0 || e.delta > 4) return;
    if (CLICKED.includes(tool) && applied) {
      if (applied.problem) onRefuse(applied.problem);
      else onEdit(applied.file);
      return;
    }
    if (tool === 'walk') {
      const next = spotAt(e.point, e.nativeEvent.shiftKey);
      const last = walk[walk.length - 1];
      if (last && last.x === next.x && last.z === next.z) return;
      const refused = last && walkStretchProblem(file, last, next);
      if (refused) return onRefuse(refused.reason);
      setWalk([...walk, next]);
      return;
    }
    if (!thing) return;
    onPlace(thing.kind, spotAt(e.point, e.nativeEvent.shiftKey));
  };

  return (
    <group position={[0, -depth, 0]}>
      <Grid />
      {/* The sheet at street level that catches the pointer, wherever the town is. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} onPointerMove={onSheetMove} onPointerDown={onSheetDown} onPointerOut={() => setHover(null)} onClick={onSheetClick} onDoubleClick={() => tool === 'walk' && finishWalk()}>
        <planeGeometry args={[MAP_GRID * 2, MAP_GRID * 2]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {/* The tile under the pointer. */}
      {hover && !box && !moving && tool !== 'select' && (
        <mesh position={[tileOf(hover.x), 0.23, tileOf(hover.z)]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color={(problem ? materials.bad : materials.good).color} transparent opacity={0.35} depthWrite={false} />
        </mesh>
      )}

      {/* What is on the pointer, see-through. */}
      {thing && hover && !box && (
        <Suspense fallback={null}>
          <Ghost kind={thing.kind} item={thing.item} scale={file.settings.scale} materials={problem ? ghosts.blocked.all : ghosts.fits.all} ghost={problem ? ghosts.blocked.one : ghosts.fits.one} tint={materials.city.color} />
        </Suspense>
      )}

      {/* A thing being moved: where it would land. */}
      {moving && landing && dragged && (
        <Suspense fallback={null}>
          <Ghost kind={moving.ref.kind} item={landing} scale={file.settings.scale} materials={landProblem ? ghosts.blocked.all : ghosts.fits.all} ghost={landProblem ? ghosts.blocked.one : ghosts.fits.one} tint={materials.city.color} />
        </Suspense>
      )}

      {/* A box of ground, or of a fill. */}
      {box && tool === 'ground' && <BoxMark area={between(box.from, box.to)} colour={paintNote ? materials.bad.color.getStyle() : GROUND_COLOURS[paint]} />}
      {box && tool === 'fill' && fillOf && (
        <>
          <BoxMark area={between(box.from, box.to)} colour={materials.select.color.getStyle()} />
          {[...fillOf.houses.map((h) => ({ kind: 'house' as const, item: h })), ...fillOf.trees.map((t) => ({ kind: 'tree' as const, item: t }))].map(({ kind, item }, n) => {
            const f = footprintOf(file, kind, item);
            const body = kind === 'tree' ? { x: item.x - 0.4, z: item.z - 0.4, w: 0.8, d: 0.8 } : bodyOf(file, kind, item);
            return (
              <mesh key={n} position={[body.x + body.w / 2, 0.25, body.z + body.d / 2]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[Math.max(body.w - 0.1, f.w), Math.max(body.d - 0.1, f.d)]} />
                <meshBasicMaterial color={materials.good.color} transparent opacity={0.5} depthWrite={false} />
              </mesh>
            );
          })}
        </>
      )}

      {/* The structure: flat outlines of its parts, and what a tool of it would put down (green where the map would pass, red where it would not). */}
      {(tool === 'select' || structure) && <PartMarks file={file} withBlocks={tool === 'block' || tool === 'edge'} />}
      {applied?.outline && !box && CLICKED.includes(tool) && <BoxMark area={applied.outline} level={0.42} colour={(applied.problem || appliedReason ? materials.bad : materials.good).color.getStyle()} />}
      {applied?.outline && box && <BoxMark area={applied.outline} level={0.42} colour={(applied.problem || appliedReason ? materials.bad : materials.good).color.getStyle()} />}
      {partTo && partTo !== file && partRef && partBox(partTo, partRef) && <BoxMark area={partBox(partTo, partRef)!} level={0.42} colour={(partReason ? materials.bad : materials.good).color.getStyle()} />}
      {tool === 'select' && <PartHits file={file} ways={overlay && layers.people ? overlay.people.ways.filter((w) => w.editable) : []} onPick={(ref) => { onSelectPart(ref); onSelect(null); setMovingPart({ ref, grab: null, by: { x: 0, z: 0 } }); }} />}
      {liveWay && <WayMark nodes={liveWay} line={grip || movingPart ? null : wayLine!.line} materials={materials} />}
      {wayNodes && tool === 'select' && !grip && !movingPart && <WayGrips nodes={wayNodes} colour={materials.select.color.getStyle()} onGrab={(handle, at) => setGrip({ ref: selectedPart!, handle, at })} />}
      {selectedPart && partBox(file, selectedPart) && <BoxMark area={partBox(file, selectedPart)!} level={0.44} colour={materials.select.color.getStyle()} />}
      {selectedPart && (tool === 'select' || tool === 'block' || tool === 'edge') && !grip && !movingPart && (
        <Grips file={file} selected={selectedPart} colour={materials.select.color.getStyle()} onGrab={(handle, at) => setGrip({ ref: selectedPart, handle, at })} />
      )}
      {tool === 'select' && <Hits file={file} onPick={(ref) => { onSelect(ref); onSelectPart(null); setMoving({ ref, grab: null, by: { x: 0, z: 0 } }); }} />}
      {selected && <Selected file={file} selected={selected} materials={materials} />}
      {showHidden && <HiddenRings file={file} viewTurn={viewTurn} building={building} />}
      {overlay && <RouteOverlayView overlay={overlay} layers={layers} />}
      {tool === 'walk' && walk.length > 0 && <WalkPreview points={walk} to={hover && !stretch ? { x: hover.x, z: hover.z } : null} bad={stretch ? { x: hover!.x, z: hover!.z } : null} materials={materials} />}
      {marker && <Marker at={marker} />}
    </group>
  );
}

/** Faint lines every 10 tiles, and the edge of the grid every map has. */
function Grid() {
  const lines = useMemo(() => {
    const points: number[] = [];
    for (let n = -MAP_GRID + 10; n < MAP_GRID; n += 10) points.push(n, 0.21, -MAP_GRID, n, 0.21, MAP_GRID, -MAP_GRID, 0.21, n, MAP_GRID, 0.21, n);
    const edge = [-MAP_GRID, 0.21, -MAP_GRID, MAP_GRID, 0.21, -MAP_GRID, MAP_GRID, 0.21, -MAP_GRID, MAP_GRID, 0.21, MAP_GRID, MAP_GRID, 0.21, MAP_GRID, -MAP_GRID, 0.21, MAP_GRID, -MAP_GRID, 0.21, MAP_GRID, -MAP_GRID, 0.21, -MAP_GRID];
    const make = (list: number[]) => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
    return { faint: make(points), edge: make(edge) };
  }, []);
  useEffect(() => () => void [lines.faint, lines.edge].forEach((g) => g.dispose()), [lines]);
  return (
    <>
      <lineSegments geometry={lines.faint}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.16} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={lines.edge}>
        <lineBasicMaterial color="#ffb03a" transparent opacity={0.9} depthWrite={false} />
      </lineSegments>
    </>
  );
}

/** A box clipped to the ground every map has: a road without ends is drawn as long as the grid. */
function shown(b: MapBox): MapBox {
  const [x0, z0, x1, z1] = [Math.max(-MAP_GRID, b.x), Math.max(-MAP_GRID, b.z), Math.min(MAP_GRID, b.x + b.w), Math.min(MAP_GRID, b.z + b.d)];
  return { x: x0, z: z0, w: Math.max(0.01, x1 - x0), d: Math.max(0.01, z1 - z0) };
}

/** Flat see-through outlines of the parts of the structure, each kind in its own colour; the lines of their edges are one set of lines. */
function PartMarks({ file, withBlocks }: { file: MapFile; withBlocks: boolean }) {
  const parts = useMemo(() => partsOf(file, withBlocks).filter((ref) => ref.part !== 'walk').flatMap((ref) => { const b = partBox(file, ref); return b ? [{ ref, box: shown(b) }] : []; }), [file, withBlocks]);
  const lines = useMemo(() => {
    const points: number[] = [];
    for (const { ref, box: b } of parts) {
      const y = PART_LOOK[ref.part].level + 0.01;
      points.push(b.x, y, b.z, b.x + b.w, y, b.z, b.x + b.w, y, b.z, b.x + b.w, y, b.z + b.d, b.x + b.w, y, b.z + b.d, b.x, y, b.z + b.d, b.x, y, b.z + b.d, b.x, y, b.z);
    }
    return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  }, [parts]);
  useEffect(() => () => lines.dispose(), [lines]);
  return (
    <>
      {parts.map(({ ref, box: b }) => (
        <mesh key={`${ref.part}:${ref.index}`} position={[b.x + b.w / 2, PART_LOOK[ref.part].level, b.z + b.d / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          {ref.part === 'bus' || ref.part === 'taxi' || ref.part === 'fountain' || ref.part === 'via' ? <circleGeometry args={[0.45, 20]} /> : <planeGeometry args={[b.w, b.d]} />}
          <meshBasicMaterial color={PART_LOOK[ref.part].colour} transparent opacity={ref.part === 'bus' || ref.part === 'taxi' || ref.part === 'fountain' || ref.part === 'via' ? 0.9 : 0.34} depthWrite={false} depthTest={false} />
        </mesh>
      ))}
      <lineSegments geometry={lines}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.85} depthWrite={false} depthTest={false} />
      </lineSegments>
    </>
  );
}

/** One flat box over each part, only to catch the click on it (a house or a tree standing on it is picked first: its box reaches higher). */
function PartHits({ file, ways, onPick }: { file: MapFile; ways: WayLine[]; onPick: (ref: PartRef) => void }) {
  const over = usePointerCursor(true);
  const parts = useMemo(() => partsOf(file, false), [file]);
  return (
    <group {...over}>
      {ways.map((w) => (
        <WalkHits key={`way:${w.kind}`} path={w.line} onPick={() => onPick({ part: 'way', index: WAY_KINDS.indexOf(w.kind) })} />
      ))}
      {parts.map((ref) => {
        if (ref.part === 'walk') return <WalkHits key={`walk:${ref.index}`} path={file.map.walks![ref.index]!} onPick={() => onPick(ref)} />;
        const raw = partBox(file, ref);
        if (!raw) return null;
        const b = shown(raw);
        return (
          <mesh
            key={`${ref.part}:${ref.index}`}
            position={[b.x + b.w / 2, PART_LOOK[ref.part].level, b.z + b.d / 2]}
            onPointerDown={(e) => {
              if (e.nativeEvent.button !== 0) return;
              e.stopPropagation();
              onPick(ref);
            }}
          >
            <boxGeometry args={[b.w, 0.08, b.d]} />
            <meshBasicMaterial visible={false} />
          </mesh>
        );
      })}
    </group>
  );
}

/** A walking path being drawn: the points so far, and the stretch to the pointer (green; red, with a ring where it would cross, when it is refused). */
function WalkPreview({ points, to, bad, materials }: { points: MapSpot[]; to: MapSpot | null; bad: MapSpot | null; materials: Materials }) {
  const parts = useMemo(() => {
    const line = [...points, ...(to ? [to] : [])];
    return [
      { colour: materials.select.color.getStyle(), positions: ribbonsOf([line], { width: 0.3, side: 0, level: 0.6, every: 0 }) },
      { colour: materials.bad.color.getStyle(), positions: bad ? ribbonsOf([[points[points.length - 1]!, bad]], { width: 0.3, side: 0, level: 0.61, every: 0 }) : [] },
    ].filter((p) => p.positions.length > 0).map((p) => ({ colour: p.colour, geometry: new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(p.positions, 3)) }));
  }, [points, to, bad, materials]);
  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts]);
  return (
    <>
      {parts.map((p, n) => (
        <mesh key={n} geometry={p.geometry} renderOrder={12}>
          <meshBasicMaterial color={p.colour} transparent opacity={0.9} depthWrite={false} depthTest={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {points.map((p, n) => (
        <mesh key={`point:${n}`} position={[p.x, 0.65, p.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={12}>
          <circleGeometry args={[0.35, 16]} />
          <meshBasicMaterial color={materials.select.color} depthTest={false} />
        </mesh>
      ))}
    </>
  );
}

/** Boxes along a drawn walking path, only to catch the click on it, a tile apart. */
function WalkHits({ path, onPick }: { path: readonly MapSpot[]; onPick: () => void }) {
  const spots = path.flatMap((p, k) => {
    const prev = path[k - 1];
    if (!prev) return [p];
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - prev.x, p.z - prev.z)));
    return Array.from({ length: steps }, (_, i) => ({ x: prev.x + ((p.x - prev.x) * (i + 1)) / steps, z: prev.z + ((p.z - prev.z) * (i + 1)) / steps }));
  });
  return (
    <>
      {spots.map((s, n) => (
        <mesh
          key={n}
          position={[s.x, PART_LOOK.walk.level + 0.1, s.z]}
          onPointerDown={(e) => {
            if (e.nativeEvent.button !== 0) return;
            e.stopPropagation();
            onPick();
          }}
        >
          <boxGeometry args={[1.2, 0.2, 1.2]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      ))}
    </>
  );
}

/** The way of the entrance that is selected: a ribbon along its nodes (the line the town draws when it is not being dragged). */
function WayMark({ nodes, line, materials }: { nodes: MapSpot[]; line: MapSpot[] | null; materials: Materials }) {
  const geometry = useMemo(() => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(ribbonsOf([line ?? nodes], { width: 0.45, side: 0, level: 0.66, every: 0 }), 3)), [nodes, line]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} renderOrder={13}>
      <meshBasicMaterial color={materials.select.color} transparent opacity={0.9} depthWrite={false} depthTest={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** The grips of a way (#339): a box at each corner, and a small one in the middle of each stretch, which makes a new corner when it is dragged. */
function WayGrips({ nodes, colour, onGrab }: { nodes: MapSpot[]; colour: string; onGrab: (handle: Handle, at: { x: number; z: number }) => void }) {
  const over = usePointerCursor(true);
  return (
    <group {...over}>
      {wayHandles(nodes).map((h) => (
        <mesh
          key={h.handle}
          position={[h.x, 0.7, h.z]}
          onPointerDown={(e) => {
            if (e.nativeEvent.button !== 0) return;
            e.stopPropagation();
            onGrab(h.handle, { x: h.x, z: h.z });
          }}
        >
          <boxGeometry args={h.small ? [0.5, 0.5, 0.5] : [0.9, 0.9, 0.9]} />
          <meshBasicMaterial color={colour} transparent={h.small} opacity={h.small ? 0.7 : 1} depthTest={false} />
        </mesh>
      ))}
    </group>
  );
}

/** The mark of the map check: a red ring on the ground at the spot a failed reason applies to, and a pin that stands up through the houses. */
function Marker({ at }: { at: MapSpot }) {
  return (
    <group position={[at.x, 0, at.z]}>
      <mesh position={[0, 0.7, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={20}>
        <ringGeometry args={[1.6, 2.1, 40]} />
        <meshBasicMaterial color="#e5383b" transparent opacity={0.95} depthWrite={false} depthTest={false} />
      </mesh>
      <mesh position={[0, 4, 0]} renderOrder={20}>
        <cylinderGeometry args={[0.1, 0.1, 8, 8]} />
        <meshBasicMaterial color="#e5383b" depthWrite={false} depthTest={false} />
      </mesh>
      <mesh position={[0, 8.2, 0]} renderOrder={20}>
        <sphereGeometry args={[0.6, 16, 12]} />
        <meshBasicMaterial color="#e5383b" depthWrite={false} depthTest={false} />
      </mesh>
    </group>
  );
}

/** The grips of a part that is selected: a corner of its box, or an end of a road. */
function Grips({ file, selected, colour, onGrab }: { file: MapFile; selected: PartRef; colour: string; onGrab: (handle: Handle, at: { x: number; z: number }) => void }) {
  const over = usePointerCursor(true);
  return (
    <group {...over}>
      {handlesOf(file, selected).map((h) => (
        <mesh
          key={h.handle}
          position={[h.x, 0.5, h.z]}
          onPointerDown={(e) => {
            if (e.nativeEvent.button !== 0) return;
            e.stopPropagation();
            onGrab(h.handle, { x: h.x, z: h.z });
          }}
        >
          <boxGeometry args={[0.9, 0.9, 0.9]} />
          <meshBasicMaterial color={colour} depthTest={false} />
        </mesh>
      ))}
    </group>
  );
}

/** The box that is being dragged, flat on the street. */
function BoxMark({ area: wanted, colour, level = 0.24 }: { area: MapBox; colour: string; level?: number }) {
  const area = shown(wanted);
  return (
    <mesh position={[area.x + area.w / 2, level, area.z + area.d / 2]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[area.w, area.d]} />
      <meshBasicMaterial color={colour} transparent opacity={0.55} depthWrite={false} depthTest={false} />
    </mesh>
  );
}

/** A model of the town as a see-through ghost: its own kind of thing in one colour. */
function Ghost({ kind, item, scale, materials, ghost, tint }: { kind: Kind; item: { x: number; z: number; model?: string; turn?: number; scale?: number }; scale: number; materials: Materials; ghost: THREE.Material; tint: THREE.Color }) {
  if (kind === 'lamp') {
    return (
      <group position={[item.x, PAVEMENT, item.z]}>
        <StreetLamp materials={materials} turn={0} />
      </group>
    );
  }
  if (kind === 'peak') return null;
  const found = item.model ? modelOf(item.model) : undefined;
  if (!found || !item.model) return null;
  if (kind === 'hill') return <NatureModel file={item.model} position={[item.x, PAVEMENT + NATURE.sink * (item.scale ?? 1), item.z]} turn={item.turn ?? 0} scale={item.scale ?? 1} materials={materials} />;
  const at = placedAt(found, scale);
  return <KitModel file={item.model} center={[found.cx ?? 0, found.cz ?? 0]} position={[item.x, at.y, item.z]} turn={kind === 'tree' ? 0 : (item.turn ?? 0)} scale={at.scale} tint={tint} ghost={ghost} />;
}

/** One invisible box over each thing, only to catch the click on it (the raycaster ignores `material.visible`; the renderer does not). */
function Hits({ file, onPick }: { file: MapFile; onPick: (ref: Ref) => void }) {
  const over = usePointerCursor(true);
  return (
    <group {...over}>
      {(['house', 'tree', 'lamp', 'hill', 'peak'] as const).map((kind) => (
        <HitKind key={kind} file={file} kind={kind} onPick={onPick} />
      ))}
    </group>
  );
}

function HitKind({ file, kind, onPick }: { file: MapFile; kind: Kind; onPick: (ref: Ref) => void }) {
  const items = kind === 'house' ? file.map.houses : kind === 'tree' ? file.map.trees : kind === 'lamp' ? file.map.lamps : kind === 'hill' ? file.map.hills : file.map.peaks;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ visible: false }), []);
  useEffect(() => () => void [geometry, material].forEach((d) => d.dispose()), [geometry, material]);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const matrix = new THREE.Matrix4();
    items.forEach((item, i) => {
      const body = bodyOf(file, kind, item);
      matrix.compose(new THREE.Vector3(body.x + body.w / 2, body.height / 2, body.z + body.d / 2), new THREE.Quaternion(), new THREE.Vector3(body.w, body.height, body.d));
      m.setMatrixAt(i, matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [file, kind, items]);
  if (items.length === 0) return null;
  return (
    <instancedMesh
      key={items.length}
      ref={mesh}
      args={[geometry, material, items.length]}
      onPointerDown={(e) => {
        if (e.nativeEvent.button !== 0 || e.instanceId === undefined) return;
        e.stopPropagation();
        onPick({ kind, index: e.instanceId });
      }}
    />
  );
}

/** The thing that is selected, lit up in one see-through colour. */
function Selected({ file, selected, materials }: { file: MapFile; selected: Ref; materials: Materials }) {
  const thing = thingAt(file, selected);
  if (!thing) return null;
  const body = bodyOf(file, selected.kind, thing);
  return (
    <mesh position={[body.x + body.w / 2, body.height / 2, body.z + body.d / 2]}>
      <boxGeometry args={[body.w + 0.1, body.height + 0.1, body.d + 0.1]} />
      <meshBasicMaterial color={materials.select.color} transparent opacity={0.35} depthWrite={false} />
    </mesh>
  );
}

/** An amber ring on the ground under each thing the game leaves out from this side of the view. */
function HiddenRings({ file, viewTurn, building }: { file: MapFile; viewTurn: number; building: Building }) {
  const hidden = useMemo(() => hiddenThings(file, viewTurn, building), [file, viewTurn, building]);
  return (
    <>
      {hidden.map(({ kind, index }) => {
        const thing = thingAt(file, { kind, index });
        if (!thing) return null;
        const body = bodyOf(file, kind, thing);
        const r = Math.max(body.w, body.d) / 2 + 0.3;
        return (
          <mesh key={`${kind}:${index}`} position={[thing.x, 0.26, thing.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[r, r + 0.25, 40]} />
            <meshBasicMaterial color="#ffb03a" transparent opacity={0.95} depthWrite={false} />
          </mesh>
        );
      })}
    </>
  );
}

// ---- The camera ----

/** The view is turned this far round; a quarter turn brings the next corner (see `MapRig` in previews.tsx). */
const angleOf = (turn: number) => (turn * Math.PI) / 2 + Math.PI / 4;

/** A change of the point the camera looks at (floor tiles) as a change of the view: the view moves it by [cos a, -sin a; -sin a, -cos a], which is its own inverse. */
function viewShift(view: { turn: number }, dx: number, dz: number): { x: number; y: number } {
  const a = angleOf(view.turn);
  return { x: Math.cos(a) * dx - Math.sin(a) * dz, y: -Math.sin(a) * dx - Math.cos(a) * dz };
}

/** Where a point of the canvas is on the street, for a camera. */
function groundAt(camera: THREE.Camera, element: HTMLElement, clientX: number, clientY: number, depth: number): THREE.Vector3 | null {
  const rect = element.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), depth), new THREE.Vector3());
}

/** Drag to pan: the right or the middle button with any tool, and `start` for the left one on empty ground with Select. The ground under the pointer stays under it. */
function usePan(view: TownEditProps['view'], onView: TownEditProps['onView'], depth: number) {
  const camera = useThree((s) => s.camera);
  const element = useThree((s) => s.gl.domElement);
  const latest = useRef({ view, onView });
  latest.current = { view, onView };
  const start = useMemo(
    () => (down: PointerEvent) => {
      const began = camera.clone();
      began.updateMatrixWorld();
      const from = groundAt(began, element, down.clientX, down.clientY, depth);
      const first = latest.current.view;
      if (!from) return;
      const move = (e: PointerEvent) => {
        const to = groundAt(began, element, e.clientX, e.clientY, depth);
        if (!to) return;
        const shift = viewShift(first, from.x - to.x, from.z - to.z);
        latest.current.onView({ ...latest.current.view, x: first.x + shift.x, y: first.y + shift.y });
      };
      const end = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
    },
    [camera, element, depth],
  );
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (e.button === 1 || e.button === 2) {
        e.preventDefault();
        start(e);
      }
    };
    element.addEventListener('pointerdown', down);
    return () => element.removeEventListener('pointerdown', down);
  }, [element, start]);
  return { start };
}

/** The wheel zooms round the pointer: the ground under it stays where it is. A listener that is not passive, so the page does not scroll. */
function useZoom(view: TownEditProps['view'], onView: TownEditProps['onView'], depth: number) {
  const camera = useThree((s) => s.camera);
  const element = useThree((s) => s.gl.domElement);
  const latest = useRef({ view, onView });
  latest.current = { view, onView };
  useEffect(() => {
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const { view: now, onView: change } = latest.current;
      const zoom = Math.max(0.1, Math.min(8, now.zoom * Math.exp(-e.deltaY * 0.0015)));
      if (zoom === now.zoom) return;
      camera.updateMatrixWorld();
      const rect = element.getBoundingClientRect();
      const under = groundAt(camera, element, e.clientX, e.clientY, depth);
      const middle = groundAt(camera, element, rect.left + rect.width / 2, rect.top + rect.height / 2, depth);
      if (!under || !middle) return change({ ...now, zoom });
      // The point looked at moves towards the pointer by the share the zoom closes in.
      const closer = 1 - now.zoom / zoom;
      const shift = viewShift(now, (under.x - middle.x) * closer, (under.z - middle.z) * closer);
      change({ ...now, zoom, x: now.x + shift.x, y: now.y + shift.y });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [camera, element, depth]);
}
