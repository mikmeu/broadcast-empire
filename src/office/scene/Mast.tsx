// A transmitter mast for the edge of a town, in three tiers, after the lattice antenna on the office roof (red and white bands). Tier 1 is 5 tall with a small hut, tier 2 is 8 tall, guyed to the ground with three dish links and a bigger hut, tier 3 is 11 tall with a platform, digital panels on its upper part and red warning lights on top. About 3 wide (tier 1) to 7 across with its guy cables (tier 2), standing on y = 0 with its origin in the middle of the base; the hut stands beside it on +x. Few meshes (about 8 to 14 a tier): the lattice and each tone are merged into one geometry. Nothing moves.

import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type Materials } from './materials';

type Tone = 'red' | 'white' | 'steel' | 'dark' | 'panel';
type Pieces = Record<Tone, THREE.BufferGeometry[]>;

const UP = new THREE.Vector3(0, 1, 0);
const TIERS = {
  1: { h: 5, base: 1.0, top: 0.45, bands: 6, hut: [1.0, 0.7, 0.8] },
  2: { h: 8, base: 1.3, top: 0.5, bands: 8, hut: [1.5, 0.9, 1.1] },
  3: { h: 11, base: 1.7, top: 0.7, bands: 10, hut: [1.8, 1.0, 1.3] },
} as const;

/** A box of the given size, put where the matrix says. */
function box(size: [number, number, number], matrix: THREE.Matrix4): THREE.BufferGeometry {
  return new THREE.BoxGeometry(...size).applyMatrix4(matrix);
}
const at = (x: number, y: number, z: number, rotY = 0, rotZ = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, rotZ, 'YXZ')), new THREE.Vector3(1, 1, 1));

/** A thin rod from one point to another (the guy cables). */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.BufferGeometry {
  const dir = b.clone().sub(a);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
  return new THREE.CylinderGeometry(r, r, dir.length(), 4).applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
}

/** The lattice: four legs, four rings and a cross brace on each face, band by band, narrowing upwards, in red and white. */
function lattice(pieces: Pieces, h: number, base: number, top: number, bands: number) {
  const bh = h / bands;
  for (let i = 0; i < bands; i++) {
    const w = base + ((top - base) * (i + 0.5)) / bands;
    const y = i * bh;
    const tone: Tone = i % 2 === 0 ? 'red' : 'white';
    const list = pieces[tone];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) list.push(box([0.08, bh, 0.08], at((sx * w) / 2, y + bh / 2, (sz * w) / 2)));
    for (const sz of [-1, 1]) list.push(box([w, 0.05, 0.05], at(0, y + bh, (sz * w) / 2)));
    for (const sx of [-1, 1]) list.push(box([0.05, 0.05, w], at((sx * w) / 2, y + bh, 0)));
    const len = Math.hypot(w, bh);
    for (let k = 0; k < 4; k++) {
      // The brace is made on the +z face, then turned round the mast.
      const brace = box([len, 0.04, 0.04], at(0, 0, 0, 0, Math.atan2(bh, w)));
      list.push(brace.applyMatrix4(new THREE.Matrix4().makeRotationY((k * Math.PI) / 2).multiply(new THREE.Matrix4().makeTranslation(0, y + bh / 2, w / 2))));
    }
  }
}

/** A dish on the mast, its bowl facing out at the angle given. */
function dish(pieces: Pieces, y: number, turn: number, r: number, reach: number) {
  const m = new THREE.Matrix4().makeRotationY(turn).multiply(new THREE.Matrix4().makeTranslation(reach, y, 0));
  pieces.white.push(new THREE.CylinderGeometry(r, r * 0.7, 0.3, 14).applyMatrix4(new THREE.Matrix4().makeRotationZ(-Math.PI / 2)).applyMatrix4(m));
  pieces.steel.push(box([reach, 0.06, 0.06], new THREE.Matrix4().makeRotationY(turn).multiply(new THREE.Matrix4().makeTranslation(reach / 2 - 0.1, y, 0))));
}

function build(tier: 1 | 2 | 3): { pieces: Pieces; lights: THREE.Vector3[]; hut: readonly [number, number, number]; hutX: number } {
  const { h, base, top, bands, hut } = TIERS[tier];
  const pieces: Pieces = { red: [], white: [], steel: [], dark: [], panel: [] };
  const lights: THREE.Vector3[] = [];
  pieces.dark.push(box([base + 0.5, 0.2, base + 0.5], at(0, 0.1, 0)));
  lattice(pieces, h, base, top, bands);
  const topW = top;
  // Mast head: a pole, longer on the bigger masts.
  const pole = tier === 3 ? 1.4 : 0.8;
  pieces.steel.push(new THREE.CylinderGeometry(0.03, 0.04, pole, 5).translate(0, h + pole / 2, 0));
  pieces.dark.push(box([topW + 0.1, 0.08, topW + 0.1], at(0, h + 0.04, 0)));

  if (tier === 1) {
    lights.push(new THREE.Vector3(0, h + pole + 0.06, 0));
  }
  if (tier === 2) {
    // Dish links at three heights, turned to different sides.
    dish(pieces, 3.2, 0.5, 0.4, 0.8);
    dish(pieces, 5.0, 2.6, 0.45, 0.8);
    dish(pieces, 6.4, 4.4, 0.35, 0.7);
    // Guy cables from two heights to anchors in the ground.
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const ground = new THREE.Vector3(dx * 3.4, 0.05, dz * 3.4);
      pieces.steel.push(rod(new THREE.Vector3(dx * 0.3, 5.6, dz * 0.3), ground, 0.012));
      pieces.steel.push(rod(new THREE.Vector3(dx * 0.2, 7.8, dz * 0.2), new THREE.Vector3(dx * 3.4, 0.05, dz * 3.4), 0.012));
      pieces.dark.push(box([0.25, 0.14, 0.25], at(ground.x, 0.07, ground.z, -a)));
    }
    lights.push(new THREE.Vector3(0, h + pole + 0.06, 0));
  }
  if (tier === 3) {
    // The platform, a third of the way from the top, with a rail round it.
    const py = 7.4;
    const pw = 2.0;
    pieces.dark.push(box([pw, 0.12, pw], at(0, py, 0)));
    for (const s of [-1, 1]) {
      pieces.steel.push(box([pw, 0.05, 0.05], at(0, py + 0.5, (s * pw) / 2)));
      pieces.steel.push(box([0.05, 0.05, pw], at((s * pw) / 2, py + 0.5, 0)));
      for (const t of [-1, 1]) pieces.steel.push(box([0.04, 0.5, 0.04], at((s * pw) / 2, py + 0.31, (t * pw) / 2)));
      for (const t of [-1, 1]) lights.push(new THREE.Vector3((s * pw) / 2, py + 0.6, (t * pw) / 2));
    }
    // Digital panels: two rows of flat boxes on each side of the upper mast.
    const wAt = (y: number) => base + ((top - base) * y) / h;
    for (let k = 0; k < 4; k++) {
      for (const [y, ph] of [[8.5, 0.9], [9.8, 0.9]] as const) {
        const d = wAt(y) / 2 + 0.14;
        const m = new THREE.Matrix4().makeRotationY((k * Math.PI) / 2).multiply(new THREE.Matrix4().makeTranslation(0, y, d));
        pieces.panel.push(box([0.7, ph, 0.08], m));
        pieces.steel.push(box([0.76, 0.04, 0.12], new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeTranslation(0, ph / 2, 0))));
      }
    }
    lights.push(new THREE.Vector3(0, h + pole + 0.07, 0));
  }
  return { pieces, lights, hut, hutX: base / 2 + 0.5 + hut[0] / 2 };
}

export function Mast({ tier, materials }: { tier: 1 | 2 | 3; materials: Materials }) {
  const built = useMemo(() => {
    const { pieces, lights, hut, hutX } = build(tier);
    const merged = Object.fromEntries(
      (Object.keys(pieces) as Tone[]).map((tone) => [tone, pieces[tone].length ? mergeGeometries(pieces[tone]) : null]),
    ) as Record<Tone, THREE.BufferGeometry | null>;
    return { merged, lights, hut, hutX };
  }, [tier]);
  // The warning lights glow in the colour of the on-air light, a material of their own.
  const glow = useMemo(() => new THREE.MeshLambertMaterial({ color: materials.onAir.color, emissive: materials.onAir.color, flatShading: true }), [materials.onAir]);
  const { merged, lights, hut, hutX } = built;
  const tones: Record<Tone, THREE.Material> = { red: materials.onAir, white: materials.white, steel: materials.metalMid, dark: materials.metalDark, panel: materials.glass };
  const [hw, hh, hd] = hut;
  return (
    <group>
      {(Object.keys(merged) as Tone[]).map((tone) => merged[tone] && <mesh key={tone} geometry={merged[tone]} material={tones[tone]} />)}
      {/* The equipment hut at the foot, with a door facing +z and a flat roof. */}
      <mesh position={[hutX, hh / 2, 0]} material={materials.facade}>
        <boxGeometry args={[hw, hh, hd]} />
      </mesh>
      <mesh position={[hutX, hh + 0.04, 0]} material={materials.metalDark}>
        <boxGeometry args={[hw + 0.1, 0.08, hd + 0.1]} />
      </mesh>
      <mesh position={[hutX, 0.35, hd / 2 + 0.01]} material={materials.metalMid}>
        <boxGeometry args={[0.32, 0.7, 0.02]} />
      </mesh>
      {/* Warning lights, static. */}
      {lights.map((p, i) => (
        <mesh key={i} position={p} material={glow}>
          <sphereGeometry args={[0.07, 8, 6]} />
        </mesh>
      ))}
    </group>
  );
}
