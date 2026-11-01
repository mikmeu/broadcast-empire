// The cables (0.16.0) and the roof they run to.

import { Html } from '@react-three/drei';
import { useContext, useMemo } from 'react';
import * as THREE from 'three';
import { CORE, FLOOR, coreFrame, coreOf, coreTurn, outerWalls, partsOf, type Building } from '../../config/office';
import { doorTiles, findRoom } from '../../sim/office';
import { cables as cablesOf, type Cable } from '../../sim/control';
import { channelOffAirReason } from '../../sim/broadcast';
import type { GameState } from '../../sim/state';
import { ownsTech } from '../../sim/tech';
import { ROOF_ASSETS, type Part } from '../assets';
import { siteOfGame } from '../sites';
import { PartMesh } from './Room';
import { Town } from './Town';
import { Shape, useRedraw } from './frame';
import { type Materials } from './materials';

/** Where the antenna and the dish stand on the roof, across the building from front to back. */
const ANTENNA_Z = 3.5;

const DISH_Z = 5.5;

/**
 * The shaft the cables run up through (0.16.0): in the corner of the hall by
 * the stairs, on every floor and up onto the roof.
 */
const riserOf = (building: Building) => {
  // The corner of the hall at the front, on the stairs' side.
  const { x, z } = coreFrame(building).point(CORE.hall.x + CORE.w + 0.25, CORE.hall.y + 0.25);
  return { x, z };
};

/**
 * The way a cable runs from the door of its room to the shaft, as points: along
 * the corridor of the wing the room is in, out to the hub just outside the hall
 * (in a building with a courtyard along the west wing as well), and across the
 * hall to the shaft. `n` spreads the cables over the width of the corridor.
 */
function cableRoute(building: Building, room: { x: number; y: number; w: number; h: number }, door: [number, number], n: number): [number, number][] {
  const { point } = coreFrame(building);
  const riser = riserOf(building);
  const off = (n % 3) * 0.14 - 0.14;
  const lane = building.lanes.find((l) => room.x >= l.area.x && room.y >= l.area.y && room.x + room.w <= l.area.x + l.area.w && room.y + room.h <= l.area.y + l.area.h);
  // The hub is just outside the back of the hall, on the line of the entrance.
  const outside = point(CORE.w + 0.5, CORE.entry.y + 0.5 + off);
  if (building.core.faces !== 'w') {
    // Facing north or south, the line of the entrance runs along z: out of the corridor to the hub, then down it to the shaft.
    const to = [outside.x, riser.z] as [number, number];
    if (lane?.along === 'y') return [door, [lane.corridor + 0.5 + off, door[1]], [lane.corridor + 0.5 + off, outside.z], [outside.x, outside.z], to, [riser.x, riser.z]];
    const across = (lane?.corridor ?? FLOOR.corridorY) + 0.5 + off;
    return [door, [door[0], across], [outside.x, across], [outside.x, outside.z], to, [riser.x, riser.z]];
  }
  const hub = outside.x;
  const row = outside.z;
  if (lane?.along === 'y') return [door, [lane.corridor + 0.5 + off, door[1]], [lane.corridor + 0.5 + off, row], [riser.x, row], [riser.x, riser.z]];
  const along = (lane?.corridor ?? FLOOR.corridorY) + 0.5 + off;
  return [door, [door[0], along], [hub, along], [hub, row], [riser.x, row], [riser.x, riser.z]];
}

/** How high the cables run: just above the floor, where they can be seen from the camera. */
const CABLE_Y = 0.1;

/** The color of a cable: live while it carries a channel on the air, cut where it should and can't, idle while nothing goes through it. */
const cableMaterial = (materials: Materials, status: Cable['status']) => (status === 'live' ? materials.good : status === 'cut' ? materials.bad : materials.metalMid);

/** A straight stretch of cable between two points on a floor, as a thin bar. */
function CableRun({ from, to, y = CABLE_Y, thick = 0.1, material }: { from: [number, number]; to: [number, number]; y?: number; thick?: number; material: THREE.Material }) {
  const [x1, z1] = from;
  const [x2, z2] = to;
  const length = Math.hypot(x2 - x1, z2 - z1);
  if (length < 1e-6) return null;
  return (
    <mesh position={[(x1 + x2) / 2, y, (z1 + z2) / 2]} rotation={[0, -Math.atan2(z2 - z1, x2 - x1), 0]} material={material}>
      <boxGeometry args={[length + thick, thick, thick]} />
    </mesh>
  );
}

/** The cable states that go up the shaft from a floor or come down to it, worst first: what the shaft is colored by. */
const worst = (statuses: Cable['status'][]): Cable['status'] | null => (statuses.includes('cut') ? 'cut' : statuses.includes('live') ? 'live' : statuses.length > 0 ? 'idle' : null);

/**
 * The cables on a floor (0.16.0): from the door of every studio (for a TV
 * studio, of its control room) and of the master control room along the
 * corridor to the shaft by the stairs, which takes them to the master control
 * room and up to the roof. Each is colored by what it carries, and the room it
 * starts in is marked on the floor in the same color.
 */
export function CableLayer({ game, floor, materials }: { game: GameState; floor: number; materials: Materials }) {
  const all = useMemo(() => cablesOf(game, (channel) => channelOffAirReason(game, channel) === null), [game]);
  const building = useContext(Shape);
  const riser = riserOf(building);
  const here = all.filter((cable) => findRoom(game, cable.from)?.floor === floor);
  // The master control room's own cable to the antenna stands for the shaft; on a floor without it, the shaft carries what comes from it or goes to it.
  const shaft = worst(all.map((c) => c.status));
  return (
    <group>
      {here.map((cable, i) => {
        const room = findRoom(game, cable.from)!;
        const outside = doorTiles(room, room.door)?.outside[0];
        if (!outside) return null;
        const door: [number, number] = [outside[0] + 0.5, outside[1] + 0.5];
        const material = cableMaterial(materials, cable.status);
        const mcr = room.type === 'masterControl';
        const route = cableRoute(building, room, door, i);
        return (
          <group key={`${cable.from}-${cable.to}`}>
            {route.slice(1).map((to, k) => (
              <CableRun key={k} from={route[k]!} to={to} material={material} thick={mcr ? 0.16 : 0.1} />
            ))}
            {partsOf(room).map((part, n) => (
              <mesh key={n} position={[part.x + part.w / 2, 0.03, part.y + part.h / 2]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[part.w - 0.3, part.h - 0.3]} />
                <meshBasicMaterial color={material.color} transparent opacity={0.22} depthWrite={false} />
              </mesh>
            ))}
          </group>
        );
      })}
      {shaft && (
        <mesh position={[riser.x, 1.5, riser.z]} material={cableMaterial(materials, shaft)}>
          <boxGeometry args={[0.24, 3, 0.24]} />
        </mesh>
      )}
    </group>
  );
}

/** The cables on the roof (0.16.0): up the shaft beside the stairs and across to the antenna, and to the dish once there is one. */
function RoofCables({ game, materials, antenna, dish }: { game: GameState; materials: Materials; antenna: [number, number]; dish: [number, number] }) {
  const all = useMemo(() => cablesOf(game, (channel) => channelOffAirReason(game, channel) === null), [game]);
  const RISER = riserOf(useContext(Shape));
  const to = (end: 'antenna' | 'dish') => worst(all.filter((c) => c.to === end || (end === 'antenna' && c.to === 'mcr')).map((c) => c.status));
  const ends = [['antenna', antenna, to('antenna')], ['dish', dish, ownsTech(game, 'satelliteUplink') ? to('dish') : null]] as const;
  return (
    <group>
      {ends.map(([end, [x, z], status]) => {
        if (!status) return null;
        const material = cableMaterial(materials, status);
        return (
          <group key={end}>
            <mesh position={[RISER.x, 0.4, RISER.z]} material={material}>
              <boxGeometry args={[0.24, 0.8, 0.24]} />
            </mesh>
            <CableRun from={[RISER.x, RISER.z]} to={[RISER.x, z + 0.9]} y={0.18} material={material} />
            <CableRun from={[RISER.x, z + 0.9]} to={[x, z + 0.9]} y={0.18} material={material} />
            <CableRun from={[x, z + 0.9]} to={[x, z]} y={0.18} material={material} />
          </group>
        );
      })}
    </group>
  );
}

/** The slab of a roof: a trim edge and a top, one for each wing of the building. */
export function RoofSlab({ building, materials }: { building: Building; materials: Materials }) {
  return (
    <>
      {building.wings.map((wing, n) => (
        <group key={n}>
          <mesh position={[wing.x + wing.w / 2, -0.2, wing.y + wing.h / 2]} material={materials.trim} receiveShadow>
            <boxGeometry args={[wing.w + 0.6, 0.4, wing.h + 0.6]} />
          </mesh>
          <mesh position={[wing.x + wing.w / 2, 0.02, wing.y + wing.h / 2]} material={materials.facade} receiveShadow>
            <boxGeometry args={[wing.w, 0.1, wing.h]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/**
 * The roof of the office (0.15.0), above its top floor: a flat roof with a low
 * wall around it, the housings of the stairs and the lifts, and the antenna the
 * company broadcasts from. Once the satellite uplink is researched a dish stands
 * beside it. It is there to look at: nothing on it is bought or placed.
 */
export function Roof({ game, still, materials, cables }: { game: GameState; still: boolean; materials: Materials; cables?: boolean }) {
  const building = useContext(Shape);
  const { stairs, lifts } = coreOf(building);
  const { point } = coreFrame(building);
  /** The door onto the roof is in the side of the stairs' housing that faces the hall. */
  const roofDoor = point(1.5, CORE.stairs.h + 0.01);
  const label = point(1.2, CORE.entry.y + 0.5);
  useRedraw([game.techs, materials]);
  const parts = (key: string, list: Part[], at: [number, number]) => (
    <group key={key} position={[at[0], 0, at[1]]}>
      {list.map((part, i) => (
        <PartMesh key={i} part={part} materials={materials} />
      ))}
    </group>
  );
  return (
    <group>
      <Town floor={building.floors + 1} seed={game.seed} site={siteOfGame(game)} game={game} still={still} materials={materials} />
      <RoofSlab building={building} materials={materials} />
      {/* The low wall around it, and round the courtyard. */}
      {outerWalls(building).map(({ wall: [x1, z1, x2, z2], faces }, n) => {
        const across = faces === 'n' ? 0.05 : faces === 's' ? -0.05 : faces === 'w' ? -0.15 : 0.15;
        const [w, d] = z1 === z2 ? [x2 - x1 + 0.6, 0.3] : [0.3, z2 - z1 + 0.6];
        return (
          <mesh key={n} position={[z1 === z2 ? (x1 + x2) / 2 : x1 + across, 0.25, z1 === z2 ? z1 + across : (z1 + z2) / 2]} material={materials.trim} castShadow>
            <boxGeometry args={[w, 0.5, d]} />
          </mesh>
        );
      })}
      {/* The housings over the stairs and the lifts, with a door onto the roof and the machinery of the lifts. */}
      {[stairs, lifts].map((core, n) => (
        <mesh key={n} position={[core.x + core.w / 2, 0.8, core.y + core.h / 2]} material={materials.facade} castShadow receiveShadow>
          <boxGeometry args={[core.w, 1.6, core.h]} />
        </mesh>
      ))}
      <mesh position={[roofDoor.x, 0.55, roofDoor.z]} rotation={[0, coreTurn(building).angle, 0]} material={materials.metalDark}>
        <boxGeometry args={[0.8, 1.1, 0.04]} />
      </mesh>
      {/* Units of the air conditioning, here and there. */}
      {[[3, 2], [5.5, 2], [12, 8.6]].filter(([x]) => x! < building.w - 2).map(([x, z]) => (
        <group key={`ac${x}`} position={[x!, 0, z!]}>
          <mesh position={[0, 0.45, 0]} material={materials.metalMid} castShadow>
            <boxGeometry args={[1.6, 0.8, 1.1]} />
          </mesh>
          <mesh position={[0, 0.86, 0]} material={materials.metalDark}>
            <cylinderGeometry args={[0.38, 0.38, 0.04, 16]} />
          </mesh>
        </group>
      ))}
      {parts('antenna', ROOF_ASSETS.antenna, [building.w - 4, ANTENNA_Z])}
      {ownsTech(game, 'satelliteUplink') && parts('dish', ROOF_ASSETS.dish, [building.w - 10, DISH_Z])}
      {cables && <RoofCables game={game} materials={materials} antenna={[building.w - 4, ANTENNA_Z]} dish={[building.w - 10, DISH_Z]} />}
      <Html position={[label.x, 0.05, label.z]} center className="o3-corridor" zIndexRange={[4, 0]}>
        {game.companyName.toUpperCase()} · ROOF
      </Html>
    </group>
  );
}
