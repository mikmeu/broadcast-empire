// The office in 3D (prompt.md sections 3, 12 and 13): an isometric view of one
// floor that can be zoomed, turned in quarter turns and moved a little. It
// only reads state and reports clicks. What things look like comes from the asset registry (assets.ts),
// where people are from layout.ts, and every color from the theme tokens.

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { isTextField } from '../ui/keys';
import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { setOfficeSounds } from '../audio/player';
import { buildingOf } from '../sim/office';
import { findRoom } from '../sim/office';
import { Floor, liftedPiece } from './scene/Floor';
import { Roof } from './scene/cables';
import { CAMERA, type Frame, Shape, VIEW, type View, ViewTurn, World, frameOf, maxZoomOf } from './scene/frame';
import { useMaterials } from './scene/materials';
import { type Props } from './scene/props';
import { soundsAt } from './soundscape';

export { FurniturePreview, LookPreview, MapPreview, TownPreview, type MapView } from './scene/previews';

const MOVE_KEYS = ['w', 'a', 's', 'd'];

const typing = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement | null;
  return e.ctrlKey || e.metaKey || e.altKey || isTextField(target);
};

/** The arrow keys as a step on the screen: [to the right, upwards]. */
const ARROWS: Record<string, [right: number, up: number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };

export function Office3D(props: Props) {
  const materials = useMaterials();
  const root = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  /** Quarter turns of the view; it keeps counting, so the view always turns the short way. */
  const [turn, setTurn] = useState(0);
  const view = useRef<View>({ zoom: 1, x: 0, z: 0, keys: new Set(), angle: Math.PI / 4, px: 1, redraw: () => {} });
  const { now, hours, pace } = props;
  const world = useMemo(() => ({ now, hours, pace }), [now, hours, pace]);
  const building = buildingOf(props.game);
  const frame = useMemo(() => frameOf(building), [building]);
  const [cx, , cz] = frame.center;
  // The key handler below is set up once, so it reads the frame through a ref.
  const frameRef = useRef(frame);
  frameRef.current = frame;

  // The sounds of the office, from where the camera looks: worked out four times a second, and silent while the
  // game is paused or the window is hidden.
  const { game: state, floor, beat, still } = props;
  useEffect(() => {
    const tick = () => {
      const v = view.current;
      const silent = pace === 0 || document.hidden;
      setOfficeSounds(silent ? [] : soundsAt(state, floor, beat, { x: cx + v.x, z: cz + v.z, zoom: Math.min(v.zoom, CAMERA.maxZoom), angle: v.angle }, now(), still), silent);
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [state, floor, beat, still, pace, now, cx, cz]);
  useEffect(() => () => setOfficeSounds([], true), []);

  const zoomBy = (factor: number) => {
    view.current.zoom = Math.min(maxZoomOf(frameRef.current), Math.max(CAMERA.minZoom, view.current.zoom * factor));
    view.current.redraw();
  };
  const reset = () => {
    Object.assign(view.current, { zoom: 1, x: 0, z: 0 });
    setTurn((t) => Math.round(t / 4) * 4);
    view.current.redraw();
  };

  // W, A, S and D move the view while held; Q and E turn it; + and − zoom; 0 puts it back.
  useEffect(() => {
    const { keys } = view.current;
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      const key = e.key.toLowerCase();
      if (MOVE_KEYS.includes(key)) keys.add(key);
      else if (key === 'q') setTurn((t) => t - 1);
      else if (key === 'e') setTurn((t) => t + 1);
      else if (key === '+' || key === '=') zoomBy(CAMERA.zoomStep);
      else if (key === '-' || key === '_') zoomBy(1 / CAMERA.zoomStep);
      else if (key === '0') reset();
      else return;
      view.current.redraw();
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const clear = () => keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);

  // The view is dragged along with the pointer: the mouse or one finger moves it, two fingers move and zoom it.
  // A press that does not travel stays a click. While a room is being drawn the left button and one finger draw,
  // so there the view goes with the middle or right button, or with two fingers.
  const drawingNow = useRef(false);
  drawingNow.current = props.drawing != null;
  const reach = CAMERA.reach * frame.scale;
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const pointers = new Map<number, { x: number; y: number }>();
    /** Where the pointers and the view were when the drag began, or began again with another number of fingers. */
    let grab: { x: number; y: number; spread: number; vx: number; vz: number; zoom: number; dragging: boolean } | null = null;
    /** The click that ends a drag is not a click on the office. */
    let swallow = false;
    const middle = () => {
      const all = [...pointers.values()];
      const x = all.reduce((sum, p) => sum + p.x, 0) / all.length;
      const y = all.reduce((sum, p) => sum + p.y, 0) / all.length;
      return { x, y, spread: all.length > 1 ? Math.hypot(all[0]!.x - all[1]!.x, all[0]!.y - all[1]!.y) : 0 };
    };
    const hold = (dragging: boolean) => {
      const { x, z, zoom } = view.current;
      grab = { ...middle(), vx: x, vz: z, zoom, dragging };
    };
    const limit = (n: number) => Math.min(reach, Math.max(-reach, n));
    const down = (e: PointerEvent) => {
      if (!(e.target instanceof HTMLCanvasElement)) return;
      if (pointers.size === 0) swallow = false;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // The middle and right buttons only ever move the view: the office never hears of them.
      const aside = e.pointerType === 'mouse' && e.button !== 0;
      if (aside) e.stopPropagation();
      if (pointers.size > 1) {
        for (const id of pointers.keys()) el.setPointerCapture(id);
        swallow = true;
        hold(true);
      } else if (aside || !drawingNow.current) hold(false);
      else grab = null;
    };
    const move = (e: PointerEvent) => {
      const pointer = pointers.get(e.pointerId);
      if (!pointer) return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (!grab) return;
      const at = middle();
      if (!grab.dragging) {
        if (Math.hypot(at.x - grab.x, at.y - grab.y) < (e.pointerType === 'mouse' ? CAMERA.drag.mouse : CAMERA.drag.touch)) return;
        // From here on it is a drag: the view starts moving from where the pointer is now, without a jump.
        el.setPointerCapture(e.pointerId);
        el.classList.add('dragging');
        swallow = true;
        hold(true);
        return;
      }
      e.stopPropagation();
      const v = view.current;
      if (grab.spread > 0 && at.spread > 0) v.zoom = Math.min(maxZoomOf(frameRef.current), Math.max(CAMERA.minZoom, (grab.zoom * at.spread) / grab.spread));
      // What was under the pointer stays under it: the view goes the other way, in tiles.
      const right = -(at.x - grab.x) / v.px;
      const up = (at.y - grab.y) / (v.px * CAMERA.depth);
      v.x = limit(grab.vx + Math.cos(v.angle) * right - Math.sin(v.angle) * up);
      v.z = limit(grab.vz - Math.sin(v.angle) * right - Math.cos(v.angle) * up);
      v.redraw();
    };
    const up = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size === 0) {
        grab = null;
        el.classList.remove('dragging');
      } else if (grab) hold(grab.dragging);
    };
    const click = (e: MouseEvent) => {
      if (!swallow) return;
      swallow = false;
      e.stopPropagation();
      e.preventDefault();
    };
    const menu = (e: MouseEvent) => {
      if (e.target instanceof HTMLCanvasElement) e.preventDefault();
    };
    // Capturing, so that a drag is settled before the office itself hears of the pointer.
    el.addEventListener('pointerdown', down, true);
    el.addEventListener('pointermove', move, true);
    el.addEventListener('pointerup', up, true);
    el.addEventListener('pointercancel', up, true);
    el.addEventListener('click', click, true);
    el.addEventListener('contextmenu', menu);
    return () => {
      el.removeEventListener('pointerdown', down, true);
      el.removeEventListener('pointermove', move, true);
      el.removeEventListener('pointerup', up, true);
      el.removeEventListener('pointercancel', up, true);
      el.removeEventListener('click', click, true);
      el.removeEventListener('contextmenu', menu);
      el.classList.remove('dragging');
    };
  }, [reach]);

  // What is being placed or moved follows the arrow keys from tile to tile, and Enter puts it down. The keys go
  // by the screen, whichever way the view is turned: up is away from you, along the tiles.
  const carried = props.placing ?? liftedPiece(props.game, props.moving)?.type ?? null;
  const { game, cursor, onPoint, onPlace } = props;
  useEffect(() => {
    // The keys are for the office from here on, not for the button that started it.
    if (carried) root.current?.focus({ preventScroll: true });
  }, [carried, props.moving?.furnitureId]);
  // A hand set on the canvas by what was under the pointer would beat the cursor for placing or drawing.
  const busy = carried != null || props.drawing != null;
  useEffect(() => {
    if (busy && root.current) root.current.querySelector('canvas')?.style.removeProperty('cursor');
  }, [busy]);
  useEffect(() => {
    if (!carried) return;
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || !cursor) return;
      const arrow = ARROWS[e.key];
      if (arrow) {
        const room = findRoom(game, cursor.roomId);
        if (!room) return;
        e.preventDefault();
        const quarter = (((turn % 4) + 4) % 4) * (Math.PI / 2);
        const [right, up] = arrow;
        const dx = Math.round(Math.cos(quarter) * right - Math.sin(quarter) * up);
        const dy = Math.round(-Math.sin(quarter) * right - Math.cos(quarter) * up);
        onPoint({ roomId: cursor.roomId, x: Math.min(room.w - 1, Math.max(0, cursor.x + dx)), y: Math.min(room.h - 1, Math.max(0, cursor.y + dy)) });
      } else if (e.key === 'Enter' && !(e.target as HTMLElement | null)?.closest('button, a, summary')) {
        e.preventDefault();
        onPlace(cursor.roomId, cursor.x, cursor.y, true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [carried, game, cursor, turn, onPoint, onPlace]);

  return (
    <div ref={root} tabIndex={-1} className={carried ? 'office3d placing' : props.drawing ? 'office3d building' : 'office3d'} onWheel={(e) => zoomBy(Math.exp(-e.deltaY * 0.0015))}>
      <Canvas
        orthographic
        flat
        shadows="basic"
        dpr={[1, 2]}
        frameloop={props.still ? 'demand' : 'always'}
        camera={{ near: -100, far: 300, position: [cx + 40, frame.center[1] + 40, cz + 40] }}
        role="img"
        aria-label={props.floor > building.floors ? 'The roof of the office in 3D, with its antenna.' : `The office in 3D, floor ${props.floor}. The room buttons above it pick a room with the keyboard.`}
      >
        <Rig view={view} turn={turn} still={props.still} frame={frame} />
        <ambientLight intensity={2.1} />
        <directionalLight
          position={[cx - 6, 22, cz + 9]}
          intensity={1.5}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-19 * frame.scale}
          shadow-camera-right={19 * frame.scale}
          shadow-camera-top={19 * frame.scale}
          shadow-camera-bottom={-19 * frame.scale}
          target-position={frame.center}
        />
        <ViewTurn.Provider value={((turn % 4) + 4) % 4}>
          <World.Provider value={world}>
            <Shape.Provider value={building}>
              <Suspense fallback={null}>
                {props.floor > building.floors ? <Roof game={props.game} still={props.still} materials={materials} cables={props.cables} /> : <Floor {...props} materials={materials} anchor={anchor} />}
              </Suspense>
            </Shape.Provider>
          </World.Provider>
        </ViewTurn.Provider>
      </Canvas>
      {props.pieceWindow && <div className="piece-anchor" ref={anchor}>{props.pieceWindow}</div>}
      <div className="view-controls" role="group" aria-label="View">
        <button onClick={() => setTurn((t) => t - 1)} aria-label="Turn the view left" title="Turn left (Q)">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M4 3v4h4M4.4 7A6 6 0 1 1 3 11" fill="none" stroke="currentColor" strokeWidth="2.2" /></svg>
        </button>
        <button onClick={() => setTurn((t) => t + 1)} aria-label="Turn the view right" title="Turn right (E)">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M14 3v4h-4M13.6 7A6 6 0 1 0 15 11" fill="none" stroke="currentColor" strokeWidth="2.2" /></svg>
        </button>
        <button onClick={() => zoomBy(1 / CAMERA.zoomStep)} aria-label="Zoom out" title="Zoom out (−)">−</button>
        <button onClick={() => zoomBy(CAMERA.zoomStep)} aria-label="Zoom in" title="Zoom in (+)">+</button>
        <button onClick={reset} aria-label="Put the view back" title="Put the view back (0)">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2.5 9 9 3l6.5 6M5 8v7h8V8" fill="none" stroke="currentColor" strokeWidth="2.2" /></svg>
        </button>
      </div>
    </div>
  );
}

/**
 * A true isometric camera. It fits the whole floor at any canvas size, then
 * applies the player's zoom, turn and position, each within its limit.
 */
function Rig({ view, turn, still, frame }: { view: RefObject<View>; turn: number; still: boolean; frame: Frame }) {
  const CENTER = frame.center;
  const camera = useThree((s) => s.camera);
  const { width, height } = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const angle = useRef(turn * (Math.PI / 2));

  useEffect(() => {
    view.current.redraw = invalidate;
    invalidate();
  }, [view, invalidate, turn, width, height, frame]);

  useFrame((_, elapsed) => {
    const v = view.current;
    const dt = Math.min(elapsed, 0.05);
    const target = turn * (Math.PI / 2);
    const turning = Math.abs(target - angle.current) > 0.001;
    angle.current = still || !turning ? target : angle.current + (target - angle.current) * Math.min(1, dt * CAMERA.turnRate);

    // The camera stands on a diagonal: a quarter turn brings it to the next corner of the office.
    const a = angle.current + Math.PI / 4;
    const right = (v.keys.has('d') ? 1 : 0) - (v.keys.has('a') ? 1 : 0);
    const up = (v.keys.has('w') ? 1 : 0) - (v.keys.has('s') ? 1 : 0);
    if (right || up) {
      const step = (CAMERA.speed * dt) / v.zoom;
      const reach = CAMERA.reach * frame.scale;
      const limit = (n: number) => Math.min(reach, Math.max(-reach, n));
      // Right and up as they look on screen, whichever way the view is turned.
      v.x = limit(v.x + (Math.cos(a) * right - Math.sin(a) * up) * step);
      v.z = limit(v.z + (-Math.sin(a) * right - Math.cos(a) * up) * step);
    }

    const distance = 40 * Math.SQRT2;
    camera.position.set(CENTER[0] + v.x + Math.sin(a) * distance, CENTER[1] + 40, CENTER[2] + v.z + Math.cos(a) * distance);
    camera.lookAt(CENTER[0] + v.x, CENTER[1], CENTER[2] + v.z);
    camera.zoom = (Math.min(width / VIEW.width, height / VIEW.height) / frame.scale) * v.zoom;
    camera.updateProjectionMatrix();
    v.angle = a;
    v.px = camera.zoom;
    if (right || up || turning) invalidate();
  });
  return null;
}
