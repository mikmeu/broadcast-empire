// The cables (0.16.0) and the roof they run to.

import { Html } from '@react-three/drei';
import { useContext, useMemo } from 'react';
import * as THREE from 'three';
import { CORE, FLOOR, WEST, widthOf } from '../../config/office';
import { doorTiles, findRoom } from '../../sim/office';
import { cables as cablesOf, type Cable } from '../../sim/control';
import { channelOffAirReason } from '../../sim/broadcast';
import type { GameState } from '../../sim/state';
import { ownsTech } from '../../sim/tech';
import { ROOF_ASSETS, type Part } from '../assets';
import { SITES } from '../sites';
import { CORRIDOR_Z } from '../layout';
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
const RISER = { x: CORE.hall.x + 0.25, z: CORE.hall.y + 0.25 };

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
        const along = CORRIDOR_Z + (i % 3) * 0.14 - 0.14;
        const mcr = room.type === 'masterControl';
        return (
          <group key={`${cable.from}-${cable.to}`}>
            <CableRun from={door} to={[door[0], along]} material={material} thick={mcr ? 0.16 : 0.1} />
            <CableRun from={[door[0], along]} to={[RISER.x, along]} material={material} thick={mcr ? 0.16 : 0.1} />
            <CableRun from={[RISER.x, along]} to={[RISER.x, RISER.z]} material={material} thick={mcr ? 0.16 : 0.1} />
            <mesh position={[room.x + room.w / 2, 0.03, room.y + room.h / 2]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[room.w - 0.3, room.h - 0.3]} />
              <meshBasicMaterial color={material.color} transparent opacity={0.22} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
      {shaft && (
        <mesh position={[RISER.x, 1.5, RISER.z]} material={cableMaterial(materials, shaft)}>
          <boxGeometry args={[0.24, 3, 0.24]} />
        </mesh>
      )}
    </group>
  );
}

/** The cables on the roof (0.16.0): up the shaft beside the stairs and across to the antenna, and to the dish once there is one. */
function RoofCables({ game, materials, antenna, dish }: { game: GameState; materials: Materials; antenna: [number, number]; dish: [number, number] }) {
  const all = useMemo(() => cablesOf(game, (channel) => channelOffAirReason(game, channel) === null), [game]);
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

/**
 * The roof of the office (0.15.0), above its top floor: a flat roof with a low
 * wall around it, the housings of the stairs and the lifts, and the antenna the
 * company broadcasts from. Once the satellite uplink is researched a dish stands
 * beside it. It is there to look at: nothing on it is bought or placed.
 */
export function Roof({ game, still, materials, cables }: { game: GameState; still: boolean; materials: Materials; cables?: boolean }) {
  const building = useContext(Shape);
  const wide = widthOf(building);
  const middle = WEST + wide / 2;
  const { stairs, lifts } = CORE;
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
      <Town floor={building.floors + 1} seed={game.seed} site={SITES[game.headquarters]} game={game} still={still} materials={materials} />
      <mesh position={[middle, -0.2, FLOOR.h / 2]} material={materials.trim} receiveShadow>
        <boxGeometry args={[wide + 0.6, 0.4, FLOOR.h + 0.6]} />
      </mesh>
      <mesh position={[middle, 0.02, FLOOR.h / 2]} material={materials.facade} receiveShadow>
        <boxGeometry args={[wide - 0.4, 0.1, FLOOR.h - 0.4]} />
      </mesh>
      {/* The low wall around it. */}
      {([[middle, 0.05, wide + 0.6, 0.3], [middle, FLOOR.h - 0.05, wide + 0.6, 0.3]] as const).map(([x, z, w, d]) => (
        <mesh key={`w${z}`} position={[x, 0.25, z]} material={materials.trim} castShadow>
          <boxGeometry args={[w, 0.5, d]} />
        </mesh>
      ))}
      {[WEST - 0.15, building.w + 0.15].map((x) => (
        <mesh key={`e${x}`} position={[x, 0.25, FLOOR.h / 2]} material={materials.trim} castShadow>
          <boxGeometry args={[0.3, 0.5, FLOOR.h + 0.6]} />
        </mesh>
      ))}
      {/* The housings over the stairs and the lifts, with a door onto the roof and the machinery of the lifts. */}
      {[stairs, lifts].map((core) => (
        <mesh key={core.y} position={[core.x + core.w / 2, 0.8, core.y + core.h / 2]} material={materials.facade} castShadow receiveShadow>
          <boxGeometry args={[core.w, 1.6, core.h]} />
        </mesh>
      ))}
      <mesh position={[stairs.x + 1.5, 0.55, stairs.y + stairs.h + 0.01]} material={materials.metalDark}>
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
      <Html position={[WEST + 1.2, 0.05, CORRIDOR_Z]} center className="o3-corridor" zIndexRange={[4, 0]}>
        {game.companyName.toUpperCase()} · ROOF
      </Html>
    </group>
  );
}
