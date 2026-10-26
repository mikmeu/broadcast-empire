// The company's parking lot (0.20.0), east of the office's own block: its ground, the lines of the bays that are open, the van zone, the arrows of the aisle and a sign at the way in. What is not open yet is rough ground with a tape and a few cones, so the lot is seen to grow with the floors. The cars and vans in it are StreetLife's.

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Building } from '../../config/office';
import { PAVEMENT, lotBlock } from '../city';
import { LOT_ROWS, lotOf, openBays, rowsOpen, vansOpen } from '../parking';
import { type Materials } from './materials';

/** Paint lies this high on the ground, and the lines on the paint. */
const PAINT = 0.006;
const LINE = PAINT + 0.005;
/** How wide the lines of a car bay and of a van bay are. */
const STRIPE = { car: 0.07, van: 0.1 } as const;
/** How wide a lane of the drive-in is, and how far its ramp reaches up and down the lot's edge. */
const LANE = 0.55;

/** A flat or low box, to be one of many in one mesh: where its middle is on the ground, its size and its turn. */
interface Piece {
  x: number;
  z: number;
  w: number;
  d: number;
  /** Turn around the vertical, so that its length `d` runs along (sin, cos). */
  turn?: number;
  y?: number;
  h?: number;
}

/** A stroke of paint from one point of the ground to another. */
const stroke = (x1: number, z1: number, x2: number, z2: number, w: number, cap = 0): Piece => ({
  x: (x1 + x2) / 2,
  z: (z1 + z2) / 2,
  w,
  d: Math.hypot(x2 - x1, z2 - z1) + cap,
  turn: Math.atan2(x2 - x1, z2 - z1),
});

/** The letters of VANS as strokes in a box of 1 by 1: across, and up. */
const LETTERS: [number, number, number, number][][] = [
  [[0, 1, 0.5, 0], [1, 1, 0.5, 0]],
  [[0, 0, 0.5, 1], [1, 0, 0.5, 1], [0.25, 0.4, 0.75, 0.4]],
  [[0, 0, 0, 1], [0, 1, 1, 0], [1, 0, 1, 1]],
  [[1, 1, 0, 1], [0, 1, 0, 0.5], [0, 0.5, 1, 0.5], [1, 0.5, 1, 0], [1, 0, 0, 0]],
];

/** Many pieces of one material in one mesh: the town is drawn every frame, so a hundred lines must not be a hundred meshes. */
function Pieces({ pieces, material, geometry = 'box' }: { pieces: Piece[]; material: THREE.Material; geometry?: 'box' | 'cone' }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const node = mesh.current;
    if (!node) return;
    const dummy = new THREE.Object3D();
    pieces.forEach((piece, n) => {
      const h = piece.h ?? 0.01;
      dummy.position.set(piece.x, piece.y ?? PAVEMENT + LINE - 0.005 + h / 2, piece.z);
      dummy.rotation.set(0, piece.turn ?? 0, 0);
      dummy.scale.set(piece.w, h, piece.d);
      dummy.updateMatrix();
      node.setMatrixAt(n, dummy.matrix);
    });
    node.instanceMatrix.needsUpdate = true;
    node.computeBoundingSphere();
  }, [pieces]);
  if (!pieces.length) return null;
  // A new count is a new mesh: an instanced mesh can't change how many it holds.
  return (
    <instancedMesh key={pieces.length} ref={mesh} args={[undefined, undefined, pieces.length]} material={material}>
      {geometry === 'cone' ? <coneGeometry args={[0.5, 1, 8]} /> : <boxGeometry args={[1, 1, 1]} />}
    </instancedMesh>
  );
}

/** A rectangle of ground, lying just over the pavement. */
function Ground({ x0, x1, z0, z1, y = PAINT, material }: { x0: number; x1: number; z0: number; z1: number; y?: number; material: THREE.Material }) {
  if (x1 - x0 < 0.01 || z1 - z0 < 0.01) return null;
  return (
    <mesh position={[(x0 + x1) / 2, PAVEMENT + y, (z0 + z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <planeGeometry args={[x1 - x0, z1 - z0]} />
    </mesh>
  );
}

/** A solid box from corner to corner, standing on the street. */
function Slab({ x0, x1, z0, z1, top, material }: { x0: number; x1: number; z0: number; z1: number; top: number; material: THREE.Material }) {
  if (x1 - x0 < 0.01 || z1 - z0 < 0.01) return null;
  return (
    <mesh position={[(x0 + x1) / 2, top / 2, (z0 + z1) / 2]} material={material}>
      <boxGeometry args={[x1 - x0, top, z1 - z0]} />
    </mesh>
  );
}

/** The dropped kerb: a wedge from the street up to the lot's ground, as wide as the two lanes of the drive-in. */
function Ramp({ x, z0, z1, material }: { x: number; z0: number; z1: number; material: THREE.Material }) {
  const geometry = useMemo(() => {
    const profile = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1, 0), new THREE.Vector2(1, PAVEMENT + PAINT)]);
    return new THREE.ExtrudeGeometry(profile, { depth: z1 - z0, bevelEnabled: false });
  }, [z0, z1]);
  return <mesh position={[x, 0, z0]} geometry={geometry} material={material} />;
}

/** The pieces of paint, cones and stones of a lot at a level, worked out from its geometry. */
function layout(building: Building, level: number) {
  const lot = lotOf(building);
  const [rows, vans] = [rowsOpen(building, level), vansOpen(building, level)];
  const open = openBays(building, level);
  const south = lot.z1 - 1.5;
  const rowZ = (row: number) => south - 1.1 * (row + 0.5);
  const north = Math.min(south - 1.1 * rows, lot.drive.out - 1.1 / 2);
  const middle = (lot.aisle.x0 + lot.aisle.x1) / 2;

  const white: Piece[] = [];
  const yellow: Piece[] = [];
  // The lines along x are shared by two bays next to each other, so each is drawn once.
  const edges = new Map<string, { kind: 'car' | 'van'; x0: number; x1: number; z: number }>();
  for (const bay of open) {
    const depth = bay.kind === 'van' ? 2 : 1.8;
    const [back, front] = bay.side === 'west' ? [bay.x - depth / 2, bay.x + depth / 2] : [bay.x + depth / 2, bay.x - depth / 2];
    const inward = bay.side === 'west' ? -1 : 1;
    const w = STRIPE[bay.kind];
    const list = bay.kind === 'van' ? yellow : white;
    for (const z of [bay.z - 1.1 / 2, bay.z + 1.1 / 2]) {
      const key = `${bay.side}${z.toFixed(2)}`;
      const had = edges.get(key);
      if (!had || bay.kind === 'van') edges.set(key, { kind: bay.kind, x0: Math.min(back, front), x1: Math.max(back, front), z });
    }
    // The end by the aisle, a little inside the bay.
    const xEnd = front + inward * (w / 2);
    list.push({ x: xEnd, z: bay.z, w, d: 1.1 + w });
  }
  for (const edge of edges.values()) {
    const w = STRIPE[edge.kind];
    (edge.kind === 'van' ? yellow : white).push({ x: (edge.x0 + edge.x1) / 2, z: edge.z, w: edge.x1 - edge.x0, d: w });
  }

  // VANS, between the two lanes, over the open part of the van zone: the strokes read along -z with the tops of the letters to -x.
  let word: [from: number, to: number] | null = null;
  if (vans > 0) {
    const zone = open.filter((bay) => bay.kind === 'van');
    const zMid = (Math.min(...zone.map((bay) => bay.z)) + Math.max(...zone.map((bay) => bay.z))) / 2;
    const scale = Math.min(1, (vans * 1.1) / 1.7);
    const [width, height, gap, thick] = [0.26 * scale, 0.5 * scale, 0.14 * scale, 0.07 * scale];
    const total = LETTERS.length * width + (LETTERS.length - 1) * gap;
    word = [zMid - total / 2, zMid + total / 2];
    LETTERS.forEach((strokes, n) => {
      const z0 = zMid - total / 2 + n * (width + gap);
      // Turned half round about the middle of the word, to read from the way the view looks by default.
      for (const [u1, v1, u2, v2] of strokes) yellow.push(stroke(middle - (v1 - 0.5) * height, 2 * zMid - (z0 + u1 * width), middle - (v2 - 0.5) * height, 2 * zMid - (z0 + u2 * width), thick, thick * 0.5));
    });
  }

  // Arrows along the lanes: the north lane runs towards -z, the south lane towards +z. None where the word is.
  for (let row = 2; row < rows; row += 2) {
    const z = rowZ(row);
    if (word && z + 0.45 > word[0] && z - 0.45 < word[1]) continue;
    for (const [x, direction] of [[lot.aisle.north, -1], [lot.aisle.south, 1]] as const) {
      const tip = z + direction * 0.3;
      const tail = z - direction * 0.3;
      white.push(stroke(x, tail, x, tip, 0.07));
      for (const side of [-1, 1]) white.push(stroke(x, tip, x + side * 0.15, tip - direction * 0.15, 0.07, 0.035));
    }
  }

  // The ground, its ramp's width and the part that is still rough.
  const sizes = { x0: lot.x0, xa: lotBlock(building).x + 0.5, x1: lot.x1 };
  const gap = { z0: lot.drive.out - LANE, z1: lot.drive.in + LANE };
  const closedVans = lot.bays.filter((bay) => bay.kind === 'van' && bay.row >= vans && bay.row < rows);
  const patch = closedVans.length
    ? { x0: lot.aisle.x1, x1: lot.x1, z0: Math.min(...closedVans.map((bay) => bay.z)) - 1.1 / 2, z1: Math.max(...closedVans.map((bay) => bay.z)) + 1.1 / 2 }
    : null;

  // Cones and a tape where the open lot ends, and the corners of the van bays not open yet.
  const cones: Piece[] = [];
  const cone = (x: number, z: number) => cones.push({ x, z, w: 0.2, d: 0.2, h: 0.3, y: PAVEMENT + PAINT + 0.15 });
  const tape: Piece[] = [];
  if (rows < LOT_ROWS) {
    const z = north - 0.04;
    for (const x of [sizes.xa + 0.2, (sizes.xa + sizes.x1) / 2, sizes.x1 - 0.2]) cone(x, z);
    tape.push({ x: (sizes.xa + sizes.x1) / 2, z, w: sizes.x1 - sizes.xa - 0.4, d: 0.015, h: 0.05, y: PAVEMENT + 0.26 });
  }
  if (patch) for (const z of [patch.z0 + 0.12, (patch.z0 + patch.z1) / 2, patch.z1 - 0.12]) cone(patch.x0 + 0.12, z);

  // Stones on the rough ground, where they always are for a level.
  const stones: Piece[] = [];
  const scatter = (x0: number, x1: number, z0: number, z1: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const [a, b, c] = [Math.sin(i * 12.9898 + z0) * 43758.5453, Math.sin(i * 78.233 + x0) * 12543.1, Math.sin(i * 39.346 + x1) * 9731.7].map((n) => n - Math.floor(n)) as [number, number, number];
      const size = 0.1 + c * 0.14;
      stones.push({ x: x0 + 0.15 + a * (x1 - x0 - 0.3), z: z0 + 0.15 + b * (z1 - z0 - 0.3), w: size, d: size * 0.8, h: size * 0.6, y: PAVEMENT + PAINT + size * 0.3, turn: c * 6 });
    }
  };
  if (north - lot.z0 > 0.6) scatter(sizes.xa, sizes.x1, lot.z0, north, Math.round((north - lot.z0) * 2));
  if (patch) scatter(patch.x0, patch.x1, patch.z0, patch.z1, 3);

  return { lot, sizes, gap, north, south, patch, white, yellow, cones, tape, stones };
}

/** The parking lot of the building, with as much of it open as `level` floors give. */
export function Parking({ building, level, materials }: { building: Building; level: number; materials: Materials }) {
  const { lot, sizes, gap, north, south, patch, white, yellow, cones, tape, stones } = useMemo(() => layout(building, level), [building, level]);
  const block = lotBlock(building);
  const edge = block.x;
  const bottom = block.z + block.d;
  const kerb = { x: block.x + 0.07, h: 0.08 };
  return (
    <group>
      {/* The pavement round the lot, as high as the others; its west edge is cut away for the dropped kerb. */}
      <Slab x0={sizes.xa} x1={block.x + block.w} z0={block.z} z1={bottom} top={PAVEMENT} material={materials.pavement} />
      <Slab x0={edge} x1={sizes.xa} z0={block.z} z1={gap.z0} top={PAVEMENT} material={materials.pavement} />
      <Slab x0={edge} x1={sizes.xa} z0={gap.z1} z1={bottom} top={PAVEMENT} material={materials.pavement} />
      <Ramp x={lot.street + 0.5}z0={gap.z0} z1={gap.z1} material={materials.street} />

      {/* Asphalt over what is open, and gravel where the lot is not built yet. */}
      <Ground x0={sizes.xa} x1={sizes.x1} z0={north} z1={south} material={materials.street} />
      <Ground x0={sizes.x0} x1={sizes.xa} z0={north} z1={gap.z0} material={materials.street} />
      <Ground x0={sizes.xa} x1={sizes.x1} z0={lot.z0} z1={north} material={materials.sand} />
      <Ground x0={sizes.x0} x1={sizes.xa} z0={lot.z0} z1={Math.min(north, gap.z0)} material={materials.sand} />
      {patch && <Ground x0={patch.x0} x1={patch.x1} z0={patch.z0} z1={patch.z1} y={PAINT + 0.002} material={materials.sand} />}
      <Pieces pieces={stones} material={materials.rock} />
      <Pieces pieces={cones} material={materials.onAir} geometry="cone" />
      <Pieces pieces={tape} material={materials.onAir} />

      {/* Paint. */}
      <Pieces pieces={white} material={materials.white} />
      <Pieces pieces={yellow} material={materials.lamp} />

      {/* A low kerb along the street, either side of the dropped kerb, and along the pavement's south edge, clear of the corner where people cross. */}
      <mesh position={[kerb.x, PAVEMENT + kerb.h / 2, (block.z + gap.z0) / 2]} material={materials.facade}>
        <boxGeometry args={[0.14, kerb.h, gap.z0 - block.z]} />
      </mesh>
      <mesh position={[kerb.x, PAVEMENT + kerb.h / 2, (gap.z1 + bottom) / 2]} material={materials.facade}>
        <boxGeometry args={[0.14, kerb.h, bottom - gap.z1]} />
      </mesh>
      <mesh position={[(block.x + 1.2 + block.x + block.w) / 2, PAVEMENT + kerb.h / 2, bottom - 0.07]} material={materials.facade}>
        <boxGeometry args={[block.w - 1.2, kerb.h, 0.14]} />
      </mesh>

      {/* The sign at the way in: a blue P on a pole, facing the street. */}
      <group position={[block.x + 0.3, PAVEMENT, gap.z1 + 0.2]}>
        <mesh position={[0, 0.75, 0]} material={materials.metalMid}>
          <boxGeometry args={[0.06, 1.5, 0.06]} />
        </mesh>
        <mesh position={[0, 1.25, 0]} material={materials.accent}>
          <boxGeometry args={[0.04, 0.4, 0.4]} />
        </mesh>
        {/* The letter, as [up, along z, height, width] from the middle of the panel. */}
        {[
          [0, -0.07, 0.26, 0.05],
          [0.105, 0, 0.05, 0.17],
          [0.01, 0, 0.05, 0.17],
          [0.058, 0.06, 0.1, 0.05],
        ].map(([y, z, h, d], n) => (
          <mesh key={n} position={[-0.025, 1.25 + y!, z!]} material={materials.white}>
            <boxGeometry args={[0.02, h, d]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
