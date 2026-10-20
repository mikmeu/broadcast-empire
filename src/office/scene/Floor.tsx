// One floor of the office: its rooms, people and walls, the block at the head of the floor, and the drawing of a new room.

import { Html } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useContext, useMemo, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { CORE, FLOOR, ROOM_SIZES, ROOM_TYPE_NAMES, WEST, buildable, coreWalls, wallsOf, widthOf, type RoomLayout } from '../../config/office';
import { borrowedDesks, tvControlRooms, deskHolders, doorways, findRoom, footprint, placementError, roomsTaking, workplacesIn } from '../../sim/office';
import { doorSpots, kindError, roomError } from '../../sim/rooms';
import type { GameState } from '../../sim/state';
import { purchaseTier } from '../../sim/tech';
import { SITES } from '../sites';
import { CORRIDOR_Z, peopleOnFloor, roomsOnFloor, showsOnAir, slotAt } from '../layout';
import { Character, lookKey } from './Character';
import { FurnitureModel, Room } from './Room';
import { Town } from './Town';
import { CableLayer } from './cables';
import { Shape, ViewTurn, WALL, useRedraw } from './frame';
import { type Materials, type Surface } from './materials';
import { type Props, type Rect } from './props';

/** The piece that is being moved, if it is still there. */
export const liftedPiece = (game: GameState, moving: Props['moving']) => (moving ? findRoom(game, moving.roomId)?.furniture.find((f) => f.id === moving.furnitureId) : undefined);

export function Floor({ game, floor, selectedRoomId, selectedFurnitureId, selectedPersonId, placing, placingTurn, moving, cursor: hover, onPoint, still, beat, onSelectRoom, onSelectFurniture, onSelectPerson, onPlace, drawing, onDrawRect, onDrawDoor, materials, anchor, cables }: Props & { materials: Materials; anchor: RefObject<HTMLDivElement | null> }) {
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
  const controls = useMemo(() => tvControlRooms(game), [game]);
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
          onAir={live.filter((show) => show.studioId === layout.id || borrowed.get(show.studioId!)?.roomId === layout.id || controls.get(show.studioId!)?.roomId === layout.id)}
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
      {cables && <CableLayer game={game} floor={floor} materials={materials} />}
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
