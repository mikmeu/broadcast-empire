// The vehicles' models: the files of the Car Kit are there and are the size they are said to be, every look has its parts, and each is as large as `CITY.vehicles`.

import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CARS, CITY } from '../assets';
import { LOOKS, kindOf, lookOf, lookParts, modelOf, partsOf, triangles, type Parts } from './vehicleModels';

/** A .glb of the kit as three.js objects, read from the file with no WebGL (the loader of three.js wants a browser for the textures). */
function readGlb(file: string): THREE.Group {
  const buffer = readFileSync(`public/models/${file}`);
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString());
  const bin = buffer.subarray(20 + jsonLength + 8);
  const read = (accessor: number): { values: number[]; size: number } => {
    const a = json.accessors[accessor];
    const view = json.bufferViews[a.bufferView];
    const size = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type as 'SCALAR' | 'VEC2' | 'VEC3'];
    const bytes = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType as 5126 | 5125 | 5123 | 5121];
    const stride = view.byteStride ?? size * bytes;
    const values: number[] = [];
    for (let i = 0; i < a.count; i++) {
      for (let c = 0; c < size; c++) {
        const at = (view.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * stride + c * bytes;
        values.push(a.componentType === 5126 ? bin.readFloatLE(at) : a.componentType === 5125 ? bin.readUInt32LE(at) : a.componentType === 5123 ? bin.readUInt16LE(at) : bin.readUInt8(at));
      }
    }
    return { values, size };
  };
  const build = (n: number): THREE.Object3D => {
    const node = json.nodes[n];
    const object = new THREE.Group();
    if (node.matrix) new THREE.Matrix4().fromArray(node.matrix).decompose(object.position, object.quaternion, object.scale);
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale);
    if (node.mesh !== undefined) {
      for (const primitive of json.meshes[node.mesh].primitives) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(read(primitive.attributes.POSITION).values, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(read(primitive.attributes.NORMAL).values, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(read(primitive.attributes.TEXCOORD_0).values, 2));
        geometry.setIndex(read(primitive.indices).values);
        object.add(new THREE.Mesh(geometry));
      }
    }
    for (const child of node.children ?? []) object.add(build(child));
    return object;
  };
  const scene = new THREE.Group();
  for (const n of json.scenes[json.scene ?? 0].nodes) scene.add(build(n));
  return scene;
}

const boxOf = (geometries: THREE.BufferGeometry[]) => {
  const box = new THREE.Box3();
  for (const geometry of geometries) {
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox!);
  }
  return box;
};

const models = Object.keys(CARS.models) as (keyof typeof CARS.models)[];

describe('the Car Kit', () => {
  it('has every model of CARS, with its licence and colour map', () => {
    for (const model of models) expect(existsSync(`public/models/${CARS.models[model].file}`), model).toBe(true);
    expect(existsSync('public/models/cars/License.txt')).toBe(true);
    expect(existsSync('public/models/cars/Textures/colormap.png')).toBe(true);
  });

  it('has each model the size CARS says: length along z, width along x', () => {
    for (const model of models) {
      const scene = readGlb(CARS.models[model].file);
      scene.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
      const spec = CARS.models[model];
      expect(size.z, `${model} length`).toBeCloseTo(spec.length, 2);
      expect(size.x, `${model} width`).toBeCloseTo(spec.width, 2);
      expect(size.y, `${model} height`).toBeCloseTo(spec.height, 2);
    }
  });
});

describe('partsOf', () => {
  it('makes a made-up model exactly as long and wide as the vehicle, pointing along +x and standing on y = 0', () => {
    const scene = new THREE.Group();
    // 2 across, 1 high and 4 long, with its front towards +z and its middle off the origin.
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4).translate(3, 7, -2)));
    for (const kind of ['car', 'van', 'truck'] as const) {
      const { parts, height } = partsOf(scene, 'sedan', kind);
      const box = boxOf(Object.values(parts) as THREE.BufferGeometry[]);
      const size = box.getSize(new THREE.Vector3());
      const { length, width } = CITY.vehicles[kind];
      expect(size.x).toBeCloseTo(length, 5);
      expect(size.z).toBeCloseTo(width, 5);
      expect(box.min.y).toBeCloseTo(0, 5);
      expect(box.max.y).toBeCloseTo(height, 5);
      expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 5);
      // The height follows the mean of the two scales.
      expect(height).toBeCloseTo(((length / 4 + width / 2) / 2) * 1, 5);
    }
  });

  it('loses no triangle of the model in the parts', () => {
    const scene = new THREE.Group();
    const box = new THREE.BoxGeometry(2, 1, 4);
    scene.add(new THREE.Mesh(box));
    const { parts } = partsOf(scene, 'sedan', 'car');
    expect(triangles(parts)).toBe(box.index!.count / 3);
  });
});

describe('the looks', () => {
  const parts = Object.fromEntries(
    LOOKS.map((look) => {
      const model = modelOf(look);
      return [look, lookParts(look, model ? readGlb(CARS.models[model].file) : null)];
    }),
  ) as Record<(typeof LOOKS)[number], Parts>;

  it('has a body, glass and dark parts in each', () => {
    for (const look of LOOKS) {
      expect(parts[look].body, `${look} body`).toBeDefined();
      expect(parts[look].glass, `${look} glass`).toBeDefined();
      expect(parts[look].dark, `${look} dark`).toBeDefined();
    }
  });

  it('draws each look as long and as wide as its vehicle, with the news van on the van', () => {
    for (const look of LOOKS) {
      const { length, width } = CITY.vehicles[kindOf(look)];
      // What is made of shapes (the bus's skirt and lamp, the news van's stripe) may reach a hand's width beyond the body, and no more.
      const size = boxOf(Object.values(parts[look]) as THREE.BufferGeometry[]).getSize(new THREE.Vector3());
      expect(size.x, `${look} length`).toBeGreaterThanOrEqual(length - 0.001);
      expect(size.x, `${look} length`).toBeLessThan(length + 0.1);
      expect(size.z, `${look} width`).toBeGreaterThanOrEqual(width - 0.001);
      expect(size.z, `${look} width`).toBeLessThan(width + 0.1);
    }
  });

  it('keeps every look under the 3 tiles of the railway deck', () => {
    for (const look of LOOKS) {
      const box = boxOf(Object.values(parts[look]) as THREE.BufferGeometry[]);
      expect(box.max.y, look).toBeLessThan(CITY.railway.height);
    }
  });

  it('keeps the taxi the sedan and the news van the van, with their sign and dish', () => {
    expect(modelOf('taxi')).toBe('sedan');
    expect(modelOf('news')).toBe('van');
    expect(modelOf('bus')).toBeNull();
    const sedan = triangles(parts.sedan);
    expect(triangles(parts.taxi)).toBe(sedan + 12);
    expect(parts.news.stripe).toBeDefined();
    expect(parts.news.metal).toBeDefined();
  });

  it('gives each colour of car one of the three cars, the same each time', () => {
    const cars = new Set(CITY.traffic.tones.map((tone) => lookOf({ kind: 'car', tone })));
    expect(cars).toEqual(new Set(CARS.cars));
    for (const tone of CITY.traffic.tones) expect(lookOf({ kind: 'car', tone })).toBe(lookOf({ kind: 'car', tone }));
    expect(lookOf({ kind: 'van', tone: 'white', news: true })).toBe('news');
    expect(lookOf({ kind: 'taxi', tone: 'white' })).toBe('taxi');
  });
});
