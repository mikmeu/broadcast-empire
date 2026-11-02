// The 3D map editor's layer over the town (0.21.0, #328): a pointer sheet at street level, a see-through model that snaps to a tile and turns, the
// outline of the tile under the pointer, boxes that catch a click on a house, tree, lamp, hill or peak, a box dragged for ground or a fill, and the
// camera's wheel zoom and drag. It follows the drawing of rooms in Floor.tsx (`DrawingLayer`, `ghostMaterials`). The hover lives in here, so the town
// itself (which is memoised) is not drawn again when the pointer moves.

import { useThree, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { NATURE } from '../assets';
import { PAVEMENT } from '../clearance';
import { modelOf, streetLevel } from '../city';
import { Shape, ViewTurn, usePointerCursor, useRedraw } from './frame';
import { KitModel, NatureModel } from './Town';
import { StreetLamp } from './StreetLamp';
import type { Materials } from './materials';
import type { Building } from '../../config/office';
import { MAP_GRID, type MapBox, type MapFile } from '../../mods/mapFile';
import { bodyOf, fillPlan, footprintOf, hiddenThings, paintProblem, placeProblem, thingAt, type Brush, type Kind, type PaintKind, type Ref } from '../../mods/townDraft';

/** What the editor's tools do on the town. */
export type EditTool = 'select' | 'house' | 'tree' | 'lamp' | 'hill' | 'fill' | 'ground';

/** The model that is on the pointer for each tool that puts one down, and how it is turned and scaled. */
export interface EditModel {
  house: string;
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
  const building = useContext(Shape);
  const viewTurn = useContext(ViewTurn);
  const depth = streetLevel(building.floors + 1);
  const canvas = useThree((s) => s.gl.domElement);
  const [hover, setHover] = useState<{ x: number; z: number; free: boolean } | null>(null);
  const [box, setBox] = useState<{ from: [number, number]; to: [number, number]; seed: number } | null>(null);
  const [moving, setMoving] = useState<{ ref: Ref; grab: { x: number; z: number } | null; by: { x: number; z: number } } | null>(null);
  const pan = usePan(view, onView, depth);
  useZoom(view, onView, depth);
  useRedraw([file, tool, model, paint, brush, selected, hover, box, moving, showHidden, view.turn]);

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
    canvas.style.cursor = tool === 'select' ? 'var(--cursor-grab)' : tool === 'fill' || tool === 'ground' ? 'var(--cursor-building)' : 'var(--cursor-placing)';
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
    if (!hover || (tool !== 'house' && tool !== 'tree' && tool !== 'lamp' && tool !== 'hill')) return null;
    const at = { x: hover.x, z: hover.z };
    if (tool === 'house') return { kind: 'house' as const, item: { ...at, model: model.house, turn: model.turn } };
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

  // Say what the pointer is over, when that changes.
  const said = useRef<string | null>(null);
  const note = fillOf ? `${fillOf.houses.length + fillOf.trees.length} would be put down${fillOf.skipped > 0 ? `, ${fillOf.skipped} skipped` : ''}.` : paintNote ?? landProblem ?? problem;
  useEffect(() => {
    if (said.current === note) return;
    said.current = note;
    onNote(note);
  }, [note, onNote]);

  // A drag that ends anywhere (also off the canvas) is finished here.
  useEffect(() => {
    if (!box && !moving) return;
    const up = () => {
      if (box) {
        const area = between(box.from, box.to);
        if (tool === 'ground') onPaint(area);
        else if (tool === 'fill') onFill(area, box.seed);
        setBox(null);
      } else if (moving) {
        if (landing && !landProblem && (moving.by.x !== 0 || moving.by.z !== 0)) onMove(moving.ref, landing);
        setMoving(null);
      }
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [box, moving, tool, landing, landProblem, onPaint, onFill, onMove]);

  const onSheetMove = (e: ThreeEvent<PointerEvent>) => {
    const free = e.nativeEvent.shiftKey;
    setHover({ ...spotAt(e.point, free), free });
    if (box) setBox({ ...box, to: [clampTile(e.point.x), clampTile(e.point.z)] });
    if (moving) {
      const grab = moving.grab ?? { x: e.point.x, z: e.point.z };
      const d = { x: e.point.x - grab.x, z: e.point.z - grab.z };
      setMoving({ ...moving, grab, by: free ? { x: Math.round(d.x * 100) / 100, z: Math.round(d.z * 100) / 100 } : { x: Math.round(d.x), z: Math.round(d.z) } });
    }
  };

  const onSheetDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button !== 0) return;
    if (tool === 'select') {
      onSelect(null);
      pan.start(e.nativeEvent);
    } else if (tool === 'ground' || tool === 'fill') {
      const at: [number, number] = [clampTile(e.point.x), clampTile(e.point.z)];
      setBox({ from: at, to: at, seed: Math.floor(Math.random() * 2 ** 31) });
    }
  };

  const onSheetClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.nativeEvent.button !== 0 || e.delta > 4 || !thing) return;
    onPlace(thing.kind, spotAt(e.point, e.nativeEvent.shiftKey));
  };

  return (
    <group position={[0, -depth, 0]}>
      <Grid />
      {/* The sheet at street level that catches the pointer, wherever the town is. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} onPointerMove={onSheetMove} onPointerDown={onSheetDown} onPointerOut={() => setHover(null)} onClick={onSheetClick}>
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

      {tool === 'select' && <Hits file={file} onPick={(ref) => { onSelect(ref); setMoving({ ref, grab: null, by: { x: 0, z: 0 } }); }} />}
      {selected && <Selected file={file} selected={selected} materials={materials} />}
      {showHidden && <HiddenRings file={file} viewTurn={viewTurn} building={building} />}
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

/** The box that is being dragged, flat on the street. */
function BoxMark({ area, colour }: { area: MapBox; colour: string }) {
  return (
    <mesh position={[area.x + area.w / 2, 0.24, area.z + area.d / 2]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[area.w, area.d]} />
      <meshBasicMaterial color={colour} transparent opacity={0.45} depthWrite={false} />
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
  return <KitModel file={item.model} center={[found.cx ?? 0, found.cz ?? 0]} position={[item.x, PAVEMENT, item.z]} turn={kind === 'tree' ? 0 : (item.turn ?? 0)} scale={scale} tint={tint} ghost={ghost} />;
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
