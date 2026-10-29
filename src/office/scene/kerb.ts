// Rounded pavements and their kerbs (0.20.0): one extruded rounded rectangle for each size, shared by every block of that size.

import * as THREE from 'three';

/** How round the corner of a pavement is, how wide its kerb, and how far the kerb stands above the pavement. */
export const CORNER = 0.4;
export const KERB = { wide: 0.12, rise: 0.06 };

function outline(w: number, d: number, r: number, inset = 0): THREE.Path {
  const [x0, x1, y0, y1] = [-w / 2 + inset, w / 2 - inset, -d / 2 + inset, d / 2 - inset];
  const c = Math.max(0.01, Math.min(r - inset, (x1 - x0) / 2 - 0.001, (y1 - y0) / 2 - 0.001));
  const path = new THREE.Path();
  path.moveTo(x0 + c, y0);
  path.lineTo(x1 - c, y0);
  path.absarc(x1 - c, y0 + c, c, -Math.PI / 2, 0, false);
  path.lineTo(x1, y1 - c);
  path.absarc(x1 - c, y1 - c, c, 0, Math.PI / 2, false);
  path.lineTo(x0 + c, y1);
  path.absarc(x0 + c, y1 - c, c, Math.PI / 2, Math.PI, false);
  path.lineTo(x0, y0 + c);
  path.absarc(x0 + c, y0 + c, c, Math.PI, Math.PI * 1.5, false);
  return path;
}

const shapeOf = (w: number, d: number, r: number) => new THREE.Shape(outline(w, d, r).getPoints(6));
const cache = new Map<string, THREE.BufferGeometry>();

function extruded(key: string, shape: THREE.Shape, height: number): THREE.BufferGeometry {
  let geometry = cache.get(key);
  if (!geometry) {
    geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 6 });
    // The extrusion runs along z; stand it up so that it rises from y = 0 to its height, and its outline lies on the ground.
    geometry.rotateX(-Math.PI / 2);
    cache.set(key, geometry);
  }
  return geometry;
}

/** A slab of this size with rounded corners, from y = 0 to `height`, centred on the origin. */
export const slabGeometry = (w: number, d: number, height: number) => extruded(`s${w}:${d}:${height}`, shapeOf(w, d, CORNER), height);

/** The kerb round such a slab: a rounded ring along its edge, from y = 0 to `height`. */
export function kerbGeometry(w: number, d: number, height: number): THREE.BufferGeometry {
  const shape = shapeOf(w, d, CORNER);
  shape.holes.push(new THREE.Path(outline(w, d, CORNER, Math.min(KERB.wide, w / 3, d / 3)).getPoints(6)));
  return extruded(`k${w}:${d}:${height}`, shape, height);
}
