// The kits paint their models with one colour map, a grid of swatches; a face takes the colour of the swatch its corners' UV point at.
// So the swatch says what a face is (asphalt, kerb, glass, tyre), and that is how a model is cut into the parts we colour ourselves.

import * as THREE from 'three';

/** The swatch of the colour map the face that starts at index `i` is painted with: its column and row, from the top left. */
export function swatchOf(geometry: THREE.BufferGeometry, i: number, across: number, down: number): [number, number] {
  const index = geometry.index!;
  const uv = geometry.getAttribute('uv');
  const a = index.getX(i);
  return [Math.floor(uv.getX(a) * across), Math.floor(uv.getY(a) * down)];
}

/**
 * The faces of an indexed geometry sorted into `count` lists of vertex indices, by the swatch each face has in a map `across` swatches wide
 * and `down` high. `pick` says which list a swatch goes in.
 */
export function listsBySwatch(source: THREE.BufferGeometry, pick: (column: number, row: number) => number, count: number, across: number, down: number): number[][] {
  const lists: number[][] = Array.from({ length: count }, () => []);
  const index = source.index;
  if (!index || !source.getAttribute('uv')) return lists;
  for (let i = 0; i < index.count; i += 3) {
    const [column, row] = swatchOf(source, i, across, down);
    lists[pick(column, row)]!.push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
  }
  return lists;
}
