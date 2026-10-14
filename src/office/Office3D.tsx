// The office in 3D (prompt.md sections 3, 12 and 13): an isometric view of one
// floor that can be zoomed, turned in quarter turns and moved a little. It
// only reads state and reports clicks. What things look like comes from the asset registry (assets.ts),
// where people are from layout.ts, and every color from the theme tokens.

import { Html, useAnimations, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Suspense, createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CLEANLINESS } from '../config/balance';
import { bodyFile, type Look } from '../config/looks';
import { BUILDINGS, CORE, FLOOR, FURNITURE, ROOM_SIZES, ROOM_TYPE_NAMES, WEST, buildable, buildingFor, coreWalls, wallsOf, widthOf, type Building, type FurnitureType, type RoomLayout, type RoomType } from '../config/office';
import { borrowedDesks, deskHolders, doorways, findRoom, footprint, isBroken, isFurnished, placementError, roomsTaking, workplacesIn } from '../sim/office';
import { doorSpots, kindError, roomError } from '../sim/rooms';
import type { Furniture, GameState, Id, RentedRoom, Role, Show } from '../sim/state';
import { purchaseTier } from '../sim/tech';
import { ANIMATIONS, CITY, FURNITURE_ASSETS, MATERIAL_TONES, MODELS, CHARACTER_SCALE, MODEL_SCALE, SEAT_HEIGHT, characterFor, modelUrl, type ModelId, type Part, type Tone } from './assets';
import { PAVEMENT, RAILWAY, STREET, hidesOffice, officeBlock, streetLevel, townBlocks, trainAt, type TownBlock } from './city';
import { SITES, type Ground, type Site } from './sites';
import { partOf, restyle } from './looks';
import { BUS_STOP, HOUR_SECONDS, createTraffic, lightFor, placeOf, signalsOf, stepTraffic, vehiclesIn, type Traffic, type VehicleKind } from './traffic';
import { createStreet, stepStreet, strollerAt, strollers, type Street } from './street';
import { CEO_ID, tripsOf, type Trip } from './day';
import { OFFICE_DAY, getRegion, type RegionId } from '../config/world';
import { CORRIDOR_Z, audienceBlocks, partsAt, peopleOnFloor, roomsOnFloor, showsOnAir, slotAt, type Person } from './layout';
import { walkPath } from './routes';

interface Props {
  game: GameState;
  floor: number;
  selectedRoomId: string | null;
  selectedFurnitureId: Id | null;
  /** Furniture type being placed, if any: it can go in every rented room on the floor that takes it. */
  placing: FurnitureType | null;
  /** Quarter turns of the furniture being placed or moved. */
  placingTurn: number;
  /** The piece that was picked up to be put somewhere else, if any: it goes wherever its kind can go. */
  moving: { roomId: string; furnitureId: Id } | null;
  /** The tile that what is being placed or moved is over, if any. */
  cursor: { roomId: string; x: number; y: number } | null;
  /** The pointer or the arrow keys went to another tile, or left the rooms. */
  onPoint: (cursor: { roomId: string; x: number; y: number } | null) => void;
  /** The small window of the selected piece of furniture: it is kept beside the piece. */
  pieceWindow?: ReactNode;
  /** No walking and no moving poses. */
  still: boolean;
  /** Where the office is in its own day; see ROUTINE in layout.ts. */
  beat: number;
  /** The game's time in seconds at normal speed: what the town and its traffic run on, so they stop when the game does. */
  now: () => number;
  /** The time on the office clock, in hours that keep counting from one day into the next (`officeHours` in calendar.ts). */
  hours: () => number;
  /** How fast the game runs: 0 when paused. People walk and move at this pace. */
  pace: number;
  onSelectRoom: (roomId: string) => void;
  /** The person whose details are shown, if any. */
  selectedPersonId: Id | null;
  onSelectFurniture: (furnitureId: Id) => void;
  onSelectPerson: (personId: Id) => void;
  /** A tile was picked for what is being placed or moved: with a click, or with Enter (`byKey`). */
  onPlace: (roomId: string, x: number, y: number, byKey?: boolean) => void;
  /** The room being drawn, if any: what was dragged so far and the door it has (see `Drawing` in ui/officeView.ts). */
  drawing: { roomId: string | null; kind?: RoomType | null; rect: Rect | null; door: { x: number; z: number } | null } | null;
  /** A rectangle was dragged on the floor. */
  onDrawRect: (rect: Rect) => void;
  /** A place in the wall of the drawn rectangle was picked for the door. */
  onDrawDoor: (door: { x: number; z: number }) => void;
}

type Rect = { x: number; y: number; w: number; h: number };

// --- Colors: read from the theme tokens, so the 3D view follows light and dark ---

const TONE_TOKENS: Record<Tone, string> = {
  wood: '--o3-wood',
  woodDark: '--o3-wood-dark',
  fabric: '--o3-fabric',
  fabricDark: '--o3-fabric-dark',
  white: '--o3-white',
  plant: '--o3-plant',
  metal: '--o3-metal',
  metalMid: '--o3-metal-mid',
  metalDark: '--o3-metal-dark',
  lamp: '--o3-lamp',
  onAir: '--o3-on-air',
  accent: '--o3-accent',
  street: '--o3-street',
  pavement: '--o3-pavement',
  facade: '--o3-facade',
  trim: '--o3-trim',
  glass: '--o3-glass',
  grass: '--o3-grass',
  sand: '--o3-sand',
  water: '--o3-water',
  field: '--o3-field',
};

const SURFACE_TOKENS = {
  base: '--o3-base',
  wall: '--o3-wall',
  backWall: '--o3-wall-back',
  corridor: '--fp-corridor',
  vacant: '--fp-hatch',
  unassigned: '--fp-floor',
  office: '--fp-office',
  managementOffice: '--fp-management',
  ceoOffice: '--fp-ceo',
  radioStudio: '--fp-radio',
  radioTalkStudio: '--fp-talk',
  tvTalkStudio: '--fp-tv',
  tvGameStudio: '--fp-tv',
  tvSoapStudio: '--fp-tv',
  tvNewsStudio: '--fp-tv',
  tvProductionStudio: '--fp-tv',
  controlRoom: '--fp-control',
  library: '--fp-library',
  canteen: '--fp-canteen',
  toilets: '--fp-toilets',
  reception: '--fp-reception',
  dirt: '--fp-dirt',
  select: '--o3-select',
  city: '--o3-city',
  good: '--good',
  bad: '--negative',
} satisfies Record<string, string>;

type Surface = keyof typeof SURFACE_TOKENS;
type Materials = Record<Tone | Surface, THREE.MeshLambertMaterial>;

function readColors(): Record<string, string> {
  const css = getComputedStyle(document.documentElement);
  return Object.fromEntries(Object.entries({ ...TONE_TOKENS, ...SURFACE_TOKENS }).map(([key, token]) => [key, css.getPropertyValue(token).trim()]));
}

/** One shared flat material per color; rebuilt when the color scheme changes (the root element's data-theme). */
function useMaterials(): Materials {
  const [colors, setColors] = useState(readColors);
  useEffect(() => {
    const scheme = new MutationObserver(() => setColors(readColors()));
    scheme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => scheme.disconnect();
  }, []);
  return useMemo(
    () => Object.fromEntries(Object.entries(colors).map(([key, color]) => [key, new THREE.MeshLambertMaterial({ color, flatShading: true })])) as Materials,
    [colors],
  );
}

// --- The view ---

/** How much of the floor the view shows at least, across and down, in tiles. */
const VIEW = { width: 28.8, height: 21 };
const WALL = { low: 0.3, high: 1.5, thick: 0.12 };

/**
 * Where the view looks and how much it shows, for a building: at the middle of
 * its floor and a little below it, which leaves room under the office for the
 * street. A longer building is seen from further away, so that it fits.
 */
function frameOf(building: Building): { center: [number, number, number]; scale: number } {
  const scale = (widthOf(building) + FLOOR.h) / (widthOf(BUILDINGS.standard) + FLOOR.h);
  return { center: [WEST + widthOf(building) / 2 - 0.4, -1.6, FLOOR.h / 2 - 0.4], scale };
}
type Frame = ReturnType<typeof frameOf>;

/** How far the player can change the view. */
const CAMERA = {
  /** Zoom, as a factor of the view that fits the whole floor. */
  minZoom: 0.65,
  maxZoom: 2.2,
  /** One press of a zoom button or key. */
  zoomStep: 1.25,
  /** How far the view can move from the middle of the floor, in tiles each way. */
  reach: 9,
  /** Tiles per second when a key is held, at the starting zoom. */
  speed: 14,
  /** How fast the view follows a quarter turn; higher is quicker. */
  turnRate: 9,
  /** How far the pointer travels, in pixels, before a press counts as dragging the view and no longer as a click. */
  drag: { mouse: 5, touch: 10 },
  /** A tile looks this much shorter from front to back than from side to side: the sine of the camera's angle to the floor. */
  depth: 1 / Math.sqrt(3),
};

/** The view the player has set: zoom and where it looks. `redraw` asks for a new frame when the picture stands still. */
interface View {
  zoom: number;
  x: number;
  z: number;
  keys: Set<string>;
  /** As the camera stands now: the angle it looks from, and how many pixels a tile is wide. Dragging goes by these. */
  angle: number;
  px: number;
  redraw: () => void;
}

/** Quarter turns of the view, 0 to 3: which side of the office is looked at. */
const ViewTurn = createContext(0);

/** The building in view: the game's own, or in the preview the one a region gets. */
const Shape = createContext<Building>(BUILDINGS.standard);

/** The game's clock for everything that moves: see `now` and `pace` in Props. */
const World = createContext<{ now: () => number; hours: () => number; pace: number }>({ now: () => 0, hours: () => 0, pace: 1 });

const MOVE_KEYS = ['w', 'a', 's', 'd'];
const typing = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement | null;
  return e.ctrlKey || e.metaKey || e.altKey || Boolean(target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
};

/** The arrow keys as a step on the screen: [to the right, upwards]. */
const ARROWS: Record<string, [right: number, up: number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };

/** The piece that is being moved, if it is still there. */
const liftedPiece = (game: GameState, moving: Props['moving']) => (moving ? findRoom(game, moving.roomId)?.furniture.find((f) => f.id === moving.furnitureId) : undefined);

export function Office3D(props: Props) {
  const materials = useMaterials();
  const root = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  /** Quarter turns of the view; it keeps counting, so the view always turns the short way. */
  const [turn, setTurn] = useState(0);
  const view = useRef<View>({ zoom: 1, x: 0, z: 0, keys: new Set(), angle: Math.PI / 4, px: 1, redraw: () => {} });
  const { now, hours, pace } = props;
  const world = useMemo(() => ({ now, hours, pace }), [now, hours, pace]);
  const building = BUILDINGS[props.game.building];
  const frame = useMemo(() => frameOf(building), [building]);
  const [cx, , cz] = frame.center;

  const zoomBy = (factor: number) => {
    view.current.zoom = Math.min(CAMERA.maxZoom, Math.max(CAMERA.minZoom, view.current.zoom * factor));
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
      if (grab.spread > 0 && at.spread > 0) v.zoom = Math.min(CAMERA.maxZoom, Math.max(CAMERA.minZoom, (grab.zoom * at.spread) / grab.spread));
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
    <div ref={root} tabIndex={-1} className={carried ? 'office3d placing' : 'office3d'} onWheel={(e) => zoomBy(Math.exp(-e.deltaY * 0.0015))}>
      <Canvas
        orthographic
        flat
        shadows="basic"
        dpr={[1, 2]}
        frameloop={props.still ? 'demand' : 'always'}
        camera={{ near: 1, far: 300, position: [cx + 40, frame.center[1] + 40, cz + 40] }}
        role="img"
        aria-label={`The office in 3D, floor ${props.floor}. The room buttons above it pick a room with the keyboard.`}
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
                <Floor {...props} materials={materials} anchor={anchor} />
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

function Floor({ game, floor, selectedRoomId, selectedFurnitureId, selectedPersonId, placing, placingTurn, moving, cursor: hover, onPoint, still, beat, onSelectRoom, onSelectFurniture, onSelectPerson, onPlace, drawing, onDrawRect, onDrawDoor, materials, anchor }: Props & { materials: Materials; anchor: RefObject<HTMLDivElement | null> }) {
  const layouts = roomsOnFloor(game, floor);
  const building = useContext(Shape);
  const wide = widthOf(building);
  // What is on the pointer: a new piece that is being placed, or one that was picked up to be moved.
  const lifted = liftedPiece(game, moving);
  const carried = placing ?? lifted?.type ?? null;
  // The rooms on this floor that it can go in.
  const targets = carried ? roomsTaking(game, floor, carried).flatMap((room) => {
    const layout = layouts.find((l) => l.id === room.roomId);
    return layout ? [{ layout, room }] : [];
  }) : [];
  // The selected piece, which its small window is kept beside.
  const picked = selectedFurnitureId ? layouts.flatMap((layout) => {
    const item = findRoom(game, layout.id)?.furniture.find((f) => f.id === selectedFurnitureId);
    return item ? [{ layout, item, size: footprint(item.type, item.turn) }] : [];
  })[0] : undefined;
  const borrowed = useMemo(() => borrowedDesks(game), [game]);
  /** How many of the workplaces of each room are taken, for the rooms that have any. */
  const occupancy = useMemo(() => {
    const holders = deskHolders(game);
    return new Map(game.rooms.flatMap((room): [string, string][] => {
      const places = workplacesIn(room);
      return places.length > 0 ? [[room.roomId, `${places.filter((item) => holders.has(item.id)).length} of ${places.length} places taken`]] : [];
    }));
  }, [game]);
  const people = useMemo(() => peopleOnFloor(game, floor, beat), [game, floor, beat]);
  const live = useMemo(() => showsOnAir(game, slotAt(beat)), [game, beat]);
  // What is being placed is drawn as itself, in one see-through color: green where it fits, red where it doesn't.
  const ghostMaterials = useMemo(() => {
    const all = (source: THREE.MeshLambertMaterial) => {
      const one = new THREE.MeshLambertMaterial({ color: source.color, transparent: true, opacity: 0.62, depthWrite: false, flatShading: true });
      return Object.fromEntries(Object.keys(materials).map((key) => [key, one])) as Materials;
    };
    return { fits: all(materials.good), blocked: all(materials.bad) };
  }, [materials]);
  /** A rectangle that is being dragged, from the tile where the pointer went down to the one it is over. */
  const [drag, setDrag] = useState<{ from: [number, number]; to: [number, number]; moved: boolean } | null>(null);
  useRedraw([game, floor, beat, selectedRoomId, selectedFurnitureId, selectedPersonId, placing, placingTurn, moving, hover, materials, drawing, drag]);
  const ghostSize = carried ? footprint(carried, placingTurn) : null;

  const tileAt = (e: ThreeEvent<PointerEvent | MouseEvent>, layout: RoomLayout) => ({
    x: Math.floor(e.point.x) - layout.x,
    y: Math.floor(e.point.z) - layout.y,
  });
  const under = hover ? targets.find((t) => t.layout.id === hover.roomId) : undefined;
  const ghost = carried && hover && under ? { ...hover, layout: under.layout, valid: placementError(game, under.room, carried, hover.x, hover.y, placingTurn, lifted?.id) === null } : null;

  return (
    <group>
      <Town floor={floor} seed={game.seed} site={SITES[game.headquarters]} game={game} still={still} materials={materials} />
      {/* The slab the floor stands on, and the floor itself: corridor wherever no room is. */}
      <mesh position={[WEST + wide / 2, -0.2, FLOOR.h / 2]} material={materials.base} receiveShadow>
        <boxGeometry args={[wide + 0.4, 0.4, FLOOR.h + 0.4]} />
      </mesh>
      <mesh position={[building.w / 2, 0.005, FLOOR.h / 2]} rotation={[-Math.PI / 2, 0, 0]} material={materials.corridor} receiveShadow>
        <planeGeometry args={[building.w, FLOOR.h]} />
      </mesh>
      <OuterWalls materials={materials} />
      <Html position={[WEST + 1.2, 0.02, CORRIDOR_Z]} center className="o3-corridor" zIndexRange={[4, 0]}>
        {game.companyName.toUpperCase()} · FLOOR {floor}
      </Html>
      <Core floor={floor} materials={materials} />

      {layouts.map((layout) => (
        <Room
          key={layout.id}
          layout={layout}
          room={findRoom(game, layout.id)}
          selected={layout.id === selectedRoomId}
          selectedFurnitureId={selectedFurnitureId}
          interactive={!carried && !drawing}
          faded={layout.id === drawing?.roomId}
          liftedId={lifted?.id}
          note={occupancy.get(layout.id)}
          onAir={live.filter((show) => show.studioId === layout.id || borrowed.get(show.studioId!)?.roomId === layout.id)}
          materials={materials}
          onSelect={() => onSelectRoom(layout.id)}
          onSelectFurniture={onSelectFurniture}
        />
      ))}

      {people.map((person) => (
        <Suspense key={person.role === 'ceo' ? `${person.id}:${lookKey(game.look)}` : person.id} fallback={null}>
          <Character
            person={person}
            game={game}
            look={person.role === 'ceo' ? game.look : undefined}
            still={still}
            selected={person.id === selectedPersonId}
            materials={materials}
            onSelect={carried || drawing ? undefined : () => onSelectPerson(person.id)}
          />
        </Suspense>
      ))}

      {/* While placing, the floor of every room the piece can go in catches the pointer, also where furniture stands in front of it. */}
      {targets.map(({ layout }) => (
        <mesh
          key={layout.id}
          position={[layout.x + layout.w / 2, 0.03, layout.y + layout.h / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerMove={(e) => onPoint({ roomId: layout.id, ...tileAt(e, layout) })}
          onPointerOut={() => hover?.roomId === layout.id && onPoint(null)}
          onClick={(e) => {
            e.stopPropagation();
            const tile = tileAt(e, layout);
            onPlace(layout.id, tile.x, tile.y);
          }}
        >
          <planeGeometry args={[layout.w, layout.h]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      {/* The rooms it can go in are marked, so it is clear where to point. */}
      {targets.map(({ layout }) => (
        <mesh key={`mark-${layout.id}`} position={[layout.x + layout.w / 2, 0.025, layout.y + layout.h / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[layout.w - 0.2, layout.h - 0.2]} />
          <meshBasicMaterial color={materials.good.color} transparent opacity={0.14} depthWrite={false} />
        </mesh>
      ))}
      {/* The floor in front of a door stays clear: those tiles are marked too. */}
      {targets.flatMap(({ room }) => doorways(game, room)).map(([x, y]) => (
        <mesh key={`door-${x}:${y}`} position={[x + 0.5, 0.032, y + 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.94, 0.94]} />
          <meshBasicMaterial color={materials.bad.color} transparent opacity={0.3} depthWrite={false} />
        </mesh>
      ))}
      {picked && <Anchor el={anchor} box={{ x: picked.layout.x + picked.item.x, z: picked.layout.y + picked.item.y, w: picked.size.w, d: picked.size.h, height: 1.6 }} />}
      {ghost && ghostSize && carried && (
        <>
          <mesh position={[ghost.layout.x + ghost.x + ghostSize.w / 2, 0.04, ghost.layout.y + ghost.y + ghostSize.h / 2]}>
            <boxGeometry args={[ghostSize.w - 0.06, 0.04, ghostSize.h - 0.06]} />
            <meshBasicMaterial color={(ghost.valid ? materials.good : materials.bad).color} transparent opacity={0.45} depthWrite={false} />
          </mesh>
          {/* A piece that was never shown before has its model to fetch. Only the piece waits for that: without a boundary of its own the whole floor would, and the view would go blank for a moment. */}
          <Suspense fallback={null}>
            <FurnitureModel
              item={{ id: 'ghost', type: carried, x: ghost.x, y: ghost.y, turn: placingTurn, tier: lifted?.tier ?? purchaseTier(game, carried), condition: 100, boughtOn: 0 }}
              origin={[ghost.layout.x + ghost.x, ghost.layout.y + ghost.y]}
              selected={false}
              live
              materials={ghost.valid ? ghostMaterials.fits : ghostMaterials.blocked}
            />
          </Suspense>
        </>
      )}
      {drawing && <DrawingLayer game={game} floor={floor} drawing={drawing} drag={drag} setDrag={setDrag} onDrawRect={onDrawRect} onDrawDoor={onDrawDoor} materials={materials} />}
    </group>
  );
}

/** How far from the top of the office an element that is kept beside a piece has to stay, clear of the bar with the floors and rooms; and from the foot, clear of the view controls. */
const ANCHOR_MARGIN = { top: 92, foot: 64, gap: 10 };

/**
 * Keeps an element of the page beside a box in the office, such as a piece of
 * furniture: above it, or under it where there is no room above. It gets where
 * to be on the canvas, in pixels, as `--x` (its middle) and `--top`, and shows
 * once it has them. The stylesheet does the rest.
 */
function Anchor({ el, box }: { el: RefObject<HTMLDivElement | null>; box: { x: number; z: number; w: number; d: number; height: number } }) {
  const point = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    const node = el.current;
    if (!node) return;
    const onCanvas = (x: number, y: number, z: number): [number, number] => {
      point.set(x, y, z).project(camera);
      return [((point.x + 1) / 2) * size.width, ((1 - point.y) / 2) * size.height];
    };
    const [x, head] = onCanvas(box.x + box.w / 2, box.height, box.z + box.d / 2);
    // The lowest corner of what it stands on, whichever way the view is turned.
    const foot = Math.max(...[[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dz]) => onCanvas(box.x + dx! * box.w, 0, box.z + dz! * box.d)[1]));
    const above = head - node.offsetHeight;
    const top = above >= ANCHOR_MARGIN.top ? above : Math.min(foot + ANCHOR_MARGIN.gap, size.height - node.offsetHeight - ANCHOR_MARGIN.foot);
    node.style.setProperty('--x', x.toFixed(1));
    node.style.setProperty('--top', top.toFixed(1));
    node.style.opacity = '1';
  });
  return null;
}

/**
 * The outer walls of the part of a floor where the rooms are: low at the front
 * of the view, so the rooms stay visible, and tall at the back. The block at
 * the head of the floor draws its own.
 */
function OuterWalls({ materials }: { materials: Materials }) {
  const building = useContext(Shape);
  const viewTurn = useContext(ViewTurn);
  const fromSouth = viewTurn === 0 || viewTurn === 3;
  const fromEast = viewTurn <= 1;
  const east = building.w;
  const walls: [key: string, x: number, z: number, w: number, d: number, tall: boolean][] = [
    ['n', east / 2, 0, east, 0, fromSouth],
    ['s', east / 2, FLOOR.h, east, 0, !fromSouth],
    ['e', east, FLOOR.h / 2, 0, FLOOR.h, !fromEast],
  ];
  return (
    <>
      {walls.map(([key, x, z, w, d, tall]) => (
        <mesh key={key} position={[x, (tall ? WALL.high : WALL.low) / 2, z]} material={tall ? materials.backWall : materials.wall} castShadow receiveShadow>
          <boxGeometry args={[w + WALL.thick, tall ? WALL.high : WALL.low, d + WALL.thick]} />
        </mesh>
      ))}
    </>
  );
}

/** How near a wall of the drawn rectangle the pointer has to be for a click to mean its door, in tiles. */
const DOOR_REACH = 0.8;

/**
 * Drawing a room on the floor. Dragging lays out its rectangle, from the tile
 * where the pointer goes down to the one where it comes up; a click on or
 * near a wall of that rectangle puts the door there. What is drawn shows
 * green where it can be built and red where it can't.
 */
function DrawingLayer({ game, floor, drawing, drag, setDrag, onDrawRect, onDrawDoor, materials }: {
  game: GameState;
  floor: number;
  drawing: NonNullable<Props['drawing']>;
  drag: { from: [number, number]; to: [number, number]; moved: boolean } | null;
  setDrag: (drag: { from: [number, number]; to: [number, number]; moved: boolean } | null) => void;
  onDrawRect: Props['onDrawRect'];
  onDrawDoor: Props['onDrawDoor'];
  materials: Materials;
}) {
  const building = useContext(Shape);
  const area = buildable(building, floor);
  const [near, setNear] = useState<{ x: number; z: number } | null>(null);
  /** The tile under the pointer, kept on the floor that can be built on. */
  const tileAt = (e: ThreeEvent<PointerEvent>): [number, number] => [
    Math.min(area.x + area.w - 1, Math.max(area.x, Math.floor(e.point.x))),
    Math.min(area.y + area.h - 1, Math.max(area.y, Math.floor(e.point.z))),
  ];
  const between = (a: [number, number], b: [number, number]): Rect => ({ x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]) + 1, h: Math.abs(a[1] - b[1]) + 1 });
  /** The place for a door nearest the pointer, if the pointer is at a wall of the rectangle. */
  const spotAt = (e: ThreeEvent<PointerEvent>, rect: Rect) => {
    const spots = doorSpots(rect).map((spot) => ({ spot, distance: Math.hypot(spot.x - e.point.x, spot.z - e.point.z) }));
    const best = spots.sort((a, b) => a.distance - b.distance)[0];
    return best && best.distance <= DOOR_REACH ? best.spot : null;
  };

  const rect = drag?.moved ? between(drag.from, drag.to) : drawing.rect;
  const door = drag?.moved ? null : drawing.door;
  // A kind of room that can't be built yet is in the way wherever the outline is.
  const kind = drawing.roomId ? null : drawing.kind;
  const error = rect ? ((kind && kindError(game, kind)) ?? roomError(game, { floor, ...rect, door }, drawing.roomId ?? undefined)) : null;
  /** The size the game would give a room of this kind, where the outline is another size. */
  const usual = kind && rect && !(Math.min(rect.w, rect.h) === Math.min(ROOM_SIZES[kind].w, ROOM_SIZES[kind].h) && Math.max(rect.w, rect.h) === Math.max(ROOM_SIZES[kind].w, ROOM_SIZES[kind].h)) ? ROOM_SIZES[kind] : null;
  // The place the pointer is at shows as a door too, in the color of whether one can be there.
  const hint = near && rect && !drag?.moved && !(door && door.x === near.x && door.z === near.z) ? near : null;
  const hintFits = hint && rect ? roomError(game, { floor, ...rect, door: hint }, drawing.roomId ?? undefined) === null : false;
  const tone = error ? materials.bad : materials.good;

  return (
    <group>
      {/* The floor that can be built on, marked, and a sheet over everything that catches the pointer. */}
      <mesh position={[area.x + area.w / 2, 0.022, area.y + area.h / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[area.w, area.h]} />
        <meshBasicMaterial color={materials.good.color} transparent opacity={0.08} depthWrite={false} />
      </mesh>
      <mesh
        position={[area.x + area.w / 2, 0.06, area.y + area.h / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          (e.target as Element).setPointerCapture?.(e.pointerId);
          setDrag({ from: tileAt(e), to: tileAt(e), moved: false });
        }}
        onPointerMove={(e) => {
          if (!drag) return setNear(drawing.rect ? spotAt(e, drawing.rect) : null);
          const to = tileAt(e);
          if (to[0] !== drag.to[0] || to[1] !== drag.to[1]) setDrag({ from: drag.from, to, moved: true });
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          (e.target as Element).releasePointerCapture?.(e.pointerId);
          if (!drag) return;
          setDrag(null);
          if (drag.moved) return onDrawRect(between(drag.from, drag.to));
          // No drag: a click. At a wall of the rectangle it is where the door goes.
          const spot = drawing.rect && spotAt(e, drawing.rect);
          if (spot) onDrawDoor(spot);
        }}
        onPointerOut={() => setNear(null)}
      >
        <planeGeometry args={[area.w + 60, area.h + 60]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {rect && (
        <>
          <mesh position={[rect.x + rect.w / 2, 0.05, rect.y + rect.h / 2]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[rect.w, rect.h]} />
            <meshBasicMaterial color={tone.color} transparent opacity={0.4} depthWrite={false} />
          </mesh>
          {wallsOf({ ...rect, door: door ?? { x: NaN, z: NaN } }).map(([x1, z1, x2, z2], n) => (
            <mesh key={n} position={[(x1 + x2) / 2, 0.3, (z1 + z2) / 2]}>
              <boxGeometry args={[x2 - x1 + WALL.thick, 0.6, z2 - z1 + WALL.thick]} />
              <meshBasicMaterial color={tone.color} transparent opacity={0.7} depthWrite={false} />
            </mesh>
          ))}
          {[door && { at: door, fits: !error }, hint && { at: hint, fits: hintFits }].map(
            (mark, n) =>
              mark && (
                <mesh key={n} position={[mark.at.x, 0.07, mark.at.z]} rotation={[-Math.PI / 2, 0, 0]}>
                  <circleGeometry args={[n === 0 ? 0.42 : 0.3, 20]} />
                  <meshBasicMaterial color={(mark.fits ? materials.lamp : materials.bad).color} transparent opacity={n === 0 ? 0.95 : 0.6} depthWrite={false} />
                </mesh>
              ),
          )}
          <Html position={[rect.x + rect.w / 2, 1.2, rect.y + rect.h / 2]} center className={error ? 'o3-label o3-drawing bad' : 'o3-label o3-drawing'} zIndexRange={[8, 0]}>
            <strong>{kind ? `${ROOM_TYPE_NAMES[kind]} · ` : ''}{rect.w} × {rect.h} tiles</strong>
            {usual && <span className="o3-usual">usual size {usual.w} × {usual.h}</span>}
            {error && <span>{error}</span>}
          </Html>
        </>
      )}
    </group>
  );
}

// --- The block at the head of the floor: hall, stairs, lifts and the two service rooms ---

/**
 * The part of the building west of the corridor, the same on every floor: the
 * hall in line with the corridor (the reception on the ground floor, where its
 * furniture is drawn as a room), the stairs and the technicians' room to the
 * north of it, the lifts and the cleaners' room to the south.
 */
function Core({ floor, materials }: { floor: number; materials: Materials }) {
  const viewTurn = useContext(ViewTurn);
  const fromSouth = viewTurn === 0 || viewTurn === 3;
  const fromEast = viewTurn <= 1;
  const west = WEST;
  const { hall, technician, stairs, cleaners, lifts } = CORE;
  const south = hall.y + hall.h;
  /** Above the ground floor the block is only the stairs, the lifts and the hallway between them. */
  const upper = floor > 1;

  /** A wall from one point to another, along x or along z. */
  const wall = (key: string, from: [number, number], to: [number, number], tall = false) => {
    const height = tall ? WALL.high : WALL.low;
    const alongX = from[1] === to[1];
    const length = (alongX ? to[0] - from[0] : to[1] - from[1]) + WALL.thick;
    return (
      <mesh key={key} position={[(from[0] + to[0]) / 2, height / 2, (from[1] + to[1]) / 2]} material={tall ? materials.backWall : materials.wall} castShadow receiveShadow>
        <boxGeometry args={alongX ? [length, height, WALL.thick] : [WALL.thick, height, length]} />
      </mesh>
    );
  };
  const floorOf = (key: string, area: { x: number; y: number; w: number; h: number }, surface: Surface) => (
    <mesh key={key} position={[area.x + area.w / 2, 0.008, area.y + area.h / 2]} rotation={[-Math.PI / 2, 0, 0]} material={materials[surface]} receiveShadow>
      <planeGeometry args={[area.w, area.h]} />
    </mesh>
  );
  const sign = (text: string, x: number, z: number) => (
    <Html position={[x, 0.02, z]} center className="o3-corridor" zIndexRange={[4, 0]}>
      {text}
    </Html>
  );

  return (
    <group>
      {/* Floors: the strip inside the entrance and the two corners at the front; behind them the two small rooms, or upstairs open floor. */}
      {floorOf('strip', { x: west, y: hall.y, w: (upper ? CORE.upper : hall.x - west), h: hall.h }, 'corridor')}
      {upper && floorOf('open', { x: west + CORE.upper, y: 0, w: CORE.w - CORE.upper, h: FLOOR.h }, 'corridor')}
      {!upper && floorOf('technician', technician, 'unassigned')}
      {!upper && floorOf('cleaners', cleaners, 'unassigned')}
      {floorOf('stairs', stairs, 'corridor')}
      {floorOf('lifts', lifts, 'corridor')}

      {/* Outer walls; the ones at the back of the view stand tall. */}
      {wall('w-n', [west, 0], [west, hall.y], fromEast)}
      {wall('w-s', [west, south], [west, FLOOR.h], fromEast)}
      {wall('w-a', [west, hall.y], [west, hall.y + 1.5], fromEast)}
      {wall('w-b', [west, south - 1.5], [west, south], fromEast)}
      {wall('n', [west, 0], [0, 0], fromSouth)}
      {wall('s', [west, FLOOR.h], [0, FLOOR.h], !fromSouth)}
      {/* Inner walls: behind the stairs and the lifts, and around the two small rooms, each with its door. */}
      {coreWalls(floor).map(([x1, z1, x2, z2], n) => wall(`i${n}`, [x1, z1], [x2, z2]))}

      {/* The entrance on the ground floor: glass doors in line with the corridor. Higher up, a window. */}
      {floor === 1 ? (
        <>
          {[hall.y + 2, hall.y + 3].map((z) => (
            <mesh key={z} position={[west + 0.02, 0.66, z]} material={materials.glass}>
              <boxGeometry args={[0.07, 1.32, 0.96]} />
            </mesh>
          ))}
          <mesh position={[west + 0.02, 1.38, hall.y + 2.5]} material={materials.trim}>
            <boxGeometry args={[0.12, 0.12, 2.1]} />
          </mesh>
          <mesh position={[west + 0.9, 0.02, hall.y + 2.5]} material={materials.trim}>
            <boxGeometry args={[1.2, 0.03, 1.8]} />
          </mesh>
        </>
      ) : (
        <mesh position={[west, 0.9, hall.y + 2.5]} material={materials.glass}>
          <boxGeometry args={[0.08, 0.9, 1.9]} />
        </mesh>
      )}

      {/* The stairs: steps going up along the back wall. */}
      {[0, 1, 2, 3, 4, 5, 6].map((step) => (
        <mesh key={step} position={[stairs.x + 0.5 + step * 0.34, (0.16 * (step + 1)) / 2, stairs.y + 0.95]} material={step % 2 ? materials.metal : materials.metalMid} castShadow receiveShadow>
          <boxGeometry args={[0.34, 0.16 * (step + 1), 1.5]} />
        </mesh>
      ))}
      <mesh position={[stairs.x + 1.5, 0.75, stairs.y + 1.74]} material={materials.metalDark}>
        <boxGeometry args={[2.4, 0.06, 0.06]} />
      </mesh>
      {sign('STAIRS', stairs.x + 1.5, stairs.y + 2.5)}

      {/* Two lifts side by side, their doors to the hall. */}
      {[0.75, 2.25].map((dx, n) => (
        <group key={dx} position={[lifts.x + dx, 0, lifts.y + 0.9]}>
          <mesh position={[0, 0.6, 0]} material={materials.metalMid} castShadow>
            <boxGeometry args={[1.3, 1.2, 1.5]} />
          </mesh>
          <mesh position={[0, 0.5, -0.76]} material={materials.metal}>
            <boxGeometry args={[0.9, 1.0, 0.04]} />
          </mesh>
          <mesh position={[0, 0.5, -0.785]} material={materials.metalDark}>
            <boxGeometry args={[0.03, 1.0, 0.02]} />
          </mesh>
          <mesh position={[0, 1.1, -0.76]} material={n === 0 ? materials.lamp : materials.metalDark}>
            <boxGeometry args={[0.24, 0.1, 0.04]} />
          </mesh>
        </group>
      ))}
      {sign('LIFTS', lifts.x + 1.5, lifts.y + 2.4)}

      {/* The technicians' room: a workbench with tools, and a shelf of spare parts. */}
      <group position={[technician.x, 0, technician.y]} visible={!upper}>
        <mesh position={[1.5, 0.37, 0.4]} material={materials.wood} castShadow>
          <boxGeometry args={[2.2, 0.74, 0.5]} />
        </mesh>
        <mesh position={[1.0, 0.8, 0.4]} material={materials.metalDark}>
          <boxGeometry args={[0.5, 0.12, 0.3]} />
        </mesh>
        <mesh position={[1.9, 0.82, 0.4]} material={materials.lamp}>
          <boxGeometry args={[0.3, 0.16, 0.2]} />
        </mesh>
        <mesh position={[0.3, 0.6, 2.2]} material={materials.metalMid} castShadow>
          <boxGeometry args={[0.4, 1.2, 1.2]} />
        </mesh>
        {[0.35, 0.75].map((y) => (
          <mesh key={y} position={[0.52, y, 2.2]} material={materials.fabric}>
            <boxGeometry args={[0.06, 0.2, 0.9]} />
          </mesh>
        ))}
      </group>
      {!upper && sign('TECHNICIANS', technician.x + 1.5, technician.y + 2.6)}

      {/* The cleaners' room: a cart, a bucket with a mop, and a shelf. */}
      <group position={[cleaners.x, 0, cleaners.y]} visible={!upper}>
        <mesh position={[1.9, 0.4, 2.4]} material={materials.glass} castShadow>
          <boxGeometry args={[1.2, 0.8, 0.5]} />
        </mesh>
        <mesh position={[1.9, 0.86, 2.4]} material={materials.white}>
          <boxGeometry args={[1.0, 0.12, 0.36]} />
        </mesh>
        <mesh position={[0.5, 0.2, 2.4]} material={materials.lamp} castShadow>
          <cylinderGeometry args={[0.24, 0.2, 0.4, 12]} />
        </mesh>
        <mesh position={[0.5, 0.75, 2.4]} rotation={[0, 0, 0.2]} material={materials.wood}>
          <cylinderGeometry args={[0.03, 0.03, 1.4, 6]} />
        </mesh>
        <mesh position={[0.3, 0.6, 0.9]} material={materials.metalMid} castShadow>
          <boxGeometry args={[0.4, 1.2, 1.2]} />
        </mesh>
      </group>
      {!upper && sign('CLEANERS', cleaners.x + 1.5, cleaners.y + 0.5)}
    </group>
  );
}

// --- The town: the office is an upper floor of its own building, with streets and other buildings around it ---

function Town({ floor, seed, site, game, still, materials }: {
  floor: number;
  seed: number;
  site: Site;
  /** The game whose people come and go; without one the town has only its traffic and its strollers. */
  game?: GameState;
  still: boolean;
  materials: Materials;
}) {
  const depth = streetLevel(floor);
  const viewTurn = useContext(ViewTurn);
  const building = useContext(Shape);
  const own = officeBlock(building);
  const blocks = useMemo(() => townBlocks(seed, site, building), [seed, site, building]);
  const pad = { w: CITY.block.w - CITY.streetWidth, d: CITY.block.d - CITY.streetWidth };
  const tint = materials.city.color;
  // How far the town's blocks reach, for the land beyond them.
  const edge = { west: STREET.from.x, east: STREET.from.x + STREET.length.x, north: STREET.from.z, south: STREET.from.z + STREET.length.z + (site.front ? 2 * CITY.block.d : 0) };
  const beyond = (key: string, tone: Ground, x: number, z: number, w: number, d: number, y = 0.03) => (
    <mesh key={key} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]} material={materials[tone]}>
      <planeGeometry args={[w, d]} />
    </mesh>
  );
  // By the water: the shore along the last street and the water behind it, both as wide as the eye can see.
  const lastStreet = STREET.from.z + STREET.length.z;
  const shore = site.shore && { from: lastStreet + CITY.streetWidth / 2, to: lastStreet + CITY.block.d };

  return (
    <group>
      <FloorsBelow count={floor - 1} materials={materials} tint={tint} />

      <group position={[0, -depth, 0]}>
        <mesh position={[building.w / 2, 0, FLOOR.h / 2]} rotation={[-Math.PI / 2, 0, 0]} material={materials.street}>
          <planeGeometry args={[400, 400]} />
        </mesh>
        {/* Where the town is not all town, the land goes on beyond its last streets. */}
        {site.far && beyond('north', site.far, building.w / 2, edge.north - 100.5, 400, 200)}
        {site.far && beyond('west', site.far, edge.west - 100.5, FLOOR.h / 2, 200, 400)}
        {site.front && beyond('south', site.front, building.w / 2, (shore ? shore.to : edge.south) + 100, 400, 200, 0.02)}
        {shore && [edge.west - 100, edge.east + 100].map((x) => beyond(`shore${x}`, site.shore!, x, (shore.from + shore.to) / 2, 200, shore.to - shore.from, 0.04))}
        <mesh position={[own.x + own.w / 2, PAVEMENT / 2, own.z + own.d / 2]} material={materials.pavement}>
          <boxGeometry args={[own.w - CITY.streetWidth, PAVEMENT, own.d - CITY.streetWidth]} />
        </mesh>
        {/* A terrace on the pavement in front of the office. */}
        {[2.5, 6.5, 13.5, 17.5, 21.5, 25.5].filter((x) => x < building.w).map((x, n) => (
          <KitModel key={x} file={CITY.parasols[n % 2]!} position={[x, PAVEMENT, FLOOR.h + 0.65]} scale={2} tint={tint} />
        ))}
        {blocks.map((block) => (
          <TownBlockView key={`${block.i}:${block.j}`} block={block} site={site} pad={pad} viewTurn={viewTurn} materials={materials} tint={tint} />
        ))}
        <BusStop materials={materials} />
        <StreetLife key={seed} seed={seed} site={site} game={game} still={still} materials={materials} />
        <Railway train={site.train} still={still} materials={materials} tint={tint} />
      </group>
    </group>
  );
}

/** One block of the town: its ground, and what stands on it as far as it does not hide the office from this side. */
function TownBlockView({ block, site, pad, viewTurn, materials, tint }: { block: TownBlock; site: Site; pad: { w: number; d: number }; viewTurn: number; materials: Materials; tint: THREE.Color }) {
  const { ground, hill } = block;
  // Open land runs on into the blocks beside it; a built block has a pavement of its own.
  const { x, z, w, d } = block.land ?? { x: block.x, z: block.z, ...pad };
  // Water and sand lie lower than a pavement; a field is striped with rows of another crop.
  const height = ground === 'water' ? 0.06 : ground === 'sand' ? 0.12 : block.land ? 0.16 : PAVEMENT;
  const building = useContext(Shape);
  const hillAsBuilding = hill && { building: { file: '', w: hill.radius * 2, height: hill.height, d: hill.radius * 2 }, x: block.x, z: block.z, turn: 0 };
  return (
    <group>
      <mesh position={[x, height / 2, z]} material={materials[ground]}>
        <boxGeometry args={[w, height, d]} />
      </mesh>
      {ground === 'field' &&
        [-1.5, 0.5].map((row) => (
          <mesh key={row} position={[x, height + 0.01, z + (row * d) / 4]} rotation={[-Math.PI / 2, 0, 0]} material={materials.grass}>
            <planeGeometry args={[w, d / 4]} />
          </mesh>
        ))}
      {ground === 'sand' &&
        [-1.6, 0.4, 2].map((dx, n) => <KitModel key={dx} file={CITY.parasols[n % 2]!} position={[block.x + dx, height, block.z + (n - 1) * 1.2]} scale={2} tint={tint} />)}
      {/* A hill: a low dome, flat-sided like everything else in town. */}
      {hill && hillAsBuilding && !hidesOffice(hillAsBuilding, viewTurn, 1, building) && (
        <mesh position={[block.x, height, block.z]} scale={[hill.radius, hill.height, hill.radius]} material={materials.plant}>
          <sphereGeometry args={[1, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      )}
      {block.items
        .filter((item) => !hidesOffice(item, viewTurn, site.scale, building))
        .map((item, n) => (
          <KitModel key={n} file={item.building.file} center={[item.building.cx ?? 0, item.building.cz ?? 0]} position={[item.x, PAVEMENT, item.z]} turn={item.turn} scale={site.scale} tint={tint} />
        ))}
    </group>
  );
}

/**
 * The floors of the office's own building under the one in view, drawn the way
 * the kit draws its buildings: pale walls, a row of windows per storey, a dark
 * band between storeys and awnings over the shop front at street level.
 */
function FloorsBelow({ count, materials, tint }: { count: number; materials: Materials; tint: THREE.Color }) {
  const building = useContext(Shape);
  const w = widthOf(building) + 0.4;
  const d = FLOOR.h + 0.4;
  const middle = WEST + widthOf(building) / 2;
  const front = FLOOR.h + 0.2;
  const side = building.w + 0.2;
  const across = Array.from({ length: widthOf(building) / 2 }, (_, i) => WEST + 1 + i * 2);
  const along = Array.from({ length: 5 }, (_, i) => 1.1 + i * 2.2);

  return (
    <>
      {Array.from({ length: count }, (_, k) => {
        const top = -CITY.streetBelow - k * CITY.perFloor;
        const atStreet = k === count - 1;
        return (
          <group key={k}>
            <mesh position={[middle, top - CITY.perFloor / 2, FLOOR.h / 2]} material={materials.facade}>
              <boxGeometry args={[w, CITY.perFloor, d]} />
            </mesh>
            <mesh position={[middle, top - 0.15, FLOOR.h / 2]} material={materials.trim}>
              <boxGeometry args={[w + 0.2, 0.3, d + 0.2]} />
            </mesh>
            {across.map((x) => (
              <mesh key={`f${x}`} position={[x, top - (atStreet ? 1.9 : 1.6), front]} material={materials.glass}>
                <boxGeometry args={[1.3, atStreet ? 1.9 : 1.5, 0.12]} />
              </mesh>
            ))}
            {along.map((z) => (
              <mesh key={`s${z}`} position={[side, top - (atStreet ? 1.9 : 1.6), z]} material={materials.glass}>
                <boxGeometry args={[0.12, atStreet ? 1.9 : 1.5, 1.4]} />
              </mesh>
            ))}
            {atStreet && [-3, 3, 7, 13, 17, 21, 25].filter((x) => x < building.w).map((x) => (
              <KitModel key={`a${x}`} file={CITY.awning} position={[x, top - 0.75, front + 0.05]} scale={3} tint={tint} />
            ))}
          </group>
        );
      })}
    </>
  );
}

/** The kit's buildings share one painted texture; a tint over it brings them into the palette. */
const cityMaterials = new Map<string, THREE.MeshLambertMaterial>();
function cityMaterial(source: THREE.Material, tint: THREE.Color): THREE.MeshLambertMaterial {
  const map = (source as THREE.MeshStandardMaterial).map ?? null;
  const key = `${map?.uuid}:${tint.getHexString()}`;
  let material = cityMaterials.get(key);
  if (!material) {
    material = new THREE.MeshLambertMaterial({ map, color: tint });
    cityMaterials.set(key, material);
  }
  return material;
}

/** A model from the City Kit, standing on the given point. */
function KitModel({ file, position, turn = 0, scale, tint, center = [0, 0] }: {
  file: string;
  position: [number, number, number];
  turn?: number;
  scale: number;
  tint: THREE.Color;
  /** Where the middle of the model is, from its own origin, in its own units: it is put on `position`. */
  center?: [x: number, z: number];
}) {
  const { scene } = useGLTF(modelUrl(file));
  const object = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) mesh.material = cityMaterial(mesh.material as THREE.Material, tint);
    });
    return copy;
  }, [scene, tint]);
  return (
    <group position={position} rotation={[0, (turn * Math.PI) / 2, 0]} scale={scale}>
      <primitive object={object} position={[-center[0], 0, -center[1]]} />
    </group>
  );
}

/** How many vehicles of each kind can be on screen at once; what the traffic holds beyond that is not drawn. */
const POOL: Record<VehicleKind, number> = { car: 70, taxi: 20, van: 22, truck: 16, bus: 8 };
const KINDS = Object.keys(POOL) as VehicleKind[];

/** The shapes of a vehicle, pointing along +x. The first one is the body, which takes the vehicle's own color. */
function vehicleShapes(kind: VehicleKind, materials: Materials): { at: [number, number, number]; size: [number, number, number]; material: THREE.Material }[] {
  const { length, width } = CITY.vehicles[kind];
  const chassis = { at: [0, 0.28, 0] as [number, number, number], size: [length - 0.2, 0.16, width] as [number, number, number], material: materials.metalDark };
  if (kind === 'bus') {
    // After the designer's photo of a bus: white above a blue skirt, a long band of dark windows, a tall
    // windscreen with the destination over it, and two doors on the side of the kerb.
    return [
      { at: [0, 0.7, 0], size: [length, 0.4, width - 0.04], material: materials.white },
      chassis,
      { at: [0, 0.42, 0], size: [length + 0.02, 0.2, width], material: materials.glass },
      { at: [-0.1, 0.96, 0], size: [length - 0.5, 0.3, width], material: materials.metalDark },
      { at: [0, 1.17, 0], size: [length, 0.12, width - 0.04], material: materials.white },
      { at: [length / 2 - 0.02, 0.88, 0], size: [0.08, 0.5, width - 0.1], material: materials.metalDark },
      { at: [length / 2, 1.17, 0], size: [0.06, 0.1, 0.56], material: materials.lamp },
      { at: [0.95, 0.72, width / 2], size: [0.42, 0.72, 0.04], material: materials.metalDark },
      { at: [-0.35, 0.72, width / 2], size: [0.42, 0.72, 0.04], material: materials.metalDark },
    ];
  }
  if (kind === 'truck') {
    return [
      { at: [length / 2 - 0.4, 0.62, 0], size: [0.8, 0.56, width - 0.06], material: materials.white },
      chassis,
      { at: [length / 2 - 0.1, 0.76, 0], size: [0.22, 0.24, width - 0.14], material: materials.glass },
      { at: [-0.42, 0.82, 0], size: [length - 0.9, 0.9, width], material: materials.metal },
    ];
  }
  if (kind === 'van') {
    return [
      { at: [0, 0.66, 0], size: [length, 0.66, width - 0.04], material: materials.white },
      chassis,
      { at: [length / 2 - 0.12, 0.8, 0], size: [0.26, 0.28, width - 0.1], material: materials.glass },
    ];
  }
  const car = [
    { at: [0, 0.5, 0] as [number, number, number], size: [length, 0.36, width - 0.06] as [number, number, number], material: kind === 'taxi' ? materials.lamp : materials.white },
    chassis,
    { at: [-0.1, 0.82, 0] as [number, number, number], size: [0.8, 0.3, 0.66] as [number, number, number], material: materials.glass },
  ];
  // A taxi is yellow and carries a sign on its roof.
  return kind === 'taxi' ? [...car, { at: [-0.1, 1.03, 0], size: [0.22, 0.12, 0.4], material: materials.metalDark }] : car;
}

/** The traffic and the people in the street of a game, as they are now. */
interface Life {
  traffic: Traffic;
  street: Street;
  /** The game's time they were last moved on to, in seconds. */
  at: number;
}

/**
 * Everything that moves in the street: the traffic (traffic.ts) and the
 * people (street.ts), moved on together with the game's time. They stand
 * still while the game is paused; with motion reduced the traffic is shown
 * as it stands and nobody walks.
 */
function StreetLife({ seed, site, game, still, materials }: { seed: number; site: Site; game?: GameState; still: boolean; materials: Materials }) {
  const { now, hours } = useContext(World);
  const building = useContext(Shape);
  const life = useRef<Life | null>(null);
  const plan = useRef<{ game: GameState | undefined; day: number; trips: Trip[] } | null>(null);

  const step = () => {
    const time = now();
    const clock = hours();
    const since = life.current ? time - life.current.at : -1;
    // A new game, a loaded one or a long gap: fill the streets afresh instead of catching up.
    if (!life.current || since < 0 || since > 3) {
      life.current = { traffic: createTraffic(seed, clock, site.traffic, building, site.front === 'water'), street: createStreet(), at: time };
    } else if (since > 0) {
      const day = Math.floor(clock / OFFICE_HOURS + 1e-9);
      if (!plan.current || plan.current.game !== game || plan.current.day !== day) plan.current = { game, day, trips: game ? tripsOf(game, day, audienceBlocks(game)) : [] };
      const { trips } = plan.current;
      stepTraffic(life.current.traffic, since, clock);
      stepStreet(life.current.street, life.current.traffic, trips, day * OFFICE_HOURS, clock, since);
      life.current.at = time;
    }
  };
  // Before anything is drawn, so that what is drawn is where things are now.
  useLayoutEffect(() => void (life.current ?? step()));
  useFrame(() => !still && step(), -1);

  return (
    <>
      <Vehicles life={life} still={still} materials={materials} />
      <Signals life={life} still={still} materials={materials} />
      {!still && <Pedestrians life={life} seed={seed} count={site.strollers} look={game?.look} />}
    </>
  );
}

/** The most traffic lights a town has room for: one before each crossing for every lane that comes up to it. */
const MOST_SIGNALS = 240;
/**
 * A traffic light: a post, a box on it facing the drivers (`box` is its
 * width, height and depth), and the lamp that is lit: high for red, low for green.
 */
const SIGNAL = { post: [0.08, 1.1, 0.08], box: [0.28, 0.62, 0.16], lamp: [0.18, 0.17, 0.05], lamps: { red: 1.5, amber: 1.3, green: 1.1 } } as const;

/**
 * The traffic lights at the crossings (traffic.ts), drawn as one set of
 * shapes for all of them. The lamps change with the lights every frame;
 * the posts only when the town is filled afresh.
 */
function Signals({ life, still, materials }: { life: RefObject<Life | null>; still: boolean; materials: Materials }) {
  const posts = useRef<THREE.InstancedMesh>(null);
  const boxes = useRef<THREE.InstancedMesh>(null);
  const lamps = useRef<THREE.InstancedMesh>(null);
  const placed = useRef<{ traffic: Traffic; signals: ReturnType<typeof signalsOf> } | null>(null);
  // The lamps glow in the palette's own colors, whatever the light in the scene.
  const lit = useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    const color = (token: string) => new THREE.Color(css.getPropertyValue(token).trim() || '#ffffff');
    return { red: color('--red'), amber: color('--orange'), green: color('--green') };
  }, []);
  const lampMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff' }), []);
  const frame = useMemo(() => new THREE.Object3D(), []);

  const draw = () => {
    const traffic = life.current?.traffic;
    if (!traffic || !posts.current || !boxes.current || !lamps.current) return;
    if (placed.current?.traffic !== traffic) {
      const signals = signalsOf(traffic).slice(0, MOST_SIGNALS);
      placed.current = { traffic, signals };
      signals.forEach((signal, n) => {
        frame.rotation.set(0, signal.angle, 0);
        frame.position.set(signal.x, SIGNAL.post[1] / 2, signal.z);
        frame.updateMatrix();
        posts.current!.setMatrixAt(n, frame.matrix);
        frame.position.set(signal.x, SIGNAL.lamps.amber, signal.z);
        frame.updateMatrix();
        boxes.current!.setMatrixAt(n, frame.matrix);
      });
      for (const mesh of [posts.current, boxes.current, lamps.current]) mesh.count = signals.length;
      posts.current.instanceMatrix.needsUpdate = true;
      boxes.current.instanceMatrix.needsUpdate = true;
    }
    const { signals } = placed.current;
    signals.forEach((signal, n) => {
      const light = lightFor(traffic, signal.id, signal.axis) ?? 'green';
      // On the face towards the drivers: the box faces the way the angle points.
      const ahead = { x: Math.cos(signal.angle), z: -Math.sin(signal.angle) };
      const out = SIGNAL.box[2] / 2 + 0.02;
      frame.rotation.set(0, signal.angle, 0);
      frame.position.set(signal.x + ahead.x * out, SIGNAL.lamps[light], signal.z + ahead.z * out);
      frame.updateMatrix();
      lamps.current!.setMatrixAt(n, frame.matrix);
      lamps.current!.setColorAt(n, lit[light]);
    });
    lamps.current.instanceMatrix.needsUpdate = true;
    if (lamps.current.instanceColor) lamps.current.instanceColor.needsUpdate = true;
  };
  useLayoutEffect(draw);
  useFrame(() => !still && draw());

  return (
    <>
      <instancedMesh ref={posts} args={[undefined, materials.metalDark, MOST_SIGNALS]} count={0}>
        <boxGeometry args={SIGNAL.post} />
      </instancedMesh>
      <instancedMesh ref={boxes} args={[undefined, materials.metalDark, MOST_SIGNALS]} count={0}>
        <boxGeometry args={[SIGNAL.box[2], SIGNAL.box[1], SIGNAL.box[0]]} />
      </instancedMesh>
      <instancedMesh ref={lamps} args={[undefined, lampMaterial, MOST_SIGNALS]} count={0}>
        <boxGeometry args={[SIGNAL.lamp[2], SIGNAL.lamp[1], SIGNAL.lamp[0]]} />
      </instancedMesh>
    </>
  );
}

/** How many hours a day at the office has. */
const OFFICE_HOURS = OFFICE_DAY.to - OFFICE_DAY.from;

/** The vehicles, drawn from a fixed set of shapes that are placed anew every frame. */
function Vehicles({ life, still, materials }: { life: RefObject<Life | null>; still: boolean; materials: Materials }) {
  const nodes = useRef<Record<VehicleKind, (THREE.Group | null)[]>>({ car: [], taxi: [], van: [], truck: [], bus: [] });
  const bodies = useRef<Record<VehicleKind, (THREE.Mesh | null)[]>>({ car: [], taxi: [], van: [], truck: [], bus: [] });
  const shown = useRef<Record<VehicleKind, number>>({ car: 0, taxi: 0, van: 0, truck: 0, bus: 0 });
  const shapes = useMemo(() => Object.fromEntries(KINDS.map((kind) => [kind, vehicleShapes(kind, materials)])) as Record<VehicleKind, ReturnType<typeof vehicleShapes>>, [materials]);

  const draw = () => {
    const traffic = life.current?.traffic;
    if (!traffic) return;
    const count: Record<VehicleKind, number> = { car: 0, taxi: 0, van: 0, truck: 0, bus: 0 };
    for (const vehicle of vehiclesIn(traffic)) {
      const n = count[vehicle.kind]++;
      const node = nodes.current[vehicle.kind][n];
      if (!node) continue;
      const at = placeOf(traffic, vehicle);
      node.visible = true;
      node.position.set(at.x, 0, at.z);
      node.rotation.y = at.angle;
      const body = bodies.current[vehicle.kind][n];
      if (body && vehicle.kind !== 'taxi' && vehicle.kind !== 'bus') body.material = materials[vehicle.tone];
    }
    for (const kind of KINDS) {
      for (let n = count[kind]; n < shown.current[kind]; n++) nodes.current[kind][n]!.visible = false;
      shown.current[kind] = Math.min(count[kind], POOL[kind]);
    }
  };
  useLayoutEffect(draw);
  useFrame(() => !still && draw());

  return (
    <>
      {KINDS.flatMap((kind) =>
        Array.from({ length: POOL[kind] }, (_, n) => (
          <group key={`${kind}${n}`} ref={(node) => void (nodes.current[kind][n] = node)} visible={false}>
            {shapes[kind].map((shape, i) => (
              <mesh key={i} ref={i === 0 ? (mesh) => void (bodies.current[kind][n] = mesh) : undefined} position={shape.at} material={shape.material}>
                <boxGeometry args={shape.size} />
              </mesh>
            ))}
          </group>
        )),
      )}
    </>
  );
}

/** Someone in the street as the view draws them. */
interface Passer {
  id: string;
  name: string;
  x: number;
  z: number;
  angle: number;
  moving: boolean;
}

/**
 * The people in the street: those on their way to the office or home, and
 * the strollers. Who is there changes now and then; where each of them is
 * changes every frame, so that is handed to the figures without drawing the
 * list again.
 */
function Pedestrians({ life, seed, count, look }: { life: RefObject<Life | null>; seed: number; count: number; look?: Look }) {
  const { now } = useContext(World);
  const building = useContext(Shape);
  const walking = useMemo(() => strollers(seed, count, building), [seed, count, building]);
  const passers = useRef(new Map<string, Passer>());
  const [keys, setKeys] = useState<string[]>([]);

  useFrame(() => {
    const street = life.current?.street;
    if (!street) return;
    const map = passers.current;
    map.clear();
    for (const walker of street.walkers) if (walker.delay <= 0) map.set(walker.key, walker);
    const time = now();
    walking.forEach((stroller, n) => map.set(`stroller-${n}`, { id: '', name: stroller.name, moving: true, ...strollerAt(stroller, time) }));
    if (map.size !== keys.length || keys.some((key) => !map.has(key))) setKeys([...map.keys()]);
  });

  return (
    <>
      {keys.map((key) => (
        <Figure key={key} get={() => passers.current.get(key)} look={passers.current.get(key)?.id === CEO_ID ? look : undefined} />
      ))}
    </>
  );
}

/** One person in the street, walking or standing where `get` says they are. */
function Figure({ get, look }: { get: () => Passer | undefined; look?: Look }) {
  const name = useRef(get()?.name ?? '');
  const { scene, animations } = useGLTF(modelUrl(look ? bodyFile(look.body) : characterFor(name.current)));
  const object = useMemo(() => characterCopy(scene, look), [scene, look]);
  const group = useRef<THREE.Group>(null);
  const { actions, mixer } = useAnimations(animations, group);
  const { pace } = useContext(World);
  useEffect(() => void (mixer.timeScale = Math.min(pace, 2)), [mixer, pace]);
  const moving = useRef<boolean | null>(null);

  useFrame(() => {
    const node = group.current;
    const passer = get();
    if (!node) return;
    node.visible = passer !== undefined;
    if (!passer) return;
    node.position.set(passer.x, PAVEMENT, passer.z);
    node.rotation.y = passer.angle;
    if (passer.moving === moving.current) return;
    for (const clip of ANIMATIONS[moving.current ? 'walk' : 'idle']) actions[clip]?.fadeOut(0.15);
    for (const clip of ANIMATIONS[passer.moving ? 'walk' : 'idle']) actions[clip]?.reset().fadeIn(0.15).play();
    moving.current = passer.moving;
  });

  return (
    <group ref={group} visible={false}>
      <group scale={CHARACTER_SCALE}>
        <primitive object={object} />
      </group>
    </group>
  );
}

/** The bus stop on the pavement in front of the office: a glass shelter with a bench, and a sign on a pole. */
function BusStop({ materials }: { materials: Materials }) {
  const { x, z } = BUS_STOP.wait;
  return (
    <group position={[x, PAVEMENT, z]}>
      <mesh position={[0, 0.6, -0.3]} material={materials.glass}>
        <boxGeometry args={[1.8, 1.2, 0.06]} />
      </mesh>
      <mesh position={[0, 1.24, -0.08]} material={materials.metalDark}>
        <boxGeometry args={[2, 0.08, 0.56]} />
      </mesh>
      <mesh position={[0, 0.26, -0.16]} material={materials.wood}>
        <boxGeometry args={[1.4, 0.08, 0.26]} />
      </mesh>
      <mesh position={[1.25, 0.8, 0.12]} material={materials.metalMid}>
        <boxGeometry args={[0.07, 1.6, 0.07]} />
      </mesh>
      <mesh position={[1.25, 1.5, 0.12]} material={materials.lamp}>
        <boxGeometry args={[0.42, 0.3, 0.09]} />
      </mesh>
    </group>
  );
}

/**
 * The elevated railway in front of the office: a deck on pillars with the
 * kit's track on it, and every now and then the yellow train going by.
 * With motion reduced no train runs.
 */
function Railway({ train: cars, still, materials, tint }: { train: readonly string[]; still: boolean; materials: Materials; tint: THREE.Color }) {
  const { height, scale, track, trackLength, carLength } = CITY.railway;
  const train = useRef<THREE.Group>(null);
  const piece = trackLength * scale;
  const pieces = Math.ceil(RAILWAY.length / piece);
  const pillars = Math.floor(RAILWAY.length / CITY.block.w);
  const { now } = useContext(World);

  useFrame(() => {
    const node = train.current;
    if (!node) return;
    const at = still ? null : trainAt(now(), cars.length);
    node.visible = at !== null;
    if (!at) return;
    node.position.x = at.x;
    node.rotation.y = at.direction > 0 ? 0 : Math.PI;
  });

  return (
    <group position={[0, 0, RAILWAY.z]}>
      <mesh position={[RAILWAY.from + RAILWAY.length / 2, height - 0.2, 0]} material={materials.trim}>
        <boxGeometry args={[RAILWAY.length, 0.4, 2.1]} />
      </mesh>
      {/* No road runs under the line: each block gets a paved strip, and a pillar in the middle of it, clear of the cross streets. */}
      {Array.from({ length: pillars }, (_, i) => (
        <group key={i} position={[RAILWAY.from + (i + 0.5) * CITY.block.w, 0, 0]}>
          <mesh position={[0, PAVEMENT / 2, 0]} material={materials.pavement}>
            <boxGeometry args={[CITY.block.w - CITY.streetWidth, PAVEMENT, CITY.streetWidth + 0.02]} />
          </mesh>
          <mesh position={[0, (height - 0.4) / 2, 0]} material={materials.facade}>
            <boxGeometry args={[0.5, height - 0.4, 0.5]} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: pieces }, (_, i) => (
        <KitModel key={i} file={track} position={[RAILWAY.from + i * piece, height + CITY.railway.trackDrop * scale, 0]} turn={1} scale={scale} tint={tint} />
      ))}
      {/* The train points along +x; its front is at the group's origin and the carriages trail behind. */}
      <group ref={train} position={[RAILWAY.from, height + 0.1 * scale, 0]} visible={false}>
        {cars.map((file, i) => (
          <KitModel key={`${file}${i}`} file={file} position={[-(i + 0.5) * carLength * scale, 0, 0]} turn={1} scale={scale} tint={tint} />
        ))}
      </group>
    </group>
  );
}

/** With motion reduced the canvas only draws on demand, so ask for a frame when something changed. */
function useRedraw(deps: unknown[]) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), deps);
}

/** Letter on the tag of a support staff member at work in a room. */
const STAFF_MARK: Partial<Record<Role, string>> = { cleaner: 'C', technician: 'T', maintenance: 'M' };

function Room({ layout, room, selected, selectedFurnitureId, interactive, faded, liftedId, note, onAir, materials, onSelect, onSelectFurniture }: {
  layout: RoomLayout;
  room: RentedRoom | undefined;
  selected: boolean;
  selectedFurnitureId: Id | null;
  interactive: boolean;
  /** The room is being given another shape: its walls and its label are left out while the new ones are drawn. */
  faded?: boolean;
  /** The piece that was picked up to be moved: it is left out where it stood. */
  liftedId?: Id;
  /** A line under the room's name: how many of its workplaces are taken. */
  note?: string;
  /** The shows going out from this room right now. */
  onAir: Show[];
  materials: Materials;
  onSelect: () => void;
  onSelectFurniture: (id: Id) => void;
}) {
  const { x, y: z, w, h: d } = layout;
  const surface: Surface = room?.type ?? 'unassigned';
  const dirt = room ? 1 - Math.min(1, room.cleanliness / CLEANLINESS.cleanEnough) : 0;
  // A room is called after its kind; one from an older game has a letter, and says its kind under it.
  const named = Boolean(room?.type && layout.name.startsWith(ROOM_TYPE_NAMES[room.type as RoomType]));
  const label = layout.fixed
    ? room && !isFurnished(room) ? 'Needs a desk' : null
    : !room?.type ? 'Choose a kind' : named ? null : ROOM_TYPE_NAMES[room.type as RoomType];
  const pointer = usePointerCursor(interactive);

  return (
    <group>
      <mesh
        position={[x + w / 2, 0.01, z + d / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={materials[surface]}
        receiveShadow
        onClick={interactive ? (e) => (e.stopPropagation(), onSelect()) : undefined}
        {...pointer}
      >
        <planeGeometry args={[w, d]} />
      </mesh>
      {/* Dirt builds up as a film over the room. */}
      {dirt > 0 && (
        <mesh position={[x + w / 2, 0.02, z + d / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[w, d]} />
          <meshBasicMaterial color={materials.dirt.color} transparent opacity={dirt * 0.45} depthWrite={false} />
        </mesh>
      )}
      {!layout.fixed && !faded && <Walls layout={layout} materials={materials} selected={selected} />}

      {room?.furniture.filter((item) => item.id !== liftedId).map((item) => (
        <Suspense key={item.id} fallback={null}>
          <FurnitureModel
            item={item}
            origin={[x + item.x, z + item.y]}
            selected={item.id === selectedFurnitureId}
            live={onAir.length > 0}
            materials={materials}
            onSelect={interactive ? () => (onSelect(), onSelectFurniture(item.id)) : undefined}
          />
        </Suspense>
      ))}

      <Html position={[x + w / 2, selected ? 1.1 : 0.9, z + 0.1]} center className={selected ? 'o3-label selected' : 'o3-label'} zIndexRange={[6, 0]} style={faded ? { display: 'none' } : undefined}>
        {/* The name can be clicked like the room, and it is what Penny's ring goes around when she asks for the room. */}
        <div className={interactive ? 'o3-label-body pickable' : 'o3-label-body'} data-guide={`room-${layout.id}`} onClick={interactive ? onSelect : undefined}>
          <strong>{layout.name}</strong>
          {label && <span>{label}</span>}
          {note && <span>{note}</span>}
          {onAir.length > 0 && <span className="o3-on-air">On air · {onAir.map((show) => show.name).join(', ')}</span>}
          {room?.issue && <span className="o3-issue" title={`The ${room.issue.kind} has failed`}>! {room.issue.kind} failed</span>}
        </div>
      </Html>
    </group>
  );
}

/** Shows a hand over things that can be clicked. */
function usePointerCursor(enabled: boolean) {
  const canvas = useThree((s) => s.gl.domElement);
  if (!enabled) return {};
  return {
    onPointerOver: () => void (canvas.style.cursor = 'pointer'),
    onPointerOut: () => void (canvas.style.cursor = ''),
  };
}

/**
 * The walls of a room, cut low so the rooms stay visible, with a gap where its
 * door is. A wall that is an outer wall of the building is left to the
 * building, which draws those (see `OuterWalls`).
 */
function Walls({ layout, materials, selected }: { layout: RoomLayout; materials: Materials; selected: boolean }) {
  const building = useContext(Shape);
  const material = selected ? materials.select : materials.wall;
  const height = selected ? WALL.low + 0.08 : WALL.low;
  const outer = ([x1, z1, , z2]: [number, number, number, number]) => (z1 === z2 ? z1 === 0 || z1 === FLOOR.h : x1 === building.w);
  return (
    <group>
      {wallsOf(layout).filter((wall) => !outer(wall)).map(([x1, z1, x2, z2], n) => (
        <mesh key={n} position={[(x1 + x2) / 2, height / 2, (z1 + z2) / 2]} material={material} castShadow receiveShadow>
          <boxGeometry args={[x2 - x1 + WALL.thick, height, z2 - z1 + WALL.thick]} />
        </mesh>
      ))}
    </group>
  );
}

function FurnitureModel({ item, origin, selected, live, materials, onSelect }: {
  item: Furniture;
  origin: [x: number, z: number];
  selected: boolean;
  /** Whether a show is going out from the room: on-air lights and camera lamps are lit. */
  live: boolean;
  materials: Materials;
  onSelect?: () => void;
}) {
  const spec = FURNITURE[item.type];
  const size = footprint(item.type, item.turn);
  const broken = isBroken(item);
  const pointer = usePointerCursor(Boolean(onSelect));
  // Off the air, everything that glows red is dark.
  const shown = useMemo(() => (live ? materials : { ...materials, onAir: materials.metalDark }), [live, materials]);
  return (
    <group
      position={[origin[0], 0, origin[1]]}
      onClick={onSelect ? (e) => (e.stopPropagation(), onSelect()) : undefined}
      {...pointer}
    >
      {/* The parts are laid out unturned, then turned as a whole about the middle of the tiles they cover. */}
      <group position={[size.w / 2, 0, size.h / 2]} rotation={[0, ((item.turn + (FURNITURE_ASSETS[item.type].angle ?? 0)) * Math.PI) / 2, 0]}>
        <group position={[-spec.w / 2, 0, -spec.h / 2]}>
          {partsAt(item.type, item.tier).map((part, i) => (
            <PartMesh key={i} part={part} materials={shown} />
          ))}
        </group>
      </group>
      {selected && (
        <mesh position={[size.w / 2, 0.035, size.h / 2]} rotation={[-Math.PI / 2, 0, 0]} material={materials.select}>
          <planeGeometry args={[size.w - 0.06, size.h - 0.06]} />
        </mesh>
      )}
      {broken && (
        <group position={[size.w / 2, 1.7, size.h / 2]} rotation={[0, Math.PI / 4, 0]}>
          {[1, -1].map((side) => (
            <mesh key={side} rotation={[0, 0, (side * Math.PI) / 4]} material={materials.bad}>
              <boxGeometry args={[0.7, 0.14, 0.14]} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

function PartMesh({ part, materials }: { part: Part; materials: Materials }) {
  const [x, y, z] = part.at;
  const turn: [number, number, number] = [0, ((part.turn ?? 0) * Math.PI) / 2, 0];
  if ('model' in part) {
    return (
      <group position={[x, y, z]} rotation={turn} scale={part.size ?? 1}>
        <Model id={part.model} tones={part.tones} materials={materials} />
      </group>
    );
  }
  const lean: [number, number, number] = [THREE.MathUtils.degToRad(part.tilt ?? 0), 0, THREE.MathUtils.degToRad(part.roll ?? 0)];
  if ('parts' in part) {
    return (
      <group position={[x, y, z]} rotation={turn}>
        <group rotation={lean}>
          {part.parts.map((child, i) => (
            <PartMesh key={i} part={child} materials={materials} />
          ))}
        </group>
      </group>
    );
  }
  // A shape leans about its own middle, then turns where it stands.
  const height = 'box' in part ? part.box[1] : part.cylinder[1];
  return (
    <group position={[x, y + height / 2, z]} rotation={turn}>
      <mesh rotation={lean} material={materials[part.tone]} castShadow receiveShadow>
        {'box' in part ? (
          <boxGeometry args={part.box} />
        ) : (
          <cylinderGeometry args={[part.cylinder[2] ?? part.cylinder[0], part.cylinder[0], part.cylinder[1], 14]} />
        )}
      </mesh>
    </group>
  );
}

/** A model from the registry, tinted with the theme's colors and centred on its footprint, standing on the floor. */
function Model({ id, tones, materials }: { id: ModelId; tones?: Record<string, Tone>; materials: Materials }) {
  const { scene } = useGLTF(modelUrl(MODELS[id]));
  const object = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const tint = (m: THREE.Material) => materials[tones?.[m.name] ?? MATERIAL_TONES[m.name] ?? 'white'];
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(tint) : tint(mesh.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    const box = new THREE.Box3().setFromObject(copy);
    const center = box.getCenter(new THREE.Vector3());
    copy.position.set(-center.x, -box.min.y, -center.z);
    return copy;
  }, [scene, materials, tones]);
  return (
    <group scale={MODEL_SCALE}>
      <primitive object={object} />
    </group>
  );
}

/** Tiles per second. */
const WALK_SPEED = 3;

/** The models face the viewer (+z); turn 0 means facing north. */
const facing = (turn: number) => Math.PI + (turn * Math.PI) / 2;

/**
 * A copy of a character's model that can be posed on its own, in the colors of a look if one is given: the
 * parts the look recolors get texture coordinates of their own (office/looks.ts).
 */
function characterCopy(scene: THREE.Object3D, look?: Look): THREE.Object3D {
  const copy = cloneSkinned(scene);
  copy.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    // Skinned meshes move away from their resting box, so never cull them.
    mesh.frustumCulled = false;
    const part = look && partOf(mesh.name);
    const uv = part && restyle(part, mesh.geometry.getAttribute('uv').array, look);
    if (!uv) return;
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  });
  return copy;
}

/** A look as a word: the same for the same character and colors. */
const lookKey = (look: Look) => `${look.body}/${look.skin}/${look.hair}/${look.outfit}`;

function Character({ person, game, look, still, selected, materials, onSelect }: {
  person: Person;
  /** The game, for the way across the floor: the walls, the doors and the furniture are where it has them. */
  game: GameState;
  /** The player's own character has a look; everyone else looks as their name decides. */
  look?: Look;
  still: boolean;
  selected: boolean;
  materials: Materials;
  onSelect?: () => void;
}) {
  const pointer = usePointerCursor(Boolean(onSelect));
  const { scene, animations } = useGLTF(modelUrl(look ? bodyFile(look.body) : characterFor(person.name)));
  const object = useMemo(() => characterCopy(scene, look), [scene, look]);
  const group = useRef<THREE.Group>(null);
  const { actions, mixer } = useAnimations(animations, group);
  const { pace } = useContext(World);
  // A paused game holds everyone in the middle of their step; a fast one hurries them, though not their gestures as much.
  useEffect(() => void (mixer.timeScale = Math.min(pace, 2)), [mixer, pace]);
  // Someone who turns up on the floor starts where they come from, the lift or the entrance, and walks to their place.
  const start = person.from && !still ? person.from : person;
  const path = useRef<[number, number][]>(person.from && !still ? walkPath(game, person.floor, person.from, person) : []);
  const last = useRef(person);
  const [walking, setWalking] = useState(path.current.length > 0);
  // People who come in at the same moment come through the door one after the other.
  const hold = useRef(path.current.length > 0 ? ([...person.id].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 8) * 0.22 : 0);
  /** Through a door, into a lift or out of the building: out of sight until they come back. */
  const [gone, setGone] = useState(Boolean(person.away) && path.current.length === 0);

  // A new place: walk there, unless motion is reduced or this is a different floor's worth of distance.
  useEffect(() => {
    const from = last.current;
    last.current = person;
    if (from === person || still || !group.current) return;
    if (from.x === person.x && from.z === person.z) return;
    const { x, z } = group.current.position;
    path.current = walkPath(game, person.floor, { x, z }, person);
    setWalking(true);
    // The game only says what is in the way; a change in it is no reason to set out.
  }, [person, still]);

  const activity = walking ? 'walk' : person.activity;
  useEffect(() => {
    const playing = ANIMATIONS[activity].flatMap((clip) => actions[clip] ?? []);
    for (const action of playing) {
      action.reset().fadeIn(still ? 0 : 0.2).play();
      action.paused = still;
    }
    return () => playing.forEach((action) => void action.fadeOut(still ? 0 : 0.2));
  }, [actions, activity, still]);

  useFrame((_, delta) => {
    const node = group.current;
    if (!node) return;
    if (hold.current > 0) {
      hold.current -= Math.min(delta, 0.1) * pace;
      node.visible = hold.current <= 0;
      return;
    }
    const next = path.current[0];
    const out = Boolean(person.away) && (!next || still);
    if (out !== gone) setGone(out);
    if (!next || still) {
      if (walking) setWalking(false);
      path.current = [];
      node.position.set(person.x, (person.y ?? 0) + (person.activity === 'sit' ? SEAT_HEIGHT : 0), person.z);
      node.rotation.y = facing(person.turn);
      return;
    }
    const dx = next[0] - node.position.x;
    const dz = next[1] - node.position.z;
    const distance = Math.hypot(dx, dz);
    const step = WALK_SPEED * pace * Math.min(delta, 0.1);
    if (step === 0) return;
    if (distance <= step) {
      node.position.set(next[0], 0, next[1]);
      path.current.shift();
      if (path.current.length === 0) setWalking(false);
      return;
    }
    node.position.x += (dx / distance) * step;
    node.position.z += (dz / distance) * step;
    node.position.y = 0;
    node.rotation.y = Math.atan2(dx, dz);
  });

  const mark = person.role === 'visitor' ? undefined : person.role === 'ceo' ? '★' : STAFF_MARK[person.role];
  return (
    <group ref={group} visible={!gone} position={start === person ? [person.x, (person.y ?? 0) + (person.activity === 'sit' ? SEAT_HEIGHT : 0), person.z] : [start.x, 0, start.z]} rotation={[0, facing(person.turn), 0]}>
      <group scale={CHARACTER_SCALE}>
        <primitive object={object} />
      </group>
      {/* An unseen shape around the person takes the click, so they are easy to hit even while moving. */}
      {onSelect && !gone && (
        <mesh position={[0, 0.6, 0]} onClick={(e) => (e.stopPropagation(), onSelect())} {...pointer}>
          <cylinderGeometry args={[0.38, 0.38, 1.2, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {selected && (
        <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} material={materials.select}>
          <ringGeometry args={[0.42, 0.56, 24]} />
        </mesh>
      )}
      {gone ? null : selected ? (
        <Html position={[0, 1.5, 0]} center className="o3-label selected" zIndexRange={[7, 0]}>
          <strong>{person.name}</strong>
        </Html>
      ) : (
        mark && (
          <Html position={[0, 1.45, 0]} center className="o3-staff" zIndexRange={[5, 0]}>
            <span title={person.name}>{mark}</span>
          </Html>
        )
      )}
    </group>
  );
}

// --- The catalog's picture of one piece ---

/** One piece of furniture on its own, turning slowly so it can be seen from all sides: for the furniture catalog. */
export function FurniturePreview({ type, tier, still }: { type: FurnitureType; tier: number; still: boolean }) {
  const materials = useMaterials();
  const { w, h, name } = FURNITURE[type];
  return (
    <Canvas orthographic flat dpr={[1, 2]} frameloop={still ? 'demand' : 'always'} camera={{ near: 0.1, far: 100, position: [10, 10.7, 10] }} role="img" aria-label={`${name}, as it looks in the office`}>
      {/* Wide enough for the piece from any side, and tall enough for the highest ones. */}
      <PreviewRig span={Math.max((w + h) / Math.SQRT2 + 0.6, 2.6)} />
      <ambientLight intensity={2.1} />
      <directionalLight position={[-4, 10, 6]} intensity={1.5} />
      <Suspense fallback={null}>
        <Turntable still={still} redraw={[type, tier, materials]}>
          {/* The tiles it takes up. */}
          <mesh position={[0, -0.03, 0]} material={materials.unassigned}>
            <boxGeometry args={[w, 0.06, h]} />
          </mesh>
          <FurnitureModel item={{ id: 'preview', type, x: 0, y: 0, turn: 0, tier, condition: 100, boughtOn: 0 }} origin={[-w / 2, -h / 2]} selected={false} live materials={materials} />
        </Turntable>
      </Suspense>
    </Canvas>
  );
}


/**
 * The surroundings of the office in a region, alive: the town with its
 * traffic, its train and the people out for a walk, around the office seen
 * from outside. For choosing the headquarters, before there is a game. It
 * runs on a clock of its own, in the middle of a morning.
 */
export function TownPreview({ region, still }: { region: RegionId; still: boolean }) {
  const materials = useMaterials();
  const world = useMemo(() => {
    const began = performance.now();
    const now = () => (performance.now() - began) / 1000 + 300;
    return { now, hours: () => 2 + now() / HOUR_SECONDS, pace: 1 };
  }, []);
  // The building a company gets in this region, seen from above its roof.
  const building = buildingFor(region);
  const wide = widthOf(building);
  const roof = WEST + wide / 2;
  const [cx, , cz] = frameOf(building).center;
  return (
    <Canvas orthographic flat dpr={[1, 2]} frameloop={still ? 'demand' : 'always'} camera={{ near: 1, far: 400, position: [100, 100, 100] }} role="img" aria-label={`The surroundings of the office in ${getRegion(region).name}`}>
      <TownRig building={building} />
      <ambientLight intensity={2.1} />
      <directionalLight position={[cx - 6, 22, cz + 9]} intensity={1.5} />
      <World.Provider value={world}>
        <Shape.Provider value={building}>
          <Suspense fallback={null}>
            {/* The roof of the office, with a low wall around it. */}
            <mesh position={[roof, -0.2, FLOOR.h / 2]} material={materials.trim}>
              <boxGeometry args={[wide + 0.6, 0.4, FLOOR.h + 0.6]} />
            </mesh>
            <mesh position={[roof, 0.02, FLOOR.h / 2]} material={materials.facade}>
              <boxGeometry args={[wide - 0.4, 0.1, FLOOR.h - 0.4]} />
            </mesh>
            <mesh position={[WEST + 3, 0.7, 2.2]} material={materials.metalMid}>
              <boxGeometry args={[2.4, 1.3, 2]} />
            </mesh>
            <Town key={region} floor={building.floors + 1} seed={PREVIEW_SEED} site={SITES[region]} still={still} materials={materials} />
          </Suspense>
        </Shape.Provider>
      </World.Provider>
    </Canvas>
  );
}

/** The town of the preview: always the same one, so a region looks the same each time it is shown. */
const PREVIEW_SEED = 1970;

/** The camera of the preview: the same slant as in the game, far enough back for the streets around the office, and still. */
function TownRig({ building }: { building: Building }) {
  const camera = useThree((s) => s.camera);
  const { width, height } = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    // A little in front of the office, where the beach, the lake or the fields are.
    const [cx, , cz] = frameOf(building).center;
    const at: [number, number, number] = [cx - 2, -streetLevel(building.floors + 1) / 2, cz + 9];
    camera.position.set(at[0] + 60, at[1] + 60, at[2] + 60);
    camera.lookAt(...at);
    camera.zoom = Math.min(width / 54, height / 38);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, width, height, invalidate, building]);
  return null;
}

/** The player's own character on its own, standing and looking around: for the character creator. */
export function LookPreview({ look, still }: { look: Look; still: boolean }) {
  const materials = useMaterials();
  return (
    <Canvas orthographic flat dpr={[1, 2]} frameloop={still ? 'demand' : 'always'} camera={{ near: 0.1, far: 100, position: [3.2, 3.4, 9] }} role="img" aria-label="Your character">
      <PreviewRig span={1.75} at={0.56} />
      <ambientLight intensity={2.1} />
      <directionalLight position={[-4, 10, 6]} intensity={1.5} />
      <Suspense fallback={null}>
        <mesh position={[0, -0.04, 0]} material={materials.unassigned}>
          <cylinderGeometry args={[0.62, 0.62, 0.08, 40]} />
        </mesh>
        {/* A new look is a new model: starting afresh keeps its pose tied to the bones that are shown. */}
        <PreviewCharacter key={lookKey(look)} look={look} still={still} />
      </Suspense>
    </Canvas>
  );
}

function PreviewCharacter({ look, still }: { look: Look; still: boolean }) {
  const { scene, animations } = useGLTF(modelUrl(bodyFile(look.body)));
  const object = useMemo(() => characterCopy(scene, look), [scene, look]);
  const group = useRef<THREE.Group>(null);
  const { actions } = useAnimations(animations, group);
  useRedraw([object, still]);
  useEffect(() => {
    const playing = ANIMATIONS.idle.flatMap((clip) => actions[clip] ?? []);
    for (const action of playing) {
      action.reset().play();
      action.paused = still;
    }
    return () => playing.forEach((action) => void action.stop());
  }, [actions, still, object]);
  return (
    <group ref={group} scale={CHARACTER_SCALE}>
      <primitive object={object} />
    </group>
  );
}

function PreviewRig({ span, at = 0.7 }: { span: number; at?: number }) {
  const camera = useThree((s) => s.camera);
  const { width, height } = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    camera.lookAt(0, at, 0);
    camera.zoom = Math.min(width, height) / span;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, width, height, span, at, invalidate]);
  return null;
}

/** Turns what stands on it; with motion reduced it stands still, seen from the front. */
function Turntable({ still, redraw, children }: { still: boolean; redraw: unknown[]; children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  useRedraw(redraw);
  useFrame((_, elapsed) => {
    if (!still && group.current) group.current.rotation.y += Math.min(elapsed, 0.05) * 0.5;
  });
  return <group ref={group}>{children}</group>;
}
