// The vehicles as geometry: the Car Kit's models (CARS in assets.ts) turned to point along +x, scaled to the sizes of `CITY.vehicles` and cut into
// parts by the swatch of the colour map each face is painted with, so that the street can draw each part as one instanced mesh in the town's own colour.
// Three.js, no React and no WebGL: a test reads it as it is.

import * as THREE from 'three';
import { CARS, CITY, type Tone } from '../assets';
import type { VehicleKind } from '../traffic';
import { busBoxes } from './busParts';
import { listsBySwatch } from './swatches';

/** What a vehicle is drawn as: a car is one of the kit's three, the taxi is yellow with a sign, the news van (0.20.0) has its dish. */
export type VehicleLook = 'sedan' | 'suv' | 'hatchback' | 'taxi' | 'van' | 'truck' | 'bus' | 'news';

export const LOOKS: readonly VehicleLook[] = ['sedan', 'suv', 'hatchback', 'taxi', 'van', 'truck', 'bus', 'news'];

/** The parts of a vehicle: the body takes the vehicle's colour, the others are the palette's (and the news van's stripe the channel's). */
export type PartName = 'body' | 'glass' | 'dark' | 'lamp' | 'metal' | 'metalMid' | 'stripe';

export type Parts = Partial<Record<PartName, THREE.BufferGeometry>>;

/** A shape added to a vehicle: the middle of its box, its size and the part it joins; x along the vehicle, y up from the ground, z across. */
export interface Box {
  at: [number, number, number];
  size: [number, number, number];
  part: PartName;
}

export type ModelName = keyof typeof CARS.models;

/** The look of a vehicle in the traffic: each colour of car is always the same one of the kit's cars. */
export function lookOf(vehicle: { kind: VehicleKind; tone: Tone; news?: true }): VehicleLook {
  if (vehicle.news) return 'news';
  if (vehicle.kind !== 'car') return vehicle.kind;
  return CARS.cars[Math.max(0, CITY.traffic.tones.indexOf(vehicle.tone)) % CARS.cars.length]!;
}

/** The kind of vehicle whose size a look is drawn at. */
export function kindOf(look: VehicleLook): VehicleKind {
  return look === 'sedan' || look === 'suv' || look === 'hatchback' ? 'car' : look === 'news' ? 'van' : look;
}

/** The kit's model a look is made of; the bus has none. */
export function modelOf(look: VehicleLook): ModelName | null {
  return look === 'bus' ? null : look === 'taxi' ? 'sedan' : look === 'news' ? 'van' : look;
}

/** Geometries joined into one, with their positions and normals, and their UV if all have it. */
function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const withUv = list.every((geometry) => geometry.getAttribute('uv'));
  const position: number[] = [];
  const normal: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  for (const geometry of list) {
    const base = position.length / 3;
    const p = geometry.getAttribute('position');
    const n = geometry.getAttribute('normal');
    const t = geometry.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      position.push(p.getX(i), p.getY(i), p.getZ(i));
      normal.push(n.getX(i), n.getY(i), n.getZ(i));
      if (withUv) uv.push(t.getX(i), t.getY(i));
    }
    const faces = geometry.index!;
    for (let i = 0; i < faces.count; i++) index.push(base + faces.getX(i));
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  if (withUv) merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  merged.setIndex(index);
  return merged;
}

/** The faces of `source` that `triangles` lists, as a geometry of their own with only the vertices they use. */
function carved(source: THREE.BufferGeometry, triangles: number[]): THREE.BufferGeometry {
  const p = source.getAttribute('position');
  const n = source.getAttribute('normal');
  const taken = new Map<number, number>();
  const position: number[] = [];
  const normal: number[] = [];
  const index = triangles.map((vertex) => {
    let at = taken.get(vertex);
    if (at === undefined) {
      at = taken.size;
      taken.set(vertex, at);
      position.push(p.getX(vertex), p.getY(vertex), p.getZ(vertex));
      normal.push(n.getX(vertex), n.getY(vertex), n.getZ(vertex));
    }
    return at;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setIndex(index);
  return geometry;
}

const SPLIT: PartName[] = ['body', 'glass', 'metal', 'dark'];

/**
 * A model of the kit as the parts of a vehicle of `kind`: all its meshes (the wheels too) joined, turned to point along +x, its middle on the origin
 * and its foot on y = 0, and made exactly as long and wide as `CITY.vehicles[kind]`. The height follows the mean of those two scales, so
 * that nothing looks squashed; it is given too, for what stands on the roof.
 */
export function partsOf(scene: THREE.Object3D, name: ModelName, kind: VehicleKind): { parts: Parts; height: number } {
  const spec = CARS.models[name];
  scene.updateMatrixWorld(true);
  const pieces: THREE.BufferGeometry[] = [];
  scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) pieces.push(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
  });
  const whole = merge(pieces);
  whole.computeBoundingBox();
  // Copied: the geometry moves its own box along when it is moved.
  const box = whole.boundingBox!.clone();
  const size = CITY.vehicles[kind];
  const along = size.length / (box.max.z - box.min.z);
  const across = size.width / (box.max.x - box.min.x);
  const up = (along + across) / 2;
  // The kit's front is +z; ours is +x.
  const matrix = new THREE.Matrix4()
    .makeScale(along, up, across)
    .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2))
    .multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2));
  whole.applyMatrix4(matrix);
  const swatches = (list: readonly (readonly number[])[], column: number, row: number) => list.some(([c, r]) => c === column && r === row);
  const lists = listsBySwatch(
    whole,
    (column, row) => (swatches(spec.body, column, row) ? 0 : swatches(spec.glass, column, row) ? 1 : swatches(spec.metal, column, row) ? 2 : 3),
    SPLIT.length,
    CARS.across,
    CARS.down,
  );
  const parts: Parts = {};
  SPLIT.forEach((part, n) => {
    if (lists[n]!.length > 0) parts[part] = carved(whole, lists[n]!);
  });
  return { parts, height: (box.max.y - box.min.y) * up };
}

/** The shapes of a vehicle's own, over its roof and along its sides, in a vehicle of this size and `height` (the roof). */
export function extrasOf(look: VehicleLook, length: number, width: number, height: number): Box[] {
  if (look === 'bus') return busBoxes(length, width);
  if (look === 'taxi') {
    // The sign on its roof.
    return [{ at: [-0.1, height + 0.09, 0], size: [0.44, 0.24, 0.72], part: 'dark' }];
  }
  if (look === 'news') {
    // A stripe in the channel's color along both sides, and on the roof a mast with a flat dish on it (a wide, thin head with a rim, and a small feed
    // standing over it), seen well from the town's camera.
    return [
      { at: [-0.36, height * 0.42, 0], size: [length - 1.2, 0.24, width + 0.04], part: 'stripe' },
      { at: [-0.4, height + 0.2, 0], size: [0.14, 0.52, 0.14], part: 'dark' },
      { at: [-0.4, height + 0.46, 0], size: [1.12, 0.1, 1.12], part: 'metal' },
      { at: [-0.4, height + 0.54, 0], size: [0.8, 0.1, 0.8], part: 'metalMid' },
      { at: [-0.4, height + 0.74, 0], size: [0.1, 0.32, 0.1], part: 'dark' },
    ];
  }
  return [];
}

/** `boxes` joined to the parts they belong to. */
export function withBoxes(parts: Parts, boxes: Box[]): Parts {
  const joined: Parts = { ...parts };
  for (const box of boxes) {
    const geometry = new THREE.BoxGeometry(...box.size).translate(...box.at);
    joined[box.part] = merge([...(joined[box.part] ? [joined[box.part]!] : []), geometry].map(plain));
  }
  return joined;
}

/** A geometry with only its positions and normals, which is what the parts are made of. */
function plain(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const clean = new THREE.BufferGeometry();
  clean.setAttribute('position', geometry.getAttribute('position'));
  clean.setAttribute('normal', geometry.getAttribute('normal'));
  clean.setIndex(geometry.index);
  return clean;
}

/** The parts of a look: those of the kit's model (the bus has none, and is made of shapes), and what the look carries on it. */
export function lookParts(look: VehicleLook, scene: THREE.Object3D | null): Parts {
  const kind = kindOf(look);
  const { length, width } = CITY.vehicles[kind];
  const model = modelOf(look);
  if (!model) return withBoxes({}, extrasOf(look, length, width, 0));
  if (!scene) throw new Error(`The model of the ${look} is not loaded`);
  const { parts, height } = partsOf(scene, model, kind);
  return withBoxes(parts, extrasOf(look, length, width, height));
}

/** How many triangles the parts of a look have. */
export function triangles(parts: Parts): number {
  return Object.values(parts).reduce((sum, geometry) => sum + (geometry?.index?.count ?? 0) / 3, 0);
}
